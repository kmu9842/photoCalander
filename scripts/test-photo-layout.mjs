import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-photo-layout-'));
const { CalendarStore } = createRequire(import.meta.url)('../electron/store.cjs');
const store = new CalendarStore(directory);
// Legacy unframed layout remains covered; framed layouts are in test-themes.
store.saveSettings({ ...store.data.settings, theme: 'light', showHolidays: false });
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let app;
try {
  const create = color => sharp({ create: { width: 600, height: 100, channels: 3, background: color } });
  const bright = path.join(directory, 'bright.png'), dark = path.join(directory, 'dark.png'), crop = path.join(directory, 'center.png');
  await create('#ffffff').png().toFile(bright);
  await create('#080808').png().toFile(dark);
  await create('#ffffff').composite([{ input: await sharp({ create: { width: 200, height: 100, channels: 3, background: '#080808' } }).png().toBuffer(), left: 200, top: 0 }]).png().toFile(crop);
  app = await electron.launch(process.argv.includes('--packaged')
    ? { executablePath: path.join(root, 'release/win-unpacked/Photo Calendar.exe'), args: [], env }
    : { args: [root], env });
  const page = await app.firstWindow();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await expect(page.locator('.calendar')).toBeVisible();
  const month = (await page.locator('.is-today').getAttribute('data-date')).slice(0, 7);
  await page.evaluate(async ({ month, paths }) => {
    const photos = await window.calendar.importPhotos(paths.map(path => ({ name: path.split(/[\\/]/).pop(), path })));
    const base = { text: '회의\n준비', strikes: [], textColors: [{ from: 0, to: 2, color: '#ff0000' }], textSizes: [{ from: 0, to: 2, size: 16 }], fontSize: 14, color: 'none' };
    for (const [day, size, index] of [[11, 'large', 0], [12, 'large', 1], [13, 'medium', 0], [14, 'small', 1], [15, 'large', 2], [16, 'small', 0], [17, 'large', 1]]) {
      await window.calendar.saveDay(`${month}-${day}`, { ...base, photoSize: size, photos: day === 17 ? [photos[1], photos[2], photos[3], photos[0]] : [photos[index]], ...(day === 16 ? { text: Array.from({ length: 20 }, (_, i) => `${i + 1}번째 일정`).join('\n') } : {}) });
    }
  }, { month, paths: [bright, dark, crop, dark] });
  await page.reload();
  const cell = day => page.locator(`[data-date="${month}-${day}"]`);
  const fullCell = async day => {
    const outer = await cell(day).boundingBox(), photos = await cell(day).locator('.cell-photos').boundingBox();
    assert.ok(Math.abs(photos.x - outer.x) < 1 && Math.abs(photos.y - outer.y) < 1, 'Large photo starts at the cell edge');
    assert.ok(Math.abs(photos.width - outer.width) <= 1 && Math.abs(photos.height - outer.height) <= 1, 'Large photo fills the cell including the date header');
    for (const img of await cell(day).locator('img').all()) {
      await expect(img).toHaveCSS('object-fit', 'cover');
      await expect(img).toHaveCSS('object-position', '50% 50%');
    }
  };
  for (const [day, tone, color] of [[11, 'dark', 'rgb(17, 17, 17)'], [12, 'light', 'rgb(255, 255, 255)'], [15, 'light', 'rgb(255, 255, 255)']]) {
    await fullCell(day);
    await expect(cell(day).locator('.cell-photos')).toHaveAttribute('data-text-tone', tone);
    await expect(cell(day).getByText('회의', { exact: true })).toHaveCSS('color', color);
    await expect(cell(day).locator('.date-number')).toHaveCSS('color', color);
    await expect(cell(day).getByText('회의', { exact: true })).toHaveCSS('font-size', '16px');
  }
  await fullCell(17);
  await expect(cell(17).locator('.more-photos')).toHaveText('+1');
  await expect(cell(13).locator('img')).toHaveCSS('object-fit', 'contain');
  const content = await cell(13).locator('.day-content').boundingBox();
  assert.ok(Math.abs((await cell(13).locator('.cell-photos').boundingBox()).height - content.height * .6) < 1, 'Medium retains 60%');

  const priority = async () => {
    const layout = await cell(16).evaluate(el => {
      const notes = el.querySelector('.cell-notes'), content = el.querySelector('.day-content'), photo = el.querySelector('.cell-photos');
      return { notes: notes.getBoundingClientRect().height, content: content.getBoundingClientRect().height, photo: photo.getBoundingClientRect().height, inHeader: !!photo.closest('.day-top'), scroll: notes.scrollHeight, client: notes.clientHeight };
    });
    assert.ok(layout.notes >= layout.content - 1, 'Long text gets all available space in small mode');
    assert.equal(layout.photo, 28, 'Small photo is a thumbnail slightly bigger than the 22px add button');
    assert.ok(layout.inHeader, 'Small photo occupies the add-icon position without consuming text space');
    assert.ok(layout.scroll > layout.client, 'Remaining text is scrollable');
  };
  await priority();
  await cell(13).locator('.day-date').click();
  const sizes = page.getByRole('group', { name: '날짜 사진 크기' });
  const start = await cell(13).locator('.note-text').boundingBox();
  for (const label of ['소', '대', '중']) {
    await sizes.getByRole('button', { name: label, exact: true }).click();
    const notes = await cell(13).locator('.note-text').boundingBox();
    assert.equal(notes.x, start.x, 'Photo size does not move text horizontally');
    assert.equal(notes.y, start.y, 'Photo size does not move text vertically');
    assert.equal(notes.width, start.width, 'Photo size does not rewrap text');
  }
  await expect(cell(13).getByText('회의', { exact: true })).toHaveCSS('color', 'rgb(255, 0, 0)');
  await page.keyboard.press('Escape');
  await expect(page.locator('.widget')).toHaveClass(/editor-closed\b/);
  await cell(14).locator('.cell-photo').hover();
  const popup = page.getByRole('tooltip');
  await expect(popup).toBeVisible();
  const thumbnailCell = await cell(14).boundingBox(), preview = await popup.boundingBox();
  assert.ok(preview.width > thumbnailCell.width && preview.height > thumbnailCell.height, 'Hover preview is larger than a date cell');
  assert.ok(preview.width <= thumbnailCell.width * 1.21 && preview.height <= thumbnailCell.height * 1.21, 'Hover preview is only slightly larger');
  await popup.hover();
  await expect(popup).toBeVisible();
  await page.screenshot({ path: path.join(root, 'test-results/photo-hover.png') });
  await popup.getByRole('button').click();
  await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeVisible();
  await expect(popup).toHaveCount(0);
  await page.keyboard.press('Escape');
  await cell(16).locator('.cell-photo').focus();
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await cell(15).locator('.cell-photo').click({ position: { x: 4, y: 80 } });
  await expect(page.locator('.lightbox-image img')).toHaveCSS('object-fit', 'contain');
  await page.keyboard.press('Escape');

  for (const [width, height] of [[800, 580], [1250, 820]]) {
    await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), { width, height });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    await fullCell(15);
    await priority();
    // Actual crop pixels: the white ends of this panorama must be outside the cell.
    const image = cell(15).locator('img');
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const box = await image.boundingBox();
    const sample = await page.screenshot({ clip: { x: box.x + 2, y: box.y + box.height - 4, width: Math.floor(box.width - 4), height: 2 } });
    const { channels } = await sharp(sample).stats();
    assert.ok(channels.slice(0, 3).every(channel => channel.mean < 35), 'Centered cover renders the dark center, without white letterboxing');
  }
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/photo-layout.png') });
  const badPathRejected = await page.evaluate(async () => { try { await window.calendar.photoLuminance('../calendar.json', 1); return false; } catch { return true; } });
  assert.ok(badPathRejected, 'Photo analysis rejects paths outside the photo store');
  assert.deepEqual(failures, []);
  console.log('PASS: full-cell centered photos, automatic contrast, stable rich text, medium size, small header thumbnails, hover/focus preview, collages, lightbox and compact windows.');
} catch (error) {
  if (app) await (await app.firstWindow()).screenshot({ path: path.join(root, 'test-results/photo-layout-failure.png') }).catch(() => {});
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-photo-layout-')) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

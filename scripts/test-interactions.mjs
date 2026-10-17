import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-interactions-'));
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let app;
// Red and blue ends must both remain visible, even for extreme aspect ratios.
async function fixture(width, height) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = width > height ? x / width : y / height;
    const offset = (y * width + x) * 3;
    pixels[offset + (p < .2 ? 0 : p > .8 ? 2 : 1)] = 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}
async function assertWholeImage(locator, expectedRatio) {
  await expect.poll(() => locator.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await locator.hover({ force: true });
  const { data, info } = await sharp(await locator.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let red = 0, blue = 0, left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 180 && g < 60 && b < 60) red++;
    if (b > 180 && r < 60 && g < 60) blue++;
    if (Math.max(r, g, b) > 180 && Math.min(r, g, b) < 60) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  assert.ok(red > 3 && blue > 3, `Both original ends must be visible (${red} red, ${blue} blue pixels)`);
  const ratio = (right - left + 1) / (bottom - top + 1);
  assert.ok(Math.abs(ratio / expectedRatio - 1) < .18, `Photo ratio ${ratio} should remain ${expectedRatio}`);
}
try {
  app = await electron.launch(process.argv.includes('--packaged')
    ? { executablePath: path.join(root, 'release/win-unpacked/Photo Calendar.exe'), args: [], env }
    : { args: [root], env });
  const page = await app.firstWindow();
  const today = page.locator('.day-cell.is-today');
  const editor = page.locator('.day-editor');
  const clickOutside = async (locator, x = 30, y = 17) => {
    const box = await locator.boundingBox();
    // Use the user's actual coordinates; the dismiss layer must consume this click.
    await page.mouse.click(box.x + Math.min(x, box.width / 2), box.y + Math.min(y, box.height / 2));
    await expect(editor).toHaveCount(0);
  };
  await today.click({ position: { x: 30, y: 17 } });
  await expect(editor).toBeVisible();
  await page.locator('.editor-heading h2').click();
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: '색상 팔레트', exact: true }).click();
  await page.getByRole('button', { name: '#e5e7eb 색상', exact: true }).click();
  await expect(editor).toBeVisible();
  await clickOutside(page.locator('.weekdays'));
  await today.click({ position: { x: 30, y: 17 } });
  const other = page.locator('.day-cell:not(.is-today)').nth(12);
  await clickOutside(other);
  await expect(other).toHaveAttribute('aria-selected', 'false');
  await other.click({ position: { x: 30, y: 17 } });
  await expect(other).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toBeVisible();
  await clickOutside(today);
  await today.click({ position: { x: 30, y: 17 } });
  await clickOutside(page.locator('.month-header'), 250, 40);
  await today.click({ position: { x: 30, y: 17 } });
  await clickOutside(page.locator('.titlebar'), 250, 17);
  await today.click({ position: { x: 30, y: 17 } });

  // Actual native focus change, rather than a synthetic JS blur event.
  await app.evaluate(async ({ BrowserWindow }) => {
    globalThis.__outsideTestWindow = new BrowserWindow({ width: 200, height: 150, show: false });
    await globalThis.__outsideTestWindow.loadURL('data:text/html,<title>Outside click test</title>');
    globalThis.__outsideTestWindow.show();
    globalThis.__outsideTestWindow.focus();
  });
  await expect(editor).toHaveCount(0);
  await app.evaluate(({ BrowserWindow }) => { globalThis.__outsideTestWindow.destroy(); delete globalThis.__outsideTestWindow; BrowserWindow.getAllWindows()[0].focus(); });
  await today.click({ position: { x: 30, y: 17 } });

  const date = await today.getAttribute('data-date');
  const wide = await fixture(600, 120), tall = await fixture(120, 600);
  const drop = async (bytes, name) => {
    const transfer = await page.evaluateHandle(({ encoded, name }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], name, { type: 'image/png' }));
      return transfer;
    }, { encoded: bytes.toString('base64'), name });
    await editor.dispatchEvent('drop', { dataTransfer: transfer });
    await transfer.dispose();
  };
  await drop(wide, 'wide.png');
  await expect(today.locator('img')).toHaveCount(1);
  await assertWholeImage(today.locator('img').first(), 5);
  await assertWholeImage(editor.locator('img').first(), 5);
  const photoBox = await editor.locator('.editor-photo').first().boundingBox();
  const imageBox = await editor.locator('img').first().boundingBox();
  const editorBox = await editor.boundingBox();
  assert.ok(Math.abs(photoBox.height - imageBox.height) < 1, 'Photo container follows the image height without a reserved blank slot');
  assert.ok(Math.abs(imageBox.width / imageBox.height - 5) < .02, 'Image element itself follows the original ratio');
  assert.ok(editorBox.y + editorBox.height - photoBox.y - photoBox.height <= 9, 'Editor ends immediately after the photos');
  // Read compositor alpha at empty points, not just a CSS declaration.
  const emptyPoints = [
    { x: editorBox.x + 5, y: editorBox.y + editorBox.height - 4 },
    { x: editorBox.x + editorBox.width / 2, y: editorBox.y + editorBox.height + 30 },
  ];
  const sampleAlpha = async () => app.evaluate(async ({ BrowserWindow }, points) => {
    const window = BrowserWindow.getAllWindows()[0];
    const capture = await window.webContents.capturePage();
    const size = capture.getSize();
    const [width] = window.getContentSize();
    const scale = size.width / width;
    const bitmap = capture.toBitmap();
    return points.map(point => bitmap[(Math.round(point.y * scale) * size.width + Math.round(point.x * scale)) * 4 + 3]);
  }, emptyPoints);
  for (const opacity of [30, 60, 0, 30]) {
    await page.keyboard.press('Control+,');
    const settingsDialog = page.getByRole('dialog', { name: '위젯 설정' });
    await settingsDialog.getByRole('button', { name: '달력 배경색', exact: true }).click();
    await page.getByRole('group', { name: '달력 배경색 팔레트' }).getByRole('button', { name: '#bfdbfe 색상', exact: true }).click();
    const opacitySlider = settingsDialog.getByRole('slider', { name: '배경 불투명도' });
    await opacitySlider.press('Home');
    for (let value = 0; value < opacity; value += 10) await opacitySlider.press('PageUp');
    await expect(opacitySlider).toHaveValue(String(opacity));
    await settingsDialog.getByRole('button', { name: '설정 닫기', exact: true }).click();
    await expect(editor).toBeVisible();
    await expect.poll(sampleAlpha).toEqual([Math.round(255 * opacity / 100), Math.round(255 * opacity / 100)]);
  }
  await page.screenshot({ path: path.join(root, 'test-results/photo-spacing-transparency.png'), omitBackground: true });
  // The space below the compact panel is outside it and must dismiss editing.
  await page.mouse.click(emptyPoints[1].x, emptyPoints[1].y);
  await expect(editor).toHaveCount(0);
  await today.click({ position: { x: 30, y: 17 } });
  await drop(tall, 'tall.png');
  await expect(today.locator('img')).toHaveCount(2);
  await assertWholeImage(today.locator('img').nth(0), 5);
  await assertWholeImage(today.locator('img').nth(1), .2);
  await assertWholeImage(editor.locator('img').nth(1), .2);
  await drop(wide, 'wide-second.png');
  await expect(today.locator('img')).toHaveCount(3);
  for (const [i, ratio] of [5, .2, 5].entries()) await assertWholeImage(today.locator('img').nth(i), ratio);
  await page.getByRole('textbox', { name: '메모 내용' }).fill('사진과 함께');
  await assertWholeImage(today.locator('img').first(), 5);
  await page.getByRole('button', { name: 'tall.png 크게 보기', exact: true }).click();
  await assertWholeImage(page.locator('.lightbox-image img'), .2);
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const stored = JSON.parse(fs.readFileSync(path.join(directory, 'calendar.json'), 'utf8'));
  assert.deepEqual(fs.readFileSync(path.join(directory, 'photos', stored.days[date].photos[0].file)), wide, 'Stored original is byte-for-byte unchanged');
  await clickOutside(page.locator('.weekdays'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 580));
  for (const [i, ratio] of [5, .2, 5].entries()) await assertWholeImage(today.locator('img').nth(i), ratio);
  await page.screenshot({ path: path.join(root, 'test-results/uncropped-photos.png'), omitBackground: true });
  await page.getByRole('button', { name: '바탕화면에 고정', exact: true }).click();
  await expect(page.getByRole('button', { name: '바탕화면 고정 해제', exact: true })).toBeVisible();
  await today.click({ position: { x: 30, y: 17 } });
  await expect(editor).toBeVisible();
  const compactEditor = await editor.boundingBox();
  const available = await page.locator('.calendar-and-editor').boundingBox();
  assert.ok(compactEditor.height <= available.height + 1, 'Compact editor stays within the widget and scrolls its content');
  await editor.locator('.editor-photo').last().scrollIntoViewIfNeeded();
  await expect(editor.locator('.editor-photo').last()).toBeInViewport();
  await app.evaluate(async ({ BrowserWindow }) => {
    globalThis.__outsideTestWindow = new BrowserWindow({ width: 200, height: 150, show: false });
    await globalThis.__outsideTestWindow.loadURL('data:text/html,<title>Outside click test</title>');
    globalThis.__outsideTestWindow.show();
    globalThis.__outsideTestWindow.focus();
  });
  await expect(editor).toHaveCount(0);
  await app.evaluate(() => { globalThis.__outsideTestWindow.destroy(); delete globalThis.__outsideTestWindow; });
  console.log('PASS: photo-height editor with no reserved bottom space, real 0/30/60% background alpha, outside dismissal, uncropped landscape/portrait photos, compact scrolling, unchanged originals.');
} catch (error) {
  if (app) await (await app.firstWindow()).screenshot({ path: path.join(root, 'test-results/interactions-failure.png') }).catch(() => {});
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-interactions-')) fs.rmSync(directory, { recursive: true, force: true });
}

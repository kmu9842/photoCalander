import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const { CalendarStore } = createRequire(import.meta.url)('../electron/store.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-layout-'));
const store = new CalendarStore(directory);
store.saveSettings({ ...store.data.settings, showHolidays: false });
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let app;
const failures = [];
const bounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
const launch = async () => {
  app = await electron.launch(process.argv.includes('--packaged')
    ? { executablePath: path.join(root, 'release/win-unpacked/Photo Calendar.exe'), args: [], env }
    : { args: [root], env });
  const page = await app.firstWindow();
  page.on('pageerror', error => failures.push(error.message));
  await expect(page.locator('.calendar')).toBeVisible();
  return page;
};
const savedBounds = () => {
  try { return JSON.parse(fs.readFileSync(path.join(directory, 'window.json'), 'utf8')); }
  catch { return null; }
};
try {
  let page = await launch();
  const startFrames = () => page.evaluate(() => {
    const recording = { active: true, frames: [] };
    window.__panelRecording = recording;
    const sample = () => {
      if (!recording.active) return;
      const calendar = document.querySelector('.calendar').getBoundingClientRect();
      const widget = document.querySelector('.widget');
      const editor = document.querySelector('.day-editor');
      recording.frames.push({ calendar: { x: calendar.x, y: calendar.y, width: calendar.width, height: calendar.height }, width: widget.getBoundingClientRect().width,
        opacity: editor ? Number(getComputedStyle(editor).opacity) : null,
        slide: editor ? new DOMMatrixReadOnly(getComputedStyle(editor).transform).m41 : null });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const stopFrames = () => page.evaluate(() => { window.__panelRecording.active = false; return window.__panelRecording.frames; });
  const checkFrames = (frames, calendar, baseWidth, reducedMotion = false) => {
    assert.ok(frames.length > 0, 'Captured rendered frames');
    for (const frame of frames) {
      assert.deepEqual(frame.calendar, calendar, 'Calendar must stay fixed in every frame, including native resizing');
      if (frame.opacity !== null) assert.equal(frame.opacity, 1, 'Editor must slide without fading or flashing');
    }
    if (!reducedMotion) {
      if (!frames.some(frame => frame.slide < -1 && frame.slide > -311)) {
        fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
        fs.writeFileSync(path.join(root, 'test-results/slide-frames.json'), JSON.stringify(frames, null, 2));
      }
      assert.ok(frames.some(frame => frame.width > baseWidth + 1 && frame.width < baseWidth + 311), 'Surface expands/collapses through intermediate widths');
      assert.ok(frames.some(frame => frame.slide < -1 && frame.slide > -311), 'Editor slides through intermediate positions');
    }
  };
  const checkEditor = async (width, rightEdge = false) => {
    await app.evaluate(({ BrowserWindow, screen }, { width, rightEdge }) => {
      const area = screen.getPrimaryDisplay().workArea;
      BrowserWindow.getAllWindows()[0].setBounds({ x: area.x + (rightEdge ? area.width - width - 5 : 40), y: area.y + 30, width, height: 620 });
    }, { width, rightEdge });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    const before = await bounds();
    const calendar = await page.locator('.calendar').boundingBox();
    const monthHeader = await page.locator('.month-header').boundingBox();
    const dateFont = await page.locator('.date-number').first().evaluate(el => getComputedStyle(el).fontSize);
    const baseWidth = (await page.locator('.widget').boundingBox()).width;
    await startFrames();
    await page.locator('.day-cell.is-today').click({ position: { x: 30, y: 17 } });
    await expect(page.locator('.widget')).toHaveClass(/editor-open\b/);
    checkFrames(await stopFrames(), calendar, baseWidth);
    await expect(page.locator('.day-editor')).toBeVisible();
    await expect.poll(async () => (await bounds()).width).toBe(before.width + 312);
    await expect.poll(() => page.locator('.calendar').boundingBox()).toEqual(calendar);
    await expect(page.locator('.date-number').first()).toHaveCSS('font-size', dateFont);
    assert.deepEqual(await page.locator('.month-header').boundingBox(), monthHeader, 'Header keeps the calendar width');
    await expect(page.locator('.day-editor')).toBeInViewport({ ratio: 1 });
    const editor = await page.locator('.day-editor').boundingBox();
    assert.ok(editor.x >= calendar.x + calendar.width, 'Editor sits beside the unchanged calendar');
    await expect.poll(savedBounds).toEqual(before);
    // Repeated requests must not grow the window again.
    await page.evaluate(() => window.calendar.setEditorOpen(true));
    assert.equal((await bounds()).width, before.width + 312);
    await startFrames();
    await page.keyboard.press('Escape');
    await expect(page.locator('.widget')).toHaveClass(/editor-closed\b/);
    checkFrames(await stopFrames(), calendar, baseWidth);
    await expect(page.locator('.day-editor')).toHaveCount(0);
    await expect.poll(bounds).toEqual(before);
    await expect.poll(() => page.locator('.calendar').boundingBox()).toEqual(calendar);
  };
  await checkEditor(800);
  await checkEditor(1100);
  await checkEditor(900, true);

  const beforeRapid = await bounds();
  await page.locator('.day-cell.is-today').click({ position: { x: 30, y: 17 } });
  await page.keyboard.press('Escape');
  await expect(page.locator('.widget')).toHaveClass(/editor-closed\b/);
  await expect.poll(bounds).toEqual(beforeRapid);
  await page.locator('.day-cell.is-today').click({ position: { x: 30, y: 17 } });
  await expect(page.locator('.widget')).toHaveClass(/editor-open\b/);
  const reversalCalendar = await page.locator('.calendar').boundingBox();
  await startFrames();
  await page.keyboard.press('Escape');
  await page.locator('.day-cell.is-today').dispatchEvent('click');
  await expect(page.locator('.widget')).toHaveClass(/editor-open\b/);
  checkFrames(await stopFrames(), reversalCalendar, 0, true);
  assert.equal((await bounds()).width, beforeRapid.width + 312, 'Reversing close does not expand the native window twice');
  await page.keyboard.press('Escape');
  await expect(page.locator('.widget')).toHaveClass(/editor-closed\b/);
  await expect.poll(bounds).toEqual(beforeRapid);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedCalendar = await page.locator('.calendar').boundingBox();
  await startFrames();
  await page.locator('.day-cell.is-today').click({ position: { x: 30, y: 17 } });
  await expect(page.locator('.widget')).toHaveClass(/editor-open\b/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.widget')).toHaveClass(/editor-closed\b/);
  checkFrames(await stopFrames(), reducedCalendar, 0, true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.getByRole('button', { name: '위젯 설정', exact: true }).click();
  const spinner = page.getByRole('spinbutton', { name: '전체 글자 크기' });
  await expect(spinner).toHaveValue('13');
  const savedFontSize = () => page.evaluate(async () => (await window.calendar.load()).settings.fontSize);
  await spinner.press('ArrowUp');
  await expect.poll(savedFontSize).toBe(14);
  await spinner.press('ArrowDown');
  await expect.poll(savedFontSize).toBe(13);
  await spinner.fill('48');
  await expect.poll(savedFontSize).toBe(48);
  await spinner.press('ArrowUp');
  await expect(spinner).toHaveValue('48');
  await spinner.fill('8');
  await expect.poll(savedFontSize).toBe(8);
  await spinner.press('ArrowDown');
  await expect(spinner).toHaveValue('8');
  for (const invalid of ['7', '49', '13.5', '']) {
    await spinner.fill(invalid);
    await spinner.press('Tab');
    await expect(spinner).toHaveValue('8');
    assert.equal(await savedFontSize(), 8, 'Invalid draft must not be saved');
  }
  await spinner.fill('13');
  await expect.poll(savedFontSize).toBe(13);
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();

  await page.getByRole('button', { name: '바탕화면에 고정', exact: true }).click();
  await expect(page.getByRole('button', { name: '바탕화면 고정 해제', exact: true })).toBeVisible();
  await checkEditor(800);
  await page.getByRole('button', { name: '바탕화면 고정 해제', exact: true }).click();
  await expect(page.getByRole('button', { name: '바탕화면에 고정', exact: true })).toBeVisible();

  const beforeRestart = await bounds();
  await page.locator('.day-cell.is-today').click({ position: { x: 30, y: 17 } });
  await expect.poll(async () => (await bounds()).width).toBe(beforeRestart.width + 312);
  await expect.poll(savedBounds).toEqual(beforeRestart);
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/expanded-editor.png') });
  await app.close();
  app = null;
  page = await launch();
  assert.deepEqual(await bounds(), beforeRestart, 'Restart restores calendar dimensions, excluding the temporary editor');
  await expect(page.locator('.day-editor')).toHaveCount(0);
  assert.deepEqual(failures, []);
  console.log('PASS: frame-by-frame stable calendar, opaque slide in/out, rapid dismissal and reduced motion, native window restoration, screen edges, desktop mode, saved bounds and font spinner.');
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-layout-')) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

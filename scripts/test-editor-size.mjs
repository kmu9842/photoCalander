import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-editor-size-'));
const { CalendarStore } = createRequire(import.meta.url)('../electron/store.cjs');
const store = new CalendarStore(directory);
store.saveSettings({ ...store.data.settings, showHolidays: false, fontSize: 12 });
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let app;
try {
  app = await electron.launch(process.argv.includes('--packaged')
    ? { executablePath: path.join(root, 'release/win-unpacked/Photo Calendar.exe'), args: [], env }
    : { args: [root], env });
  const page = await app.firstWindow();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  const widget = page.locator('.widget');
  const bounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const open = async () => { await page.locator('.is-today .day-date').click(); await expect(widget).toHaveClass(/editor-open\b/); };
  const closed = () => expect(widget).toHaveClass(/editor-closed\b/);
  const saved = () => JSON.parse(fs.readFileSync(path.join(directory, 'window.json'), 'utf8'));
  const reset = async () => {
    await app.evaluate(({ BrowserWindow, screen }) => {
      const area = screen.getPrimaryDisplay().workArea;
      BrowserWindow.getAllWindows()[0].setBounds({ x: area.x + 60, y: area.y + 60, width: 1133, height: 809 });
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1133);
    return bounds();
  };
  await expect(page.locator('.calendar')).toBeVisible();
  for (const mode of ['normal', 'desktop']) {
    if (mode === 'desktop') {
      await page.getByRole('button', { name: '바탕화면에 고정', exact: true }).click();
      await expect(page.getByRole('button', { name: '바탕화면 고정 해제', exact: true })).toBeVisible();
    }
    const initial = await reset();
    const calendar = await page.locator('.calendar').boundingBox();
    for (let cycle = 0; cycle < 12; cycle++) {
      await open();
      if (cycle % 3 === 0) await page.getByRole('button', { name: '편집 닫기', exact: true }).click();
      else if (cycle % 3 === 1) await page.locator('.editor-dismiss-layer').click({ position: { x: 200, y: 200 } });
      else await page.keyboard.press('Escape');
      await closed();
      assert.deepEqual(await bounds(), initial, `${mode}: native width and height after cycle ${cycle}`);
      assert.deepEqual(await page.locator('.calendar').boundingBox(), calendar, `${mode}: calendar width and height after cycle ${cycle}`);
    }
    await expect.poll(saved).toEqual(initial);

    // A press on a resize handle dismisses the editor. Releasing it after the
    // slide must not restore the obsolete expanded rectangle (even with no drag).
    for (const [edge, dx, dy] of [['se', 0, 0], ['se', 5, 7], ['nw', -7, -5]]) {
      const before = await reset();
      await open();
      const grip = await page.locator(`.resize-${edge}`).boundingBox();
      const point = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await closed();
      if (dx || dy) await page.mouse.move(point.x + dx, point.y + dy);
      const expected = { x: before.x + (edge.includes('w') ? dx : 0), y: before.y + (edge.includes('n') ? dy : 0), width: before.width + (edge.includes('w') ? -dx : dx), height: before.height + (edge.includes('n') ? -dy : dy) };
      if (edge === 'nw') {
        await expect.poll(bounds).toEqual(expected);
        // Playwright uses client coordinates. Keep the same physical cursor
        // position when the top/left edge changes the window's screen origin.
        await page.mouse.move(point.x + dx + before.x - expected.x, point.y + dy + before.y - expected.y);
      }
      await page.mouse.up();
      await expect.poll(bounds, { message: `${mode}: only the requested ${dx}px / ${dy}px drag may change the calendar` }).toEqual(expected);
      await expect.poll(saved).toEqual(expected);
      for (let cycle = 0; cycle < 3; cycle++) {
        await open(); await page.keyboard.press('Escape'); await closed();
        assert.deepEqual(await bounds(), expected, 'Resized calendar must not grow on subsequent close cycles');
      }
    }
  }
  assert.deepEqual(failures, []);
  console.log('PASS: repeated close-button/outside/Escape cycles keep both dimensions; held resize press and drag during panel collapse preserve only the requested resize in normal/desktop modes, including saved bounds.');
} catch (error) {
  if (app) await (await app.firstWindow()).screenshot({ path: path.join(root, 'test-results/editor-size-failure.png') }).catch(() => {});
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-editor-size-')) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

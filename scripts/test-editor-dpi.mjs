import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-dpi-'));
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
let app;
try {
  for (const scale of process.argv.some(arg => arg.startsWith('--scale=')) ? [Number(process.argv.find(arg => arg.startsWith('--scale=')).split('=')[1])] : [1, 1.25, 1.5, 1.75, 2]) {
    const args = [`--force-device-scale-factor=${scale}`];
    app = await electron.launch(process.argv.includes('--packaged') ? { executablePath: path.join(root, 'release/win-unpacked/Photo Calendar.exe'), args, env } : { args: [...args, root], env });
    const page = await app.firstWindow();
    await expect(page.locator('.calendar')).toBeVisible();
    await app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows()[0], area = screen.getPrimaryDisplay().workArea;
      const send = win.webContents.send.bind(win.webContents);
      win.webContents.send = (channel, ...args) => channel === 'window:blur' ? undefined : send(channel, ...args);
      win.setFocusable(false);
      win.setBounds({ x: area.x + 31, y: area.y + 31, width: Math.max(791, Math.min(1003, area.width - 62)), height: Math.max(563, Math.min(703, area.height - 62)) });
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    for (const mode of ['normal', 'desktop']) {
      if (mode === 'desktop') {
        await page.getByRole('button', { name: '바탕화면에 고정', exact: true }).click();
        await expect(page.getByRole('button', { name: '바탕화면 고정 해제', exact: true })).toBeVisible();
      }
      const before = await bounds();
      const calendar = await page.locator('.calendar').boundingBox();
      for (let i = 0; i < 5; i++) {
        await page.locator('.is-today .day-date').click();
        await expect(page.locator('.widget')).toHaveClass(/editor-open\b/);
        if (i % 2) await page.getByRole('button', { name: '편집 닫기', exact: true }).click();
        else await page.keyboard.press('Escape');
        await expect(page.locator('.widget')).toHaveClass(/editor-closed\b/);
        assert.deepEqual(await bounds(), before, `${scale * 100}% ${mode}: native bounds after date click ${i + 1}`);
        assert.deepEqual(await page.locator('.calendar').boundingBox(), calendar, `${scale * 100}% ${mode}: calendar after date click ${i + 1}`);
      }
    }
    await page.getByRole('button', { name: '바탕화면 고정 해제', exact: true }).click();
    console.log(`PASS: ${scale * 100}% scaling keeps native and calendar dimensions across repeated date clicks in normal and desktop modes.`);
    await app.close(); app = null;
  }
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-dpi-')) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

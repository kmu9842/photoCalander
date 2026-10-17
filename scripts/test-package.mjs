import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-package-'));
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let app;
try {
  const executablePath = path.join(root, 'release/win-unpacked/Photo Calendar.exe');
  app = await electron.launch({ executablePath, args: [], env, timeout: 60000 });
  const page = await app.firstWindow();
  await expect(page.locator('.widget')).toHaveClass(/theme-polaroid/);
  const settings = await page.evaluate(() => window.calendar.load());
  assert.equal(settings.settings.opacity, 30);
  assert.equal(settings.settings.theme, 'polaroid');
  // Check native decoders for every advertised format.
  const images = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d'); context.fillStyle = '#84ad93'; context.fillRect(0, 0, 16, 16);
    return [canvas.toDataURL('image/png'), canvas.toDataURL('image/jpeg'), canvas.toDataURL('image/webp'), 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'];
  });
  const imported = await page.evaluate(images => window.calendar.importPhotos(images.map((data, i) => ({ name: `format-${i}`, bytes: Uint8Array.from(atob(data.split(',')[1]), char => char.charCodeAt(0)).buffer }))), images);
  assert.equal(imported.length, 4, 'All advertised image formats decode and import');
  for (const photo of imported) assert.ok(fs.existsSync(path.join(directory, 'photos', photo.file)));
  await page.screenshot({ path: path.join(root, 'test-results/packaged-transparent.png'), omitBackground: true });
  await page.getByRole('button', { name: '바탕화면에 고정', exact: true }).click();
  await page.getByRole('button', { name: '바탕화면 고정 해제', exact: true }).click();
  await expect(page.getByRole('button', { name: '바탕화면에 고정', exact: true })).toBeVisible();
  console.log('PASS: packaged executable, first-launch transparent defaults, packaged native desktop hosting.');
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-package-')) fs.rmSync(directory, { recursive: true, force: true });
}

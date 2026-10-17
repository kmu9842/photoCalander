import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-privacy-'));
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
let app, page;
const failures = [];
async function launch() {
  app = await electron.launch(process.argv.includes('--packaged') ? { executablePath: path.join(root, 'release/win-unpacked/Photo Calendar.exe'), args: [], env } : { args: [root], env });
  page = await app.firstWindow(); page.on('pageerror', error => failures.push(error.message));
  await expect(page.locator('.calendar')).toBeVisible();
}
const data = () => page.evaluate(() => window.calendar.load());
const openSettings = async () => { await page.getByRole('button', { name: '위젯 설정', exact: true }).click(); await page.getByRole('tab', { name: '테마', exact: true }).click(); };
try {
  await launch();
  await expect(page.locator('.navigation .lucide-settings')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^(라이트|다크) 테마$/ })).toHaveCount(0);
  assert.equal((await data()).settings.privacyLocked, false);
  const date = await page.locator('.is-today').getAttribute('data-date');
  await page.evaluate(async date => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#777'; ctx.fillRect(0,0,160,160); ctx.fillStyle = '#eee'; ctx.fillRect(30,30,60,60);
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), char => char.charCodeAt(0)).buffer;
    const photos = await window.calendar.importPhotos([{ name: 'private-photo.png', bytes }]);
    await window.calendar.saveDay(date, { text: '개인 일정\n사진 정리하기', strikes: [], color: 'none', photos, photoSize: 'large', photoBlur: true });
  }, date);
  await page.reload();
  await openSettings();
  await page.getByRole('switch', { name: '달력 글자·선 블러', exact: true }).click();
  await page.getByRole('tab', { name: '화면', exact: true }).click();
  await page.getByRole('spinbutton', { name: '전체 글자 크기', exact: true }).fill('19');
  await page.getByRole('tab', { name: '테마', exact: true }).click();
  for (const name of ['라이트','다크','폴라로이드','아날로그']) {
    await page.getByRole('button', { name: `${name} 테마 적용`, exact: true }).click();
    await expect.poll(async () => (await data()).settings.fontSize).toBe(19);
    await expect(page.locator('.widget')).toHaveCSS('--font-size', '19px');
  }
  await page.getByRole('button', { name: '새 테마 만들기', exact: false }).click();
  await page.getByRole('textbox', { name: '테마 이름', exact: true }).fill('내 모노톤');
  await page.getByRole('button', { name: '저장하고 적용', exact: true }).click();
  await expect.poll(async () => (await data()).settings.theme).toBe('custom');
  assert.equal((await data()).settings.fontSize, 19);
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await expect(page.locator('.is-today .photo-image')).toHaveCSS('filter', 'none');
  await page.locator('.is-today .day-date').click();
  await expect(page.locator('.day-editor')).toBeVisible();
  const before = (await data()).days[date];
  await page.getByRole('button', { name: '달력 잠금', exact: true }).click();
  await expect(page.locator('.widget')).toHaveClass(/privacy-locked/);
  await expect(page.locator('.day-editor')).toHaveCount(0);
  await expect(page.locator('.calendar')).toHaveCSS('filter', 'blur(16px)');
  await expect(page.locator('.calendar')).toHaveAttribute('inert', '');
  await expect(page.locator('.month-header')).toHaveAttribute('inert', '');
  await page.keyboard.press('Control+,');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const box = await page.locator('.is-today').boundingBox();
  await page.mouse.click(box.x + 35, box.y + 20);
  await expect(page.locator('.day-editor')).toHaveCount(0);
  await page.locator('.is-today').dispatchEvent('drop', { dataTransfer: await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(['invalid'], 'blocked.png', { type: 'image/png' })); return data; }) });
  assert.deepEqual((await data()).days[date], before);
  await expect(page.locator('.widget')).toHaveClass(/editor-closed\b/);
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/privacy-locked.png') });
  await app.close(); app = null;
  await launch();
  await expect(page.locator('.widget')).toHaveClass(/privacy-locked/);
  assert.equal((await data()).settings.fontSize, 19);
  await page.getByRole('button', { name: '잠금 해제', exact: true }).click();
  await expect(page.locator('.widget')).not.toHaveClass(/privacy-locked/);
  await expect(page.locator('.calendar')).toHaveCSS('filter', 'none');
  await expect(page.locator('.is-today .photo-image')).toHaveCSS('filter', 'none');
  await page.locator('.is-today .day-date').click();
  await expect(page.getByRole('textbox', { name: '메모 내용' })).toHaveText('개인 일정사진 정리하기');
  assert.deepEqual((await data()).days[date], before);
  await page.keyboard.press('Escape');
  await expect(page.locator('.widget')).toHaveClass(/editor-closed\b/);
  await page.evaluate(async date => {
    const entry = (await window.calendar.load()).days[date];
    await window.calendar.saveDay(date, { ...entry, photoSize: 'small' });
  }, date);
  await page.reload();
  await page.locator('.is-today .photo-size-small .cell-photo').focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  // Keep focus on the small thumbnail while locking, so a blur event cannot mask a leaked portal.
  await page.getByRole('button', { name: '달력 잠금', exact: true }).dispatchEvent('click');
  await expect(page.locator('.widget')).toHaveClass(/privacy-locked/);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  assert.deepEqual(failures, []);
  console.log('PASS: gear settings icon, no top brightness button, font size survives all themes, whole-calendar privacy cover, blocked editing/drop/shortcuts, restart and unlock without data changes.');
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-privacy-')) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

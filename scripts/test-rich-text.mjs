import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-richtext-'));
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const legacy = JSON.stringify({ version: 2, days: { [date]: { text: '~~sfafas~~\n둘째 문단', photos: [], color: 'none' } }, settings: { theme: 'light', opacity: 30, weekStart: 0, fontSize: 13, windowMode: 'normal', startAtLogin: false } });
fs.writeFileSync(path.join(directory, 'calendar.json'), legacy);
let app;
try {
  app = await electron.launch({ args: [root], env });
  const page = await app.firstWindow();
  await page.locator('.day-cell.is-today').click({ position: { x: 30, y: 17 } });
  const memo = page.getByRole('textbox', { name: '메모 내용' });
  await expect(memo.locator(':scope > p')).toHaveText(['sfafas', '둘째 문단']);
  await expect(memo.locator('s')).toHaveText('sfafas');
  await expect(memo.locator('s')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(page.locator('.day-cell.is-today s')).toHaveText('sfafas');
  await page.screenshot({ path: path.join(root, 'test-results/real-strikethrough.png') });
  // Select the original struck word and remove formatting, without changing text.
  await memo.press('Control+Home');
  await memo.press('Control+Shift+ArrowRight');
  await memo.getByRole('checkbox', { name: '1번째 줄 완료', exact: true }).click();
  await expect(memo.locator('s')).toHaveCount(0);
  await expect(memo.locator(':scope > p')).toHaveText(['sfafas', '둘째 문단']);
  await memo.press('Control+z');
  await expect(memo.locator('s')).toHaveText('sfafas');
  // New literal tildes are ordinary text; there are no Markdown input rules.
  await memo.press('Control+End');
  await memo.press('Enter');
  await page.keyboard.insertText('~~직접 입력한 문자~~');
  await expect(memo.locator(':scope > p').last()).toHaveText('~~직접 입력한 문자~~');
  await expect(memo.locator('s')).toHaveCount(1);
  // A keyboard shortcut uses the same real formatting as the toolbar.
  await memo.press('Control+Home');
  await memo.press('Control+Shift+ArrowRight');
  await memo.press('Control+5');
  await expect(memo.locator('s')).toHaveCount(0);
  await memo.press('Control+5');
  await expect(memo.locator('s')).toHaveText('sfafas');
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(directory, 'calendar.json'), 'utf8')).version).toBe(3);
  await page.getByRole('button', { name: '편집 닫기', exact: true }).click();
  await page.locator('.day-cell.is-today').click({ position: { x: 30, y: 17 } });
  await expect(memo.locator(':scope > p')).toHaveText(['sfafas', '둘째 문단', '~~직접 입력한 문자~~']);
  await expect(memo.locator('s')).toHaveText('sfafas');
  console.log('PASS: legacy markup becomes actual visible strikethrough; toolbar, keyboard toggle, undo, multiline text, and literal new tildes survive reopening.');
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-richtext-')) fs.rmSync(directory, { recursive: true, force: true });
}

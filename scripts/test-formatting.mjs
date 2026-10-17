import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const { CalendarStore } = createRequire(import.meta.url)('../electron/store.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-formatting-'));
const store = new CalendarStore(directory);
store.saveSettings({ ...store.data.settings, showHolidays: false });
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let app;
const failures = [];
const launch = async () => {
  app = await electron.launch(process.argv.includes('--packaged')
    ? { executablePath: path.join(root, 'release/win-unpacked/Photo Calendar.exe'), args: [], env }
    : { args: [root], env });
  const page = await app.firstWindow();
  page.on('pageerror', error => failures.push(error.message));
  await expect(page.locator('.calendar')).toBeVisible();
  return page;
};
try {
  let page = await launch();
  const date = await page.locator('.day-cell.is-today').getAttribute('data-date');
  const cell = () => page.locator(`[data-date="${date}"]`);
  const saved = () => page.evaluate(async date => (await window.calendar.load()).days[date], date);
  await cell().click({ position: { x: 30, y: 17 } });
  let memo = page.getByRole('textbox', { name: '메모 내용' });
  const original = '첫 줄 중요\n둘째 줄 완료\n셋째 줄';
  await memo.fill(original);
  await page.getByRole('spinbutton', { name: '날짜 기본 글자 크기' }).fill('18');
  await expect(memo).toHaveCSS('font-size', '18px');
  await expect(cell().locator('.note-text')).toHaveCSS('font-size', '18px');

  await memo.press('Control+Home');
  for (let i = 0; i < 4; i++) await memo.press('ArrowRight');
  for (let i = 0; i < 2; i++) await memo.press('Shift+ArrowRight');
  assert.equal(await page.evaluate(() => getSelection().toString()), '중요');
  await page.getByRole('spinbutton', { name: '선택 글자 크기' }).fill('26');
  await expect(memo.getByText('중요', { exact: true })).toHaveCSS('font-size', '26px');
  await expect(cell().getByText('중요', { exact: true })).toHaveCSS('font-size', '26px');
  await expect.poll(async () => (await saved()).textSizes).toEqual([{ from: 4, to: 6, size: 26 }]);
  await memo.press('Control+z');
  await expect.poll(async () => (await saved()).textSizes).toBeUndefined();
  await memo.press('Control+y');
  await expect(memo.getByText('중요', { exact: true })).toHaveCSS('font-size', '26px');
  await memo.press('Control+a');
  await expect(page.getByRole('spinbutton', { name: '선택 글자 크기' })).toHaveValue('');
  await memo.press('Control+Home');
  await memo.press('ArrowDown');
  await memo.press('Home');
  await page.getByRole('button', { name: '현재 줄 취소선', exact: true }).click();
  await expect(memo.locator('s')).toHaveText('둘째 줄 완료');
  await expect(cell().locator('s')).toHaveText('둘째 줄 완료');
  await expect(page.getByRole('button', { name: '현재 줄 취소선', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await memo.press('Control+5');
  await expect(memo.locator('s')).toHaveCount(0);

  // Both normal and soft line breaks start an unstruck new line.
  await memo.press('Control+End');
  await memo.press('Control+5');
  await memo.press('Enter');
  await page.keyboard.insertText('새 줄');
  await expect(memo.locator('s')).toHaveText('셋째 줄');
  await memo.press('Control+5');
  await memo.press('Shift+Enter');
  await page.keyboard.insertText('다음 줄');
  await expect(memo.locator('s')).toHaveText(['셋째 줄', '새 줄']);
  await memo.press('Control+5');
  await expect(memo.locator('s')).toHaveText(['셋째 줄', '새 줄', '다음 줄']);
  await memo.press('Control+5');
  await expect(memo.locator('s')).toHaveText(['셋째 줄', '새 줄']);

  // Add a test photo without touching the user's clipboard or files.
  await page.evaluate(async date => {
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 120;
    const ctx = canvas.getContext('2d');
    for (let x = 0; x < 240; x += 12) { ctx.fillStyle = x % 24 ? '#215da8' : '#ffbf39'; ctx.fillRect(x, 0, 12, 120); }
    const encoded = canvas.toDataURL('image/png').split(',')[1];
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0)).buffer;
    const photos = await window.calendar.importPhotos([{ name: 'formatting.png', bytes }]);
    const data = await window.calendar.load();
    await window.calendar.saveDay(date, { ...data.days[date], photos });
  }, date);
  await page.reload();
  await cell().click({ position: { x: 30, y: 17 } });
  memo = page.getByRole('textbox', { name: '메모 내용' });
  const sizes = page.getByRole('group', { name: '날짜 사진 크기' });
  const heights = [];
  for (const label of ['소', '중', '대']) {
    await sizes.getByRole('button', { name: label, exact: true }).click();
    await expect(sizes.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    heights.push((await cell().locator('.cell-photos').boundingBox()).height);
  }
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2], `Small/medium/large allocations: ${heights}`);
  await page.getByRole('switch', { name: '날짜 사진 블러' }).click();
  await expect(cell().locator('.cell-photo img')).toHaveCSS('filter', 'blur(6px)');
  await expect(page.locator('.editor-photo img')).toHaveCSS('filter', 'none');
  await page.getByRole('button', { name: 'formatting.png 크게 보기', exact: true }).click();
  await expect(page.locator('.lightbox-image img')).toHaveCSS('filter', 'none');
  await page.keyboard.press('Escape');
  await expect.poll(async () => { const entry = await saved(); return [entry.fontSize, entry.photoSize, entry.photoBlur]; }).toEqual([18, 'large', true]);
  await page.keyboard.press('Escape');

  // Other dates inherit the global size; choosing a typing size affects new text only.
  const other = page.locator('.day-cell:not(.is-today)').nth(12);
  await other.click({ position: { x: 30, y: 17 } });
  await expect(page.getByRole('spinbutton', { name: '날짜 기본 글자 크기' })).toHaveValue('13');
  await page.getByRole('spinbutton', { name: '선택 글자 크기' }).fill('32');
  await memo.focus();
  await page.keyboard.insertText('별도 날짜');
  await expect(memo.getByText('별도 날짜', { exact: true })).toHaveCSS('font-size', '32px');
  await expect(page.getByRole('switch', { name: '날짜 사진 블러' })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');

  await app.close(); app = null;
  page = await launch();
  await cell().click({ position: { x: 30, y: 17 } });
  memo = page.getByRole('textbox', { name: '메모 내용' });
  await expect(memo).toHaveCSS('font-size', '18px');
  await expect(memo.getByText('중요', { exact: true })).toHaveCSS('font-size', '26px');
  await expect(memo.locator('s')).toHaveText(['셋째 줄', '새 줄']);
  await expect(page.getByRole('switch', { name: '날짜 사진 블러' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('group', { name: '날짜 사진 크기' }).getByRole('button', { name: '대', exact: true })).toHaveAttribute('aria-pressed', 'true');
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/date-formatting.png') });

  await page.getByRole('button', { name: '전체 설정', exact: true }).click();
  await expect(memo).toHaveCSS('font-size', '13px');
  await expect(memo.getByText('중요', { exact: true })).toHaveCSS('font-size', '26px');
  await memo.press('Control+a');
  await page.getByRole('button', { name: '날짜 기본', exact: true }).click();
  await expect.poll(async () => (await saved()).textSizes).toBeUndefined();
  assert.deepEqual(failures, []);
  console.log('PASS: independent date/character sizes, mixed selection, typing styles, undo/redo, current-line Ctrl+5, Enter/Shift+Enter boundaries, photo blur and size, reset, restart persistence.');
} catch (error) {
  if (app) await (await app.firstWindow()).screenshot({ path: path.join(root, 'test-results/formatting-failure.png') }).catch(() => {});
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-formatting-')) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

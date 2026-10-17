import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';

const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-import-'));
const { CalendarStore } = createRequire(import.meta.url)('../electron/store.cjs');
const store = new CalendarStore(directory);
store.saveSettings({ ...store.data.settings, showHolidays: false });
const date = new Date();
const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
store.saveDay(today, { text: '기존 메모', strikes: [], color: 'none', photos: [], fontSize: 17, photoSize: 'small' });
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let app;
try {
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:구글 테스트\r\nBEGIN:VEVENT\r\nUID:google-test\r\nDTSTART;VALUE=DATE:${today.replaceAll('-', '')}\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:가져온 반복 일정\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const filename = path.join(directory, 'google-calendar.zip');
  const zip = new JSZip(); zip.file('google-calendar.ics', ics);
  fs.writeFileSync(filename, await zip.generateAsync({ type: 'nodebuffer' }));
  app = await electron.launch(process.argv.includes('--packaged')
    ? { executablePath: path.join(root, 'release/win-unpacked/Photo Calendar.exe'), args: [], env }
    : { args: [root], env });
  const page = await app.firstWindow();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.getByRole('button', { name: '위젯 설정', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '위젯 설정' });
  await expect(settings.getByRole('tab')).toHaveCount(5);
  await expect(settings.getByRole('tabpanel')).toHaveCount(1);
  await expect(settings.getByRole('spinbutton', { name: '전체 글자 크기' })).toBeVisible();
  await settings.getByRole('tab', { name: '화면', exact: true }).press('ArrowRight');
  await expect(settings.getByRole('tab', { name: '테마', exact: true })).toBeFocused();
  await settings.getByRole('tab', { name: '테마', exact: true }).press('ArrowRight');
  await expect(settings.getByRole('tab', { name: '달력', exact: true })).toBeFocused();
  await expect(settings.getByRole('combobox', { name: '한 주의 시작' })).toBeVisible();
  await expect(settings.getByRole('spinbutton', { name: '전체 글자 크기' })).toHaveCount(0);
  await settings.getByRole('tab', { name: '창 동작', exact: true }).click();
  await expect(settings.getByRole('combobox', { name: '위젯 표시 위치' })).toBeVisible();
  await settings.getByRole('tab', { name: '데이터', exact: true }).click();
  await expect(settings.getByRole('button', { name: '엑셀 파일 선택', exact: true })).toBeVisible();
  const section = settings.getByRole('region', { name: '구글 캘린더 가져오기' });
  await section.getByLabel('캘린더 가져올 시작일').fill(today);
  await section.getByLabel('캘린더 가져올 종료일').fill(today);
  await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, filename);
  await section.getByRole('button', { name: '구글 캘린더 파일 선택', exact: true }).click();
  await expect(section).toContainText('1개 일정 · 1일');
  await expect(section).toContainText('종일 가져온 반복 일정');
  assert.equal((await page.evaluate(() => window.calendar.load())).days[today].text, '기존 메모', 'Preview must not change data');
  await settings.getByRole('tab', { name: '화면', exact: true }).click();
  await settings.getByRole('tab', { name: '데이터', exact: true }).click();
  await expect(section).toContainText('google-calendar.zip');
  const apply = section.getByRole('button', { name: '캘린더 가져오기 적용', exact: true });
  await section.getByLabel('캘린더 가져올 종료일').fill(`${date.getFullYear() + 1}-12-31`);
  await expect(apply).toBeDisabled();
  await section.getByRole('button', { name: '기간 다시 미리보기', exact: true }).click();
  await expect(section).toContainText('3개 일정 · 3일');
  await expect(apply).toBeEnabled();
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/calendar-import.png') });
  await apply.click();
  await expect.poll(async () => (await page.evaluate(() => window.calendar.load())).days[today].text).toBe('기존 메모\n종일 가져온 반복 일정');
  await expect(section.getByRole('button', { name: '캘린더 가져오기 적용' })).toHaveCount(0);
  const saved = (await page.evaluate(() => window.calendar.load())).days[today];
  assert.equal(saved.fontSize, 17); assert.equal(saved.photoSize, 'small');
  assert.ok(fs.readdirSync(directory).some(file => file.startsWith('before-calendar-')));
  // Reopening and merging the same file is idempotent.
  await section.getByRole('button', { name: '구글 캘린더 파일 선택', exact: true }).click();
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect.poll(async () => (await page.evaluate(() => window.calendar.load())).days[today].text).toBe(saved.text);
  await settings.getByRole('tab', { name: '화면', exact: true }).click();
  await page.screenshot({ path: path.join(root, 'test-results/settings-categories.png') });
  await settings.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await expect(page.locator(`[data-date="${today}"] .note-text`)).toHaveText(saved.text);
  assert.deepEqual(failures, []);
  console.log('PASS: settings categories and keyboard tabs, ZIP picker → worker preview → range refresh → apply, no pre-apply mutation, merge preservation, automatic backup and repeat import.');
} catch (error) {
  if (app) await (await app.firstWindow()).screenshot({ path: path.join(root, 'test-results/calendar-import-failure.png') }).catch(() => {});
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-import-')) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

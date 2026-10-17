import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const executablePath = path.resolve(process.argv[2] || path.join(root, `release/PhotoCalendar-${version}-Windows.exe`));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-portable-'));
const server = createServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
// NSIS launches Electron as a child, so connect to the renderer over loopback CDP.
const child = spawn(executablePath, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: path.dirname(executablePath), env, windowsHide: true, stdio: 'ignore' });
const exited = once(child, 'exit');
let browser, page;
try {
  const deadline = Date.now() + 45000;
  while (true) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Portable startup did not expose its test renderer in time');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0];
  await expect(page.locator('.widget')).toHaveClass(/theme-polaroid/);
  const dark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
  await expect(page.locator('.widget')).toHaveClass(new RegExp(`mode-${dark ? 'dark' : 'light'}.*soft-focus`));
  await expect(page.locator('.widget')).toHaveCSS('background-color', dark ? 'rgba(34, 34, 34, 0.3)' : 'rgba(255, 255, 255, 0.3)');
  await page.locator('.navigation').getByRole('button', { name: '달력 배경색', exact: true }).click();
  await page.getByRole('group', { name: '달력 배경색 팔레트' }).getByRole('button', { name: '#bfdbfe 색상', exact: true }).click();
  await expect(page.locator('.widget')).toHaveCSS('background-color', 'rgba(191, 219, 254, 0.3)');
  await expect(page.getByRole('button', { name: '바탕화면에 고정', exact: true })).toBeVisible();
  await page.locator('.day-cell.is-today').click({ position: { x: 30, y: 17 } });
  await page.getByRole('textbox', { name: '메모 내용' }).fill('실행 파일 최종 확인');
  await page.getByRole('textbox', { name: '메모 내용' }).press('Control+End');
  await page.getByRole('textbox', { name: '메모 내용' }).press('Enter');
  await page.keyboard.insertText('둘째 줄');
  const memo = page.getByRole('textbox', { name: '메모 내용' });
  await memo.press('Control+Home');
  await memo.press('Shift+ArrowRight'); await memo.press('Shift+ArrowRight');
  await memo.getByRole('checkbox', { name: '1번째 줄 완료', exact: true }).click();
  await expect(memo.locator('s')).toHaveText('실행 파일 최종 확인');
  await expect(memo.locator('s')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(page.locator('.day-editor [contenteditable=true]')).toHaveCount(1);
  await expect(page.locator('.check-button, .note-checkbox, .add-note')).toHaveCount(0);
  await expect.poll(() => fs.existsSync(path.join(directory, 'calendar.json'))).toBe(true);
  const outside = await page.locator('.day-cell:not(.is-today)').nth(12).boundingBox();
  await page.mouse.click(outside.x + 30, outside.y + 17);
  await expect(page.locator('.day-editor')).toHaveCount(0);
  await page.locator('.day-cell.is-today').click({ position: { x: 30, y: 17 } });
  await expect(page.getByRole('textbox', { name: '메모 내용' }).locator(':scope > p')).toHaveText(['실행 파일 최종 확인', '둘째 줄']);
  await expect(memo.locator('s')).toHaveText('실행 파일 최종 확인');
  await expect.poll(() => Object.values(JSON.parse(fs.readFileSync(path.join(directory, 'calendar.json'), 'utf8')).days)[0]?.text).toBe('실행 파일 최종 확인\n둘째 줄');
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(directory, 'calendar.json'), 'utf8')).settings.backgroundColor).toBe('#bfdbfe');
  console.log('PASS: final EXE saves calendar background color at 30% opacity, displays real strikethrough, preserves formatted multiline text, and closes on an outside click.');
} finally {
  if (page) await page.evaluate(() => window.calendar.quit()).catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) {
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
    if (child.exitCode === null) { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {} }
  }
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-portable-')) fs.rmSync(directory, { recursive: true, force: true });
}

import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-e2e-'));
const results = path.join(root, 'test-results');
fs.mkdirSync(results, { recursive: true });
fs.writeFileSync(path.join(directory, 'calendar.json'), JSON.stringify({ version: 1, days: {}, settings: { theme: 'light', opacity: 94, weekStart: 0, fontSize: 13, windowMode: 'normal', startAtLogin: false } }));
const env = { ...process.env, PHOTO_CALENDAR_DATA_DIR: directory, PHOTO_CALENDAR_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let app;
const failures = [];
const pastedText = '붙여넣은 첫 문단\n\n둘째 문단';
const expectedMemo = '오전 회의 자료 준비\n두 번째 줄\n\n마지막 줄\n' + pastedText;
const expectMemo = (memo, text) => expect(memo.locator(':scope > p')).toHaveText(text.split('\n'));
const launch = async () => {
  app = await electron.launch({ args: [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => failures.push(error.message));
  await page.getByRole('button', { name: '위젯 설정', exact: true }).waitFor();
  return page;
};
try {
  let page = await launch();
  await page.screenshot({ path: path.join(results, 'widget-empty.png') });
  const today = await page.locator('.day-cell.is-today').getAttribute('data-date');
  const cell = page.locator(`[data-date="${today}"]`);
  await cell.click({ position: { x: 30, y: 17 } });
  const memo = page.getByRole('textbox', { name: '메모 내용' }).first();
  await memo.fill('오전 회의 자료 준비');
  await memo.press('Control+End');
  await memo.press('Enter');
  await page.keyboard.insertText('두 번째 줄');
  await memo.press('Enter');
  await memo.press('Enter');
  await page.keyboard.insertText('마지막 줄');
  await expectMemo(memo, '오전 회의 자료 준비\n두 번째 줄\n\n마지막 줄');
  await expect(page.locator('.day-editor [contenteditable=true]')).toHaveCount(1);
  await expect(page.locator('.check-button, .note-checkbox, .add-note')).toHaveCount(0);
  await memo.press('Control+Home');
  await memo.press('ArrowRight'); await memo.press('ArrowRight'); await memo.press('ArrowRight');
  await memo.press('Shift+ArrowRight'); await memo.press('Shift+ArrowRight');
  await page.getByRole('button', { name: '현재 줄 취소선', exact: true }).click();
  await expectMemo(memo, '오전 회의 자료 준비\n두 번째 줄\n\n마지막 줄');
  await expect(memo.locator('s')).toHaveText('오전 회의 자료 준비');
  await expect(memo.locator('s')).toHaveCSS('text-decoration-line', 'line-through');
  await memo.press('Control+z');
  await expect(memo.locator('s')).toHaveCount(0);
  await memo.press('Control+y');
  await expect(memo.locator('s')).toHaveText('오전 회의 자료 준비');
  await page.getByRole('button', { name: '색상 팔레트', exact: true }).click();
  await page.getByRole('button', { name: '#fdba74 색상', exact: true }).click();
  await expect(cell).toHaveCSS('background-color', 'rgba(253, 186, 116, 0.4)');
  // Deterministic bitmap fixture encoded by the same native PNG decoder.
  const png = Buffer.from(await app.evaluate(({ nativeImage }) => {
    const bytes = Buffer.alloc(32 * 32 * 4);
    for (let i = 0; i < bytes.length; i += 4) { bytes[i] = 130; bytes[i + 1] = 170; bytes[i + 2] = 120; bytes[i + 3] = 255; }
    return nativeImage.createFromBitmap(bytes, { width: 32, height: 32 }).toPNG().toString('base64');
  }), 'base64');
  const fixturePath = path.join(directory, 'test-photo.png');
  fs.writeFileSync(fixturePath, png);
  await app.evaluate(({ dialog }, fixture) => {
    const original = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => { dialog.showOpenDialog = original; return { canceled: false, filePaths: [fixture] }; };
  }, fixturePath);
  await page.getByRole('button', { name: '사진 첨부', exact: true }).click();
  await expect(cell.locator('img')).toHaveCount(1);
  await expect.poll(() => cell.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(directory, 'calendar.json'), 'utf8')).days[today].photos.length).toBe(1);
  // Native clipboard image via explicit paste button and Ctrl+V.
  await app.evaluate(async ({ clipboard, ClipboardItem }, encoded) => {
    const original = await clipboard.read();
    globalThis.__testOriginalClipboard = await Promise.all(original.map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([Buffer.from(encoded, 'base64')], { type: 'image/png' }) })]);
  }, png.toString('base64'));
  await page.getByRole('button', { name: '사진 붙여넣기', exact: true }).click();
  await expect(cell.locator('img')).toHaveCount(2);
  await page.locator('.editor-heading h2').click();
  await page.keyboard.press('Control+v');
  await expect(cell.locator('img')).toHaveCount(3);
  await app.evaluate(async ({ clipboard, ClipboardItem }, text) => {
    await clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
  }, pastedText);
  await memo.focus();
  await memo.press('Control+End');
  await memo.press('Enter');
  await memo.press('Control+v');
  await expectMemo(memo, expectedMemo);
  await expect(page.locator('.day-editor [contenteditable=true]')).toHaveCount(1);
  await app.evaluate(async ({ clipboard }) => { if (globalThis.__testOriginalClipboard) { await clipboard.write(globalThis.__testOriginalClipboard); delete globalThis.__testOriginalClipboard; } });
  await page.getByRole('button', { name: 'test-photo.png 크게 보기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '편집 닫기', exact: true }).click();
  // Real drag/drop path, including target-day routing.
  const nextCell = page.locator('.day-cell:not(.is-today)').nth(12);
  const dropDate = await nextCell.getAttribute('data-date');
  const transfer = await page.evaluateHandle(encoded => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], 'dropped.png', { type: 'image/png' }));
    return transfer;
  }, png.toString('base64'));
  await nextCell.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(nextCell.locator('img')).toHaveCount(1);
  await transfer.dispose();
  await page.getByRole('button', { name: '위젯 설정', exact: true }).click();
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  await page.getByRole('combobox', { name: '한 주의 시작' }).selectOption('1');
  await expect(page.locator('.weekdays>div').first()).toContainText('월');
  await page.getByRole('tab', { name: '화면', exact: true }).click();
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await expect(page.locator('.widget')).toHaveClass(/theme-dark/);
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await page.screenshot({ path: path.join(results, 'widget-dark.png') });
  await page.getByRole('button', { name: '라이트 테마', exact: true }).click();
  await expect(page.locator('.widget')).toHaveClass(/theme-light/);
  // Resize by dragging the actual handle; never substitute setSize for the action.
  const resize = async () => {
    const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    const grip = await page.locator('.resize-se').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 - 80, grip.y + grip.height / 2 - 50, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().width)).toBeLessThan(before.width - 40);
  };
  await resize();
  // Exercise the actual Win32 SetParent path, and verify parent + restoration.
  await page.getByRole('button', { name: '바탕화면에 고정', exact: true }).click();
  await expect(page.getByRole('button', { name: '바탕화면 고정 해제', exact: true })).toBeVisible();
  const parent = await app.evaluate(({ BrowserWindow }) => {
    const { createRequire } = process.getBuiltinModule('module');
    const require = createRequire(process.cwd() + '/package.json');
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const getParent = user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)');
    return Number(getParent(Number(BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE())));
  });
  assert.ok(parent > 0, 'Widget is attached to a Windows desktop host');
  await resize();
  await page.getByRole('button', { name: '바탕화면 고정 해제', exact: true }).click();
  await expect(page.getByRole('button', { name: '바탕화면에 고정', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '위젯 설정', exact: true }).click();
  await page.getByRole('tab', { name: '창 동작', exact: true }).click();
  await page.getByRole('combobox', { name: '위젯 표시 위치' }).selectOption('top');
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true);
  await page.getByRole('combobox', { name: '위젯 표시 위치' }).selectOption('normal');
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await page.screenshot({ path: path.join(results, 'widget-light.png') });
  await app.close();
  app = null;
  page = await launch();
  const restored = page.locator(`[data-date="${today}"]`);
  await expect(restored.locator('.note-text')).toHaveText(expectedMemo);
  await expect(restored.locator('s')).toHaveText('오전 회의 자료 준비');
  await expect(restored.locator('img')).toHaveCount(3);
  await expect(restored).toHaveCSS('background-color', 'rgba(253, 186, 116, 0.4)');
  await expect(page.locator(`[data-date="${dropDate}"] img`)).toHaveCount(1);
  await expect(page.locator('.weekdays>div').first()).toContainText('월');
  await restored.click({ position: { x: 30, y: 17 } });
  await page.getByRole('button', { name: 'test-photo.png 사진 제거', exact: true }).click();
  await expect(restored.locator('img')).toHaveCount(2);
  await expectMemo(page.getByRole('textbox', { name: '메모 내용' }), expectedMemo);
  await expect(page.getByRole('textbox', { name: '메모 내용' }).locator('s')).toHaveText('오전 회의 자료 준비');
  await page.getByRole('button', { name: '편집 닫기', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 580));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await page.screenshot({ path: path.join(results, 'widget-compact.png') });
  await page.getByRole('button', { name: '위젯 설정', exact: true }).click();
  const opacity = page.getByRole('slider', { name: '배경 불투명도' });
  await opacity.focus();
  await opacity.press('Home');
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await expect(page.locator('.widget')).toHaveClass(/transparent-widget/);
  await page.screenshot({ path: path.join(results, 'widget-transparent.png'), omitBackground: true });
  const alpha = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const image = await window.webContents.capturePage();
    const size = image.getSize();
    return image.toBitmap()[(80 * size.width + 20) * 4 + 3];
  });
  assert.equal(alpha, 0, 'Calendar background is genuinely transparent (zero alpha)');
  const blank = await page.locator('.day-cell').first().boundingBox();
  const hit = await app.evaluate(({ BrowserWindow, screen }, point) => {
    const { createRequire } = process.getBuiltinModule('module');
    const koffi = createRequire(process.cwd() + '/package.json')('koffi');
    const user32 = koffi.load('user32.dll');
    const Point = koffi.struct('PhotoCalendarHitPoint', { x: 'int32_t', y: 'int32_t' });
    const toScreen = user32.func('ClientToScreen', 'bool', ['intptr_t', koffi.inout(koffi.pointer(Point))]);
    const fromPoint = user32.func('WindowFromPoint', 'intptr_t', [Point]);
    const isChild = user32.func('bool __stdcall IsChild(intptr_t parent, intptr_t child)');
    const window = BrowserWindow.getAllWindows()[0];
    window.setAlwaysOnTop(true);
    window.show();
    const hwnd = Number(window.getNativeWindowHandle().readBigUInt64LE());
    const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
    const location = { x: Math.round(point.x * scale), y: Math.round(point.y * scale) };
    toScreen(hwnd, location);
    const target = fromPoint(location);
    return { clickable: Number(target) === hwnd || isChild(hwnd, target), target: Number(target), hwnd };
  }, { x: blank.x + 40, y: blank.y + 45 });
  assert.ok(hit.clickable, 'Transparent empty cells still receive native Windows mouse input');
  assert.deepEqual(failures, [], 'No uncaught renderer errors');
  console.log('PASS: notes, strikethrough, file selection, clipboard button, Ctrl+V, drag/drop, color palette, real handle drag in normal/desktop modes, restart persistence, transparency.');
} catch (error) {
  if (app) { try { await (await app.firstWindow()).screenshot({ path: path.join(results, 'failure.png') }); } catch {} }
  throw error;
} finally {
  if (app) await app.evaluate(async ({ clipboard }) => { if (globalThis.__testOriginalClipboard) await clipboard.write(globalThis.__testOriginalClipboard); }).catch(() => {});
  if (app) await app.close().catch(() => {});
  // Only the verified temporary directory created for this test is removed.
  if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('photocalendar-e2e-')) fs.rmSync(directory, { recursive: true, force: true });
}

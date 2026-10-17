const koffi = require('koffi');
const user32 = koffi.load('user32.dll');
const Rect = koffi.struct('RevealRect', { left: 'int', top: 'int', right: 'int', bottom: 'int' });
const EnumProc = koffi.proto('int __stdcall RevealEnum(intptr_t hwnd, intptr_t data)');
const enumerate = user32.func('int __stdcall EnumWindows(RevealEnum *callback, intptr_t data)');
const find = user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 name, str16 title)');
const getRect = user32.func('GetWindowRect', 'int', ['intptr_t', koffi.out(koffi.pointer(Rect))]);
const getStyle = user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)');
const visible = user32.func('int __stdcall IsWindowVisible(intptr_t hwnd)');
let hwnd = 0, parent = 0;
const callback = koffi.register(handle => {
  const child = find(handle, 0, null, 'Photo Calendar');
  if (child) { hwnd = child; parent = handle; return 0; }
  return 1;
}, koffi.pointer(EnumProc));
enumerate(callback, 0); koffi.unregister(callback);
if (!hwnd) hwnd = find(0, 0, null, 'Photo Calendar');
if (!hwnd) throw new Error('Photo Calendar window not found');
const bounds = {}; getRect(hwnd, bounds);
console.log(JSON.stringify({ hwnd: Number(hwnd), parent: Number(parent), visible: Boolean(visible(hwnd)), bounds, style: Number(getStyle(hwnd, -16)) }));
if (process.argv.includes('--show')) {
  const setParent = user32.func('intptr_t __stdcall SetParent(intptr_t hwnd, intptr_t parent)');
  const setStyle = user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)');
  const position = user32.func('int __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int width, int height, uint32_t flags)');
  const show = user32.func('int __stdcall ShowWindow(intptr_t hwnd, int command)');
  const foreground = user32.func('int __stdcall SetForegroundWindow(intptr_t hwnd)');
  const metrics = user32.func('int __stdcall GetSystemMetrics(int index)');
  const width = Math.min(1120, metrics(0) - 100), height = Math.min(760, metrics(1) - 120);
  setParent(hwnd, 0);
  setStyle(hwnd, -16, (Number(getStyle(hwnd, -16)) & ~0x40000000) | 0x80000000);
  setStyle(hwnd, -20, Number(getStyle(hwnd, -20)) | 0x00040000);
  show(hwnd, 9);
  position(hwnd, -1, Math.floor((metrics(0) - width) / 2), Math.floor((metrics(1) - height) / 2), width, height, 0x0020 | 0x0040);
  foreground(hwnd);
  const revealed = {}; getRect(hwnd, revealed);
  console.log(JSON.stringify({ revealed, visible: Boolean(visible(hwnd)), foreground: Number(user32.func('intptr_t __stdcall GetForegroundWindow()')()) === Number(hwnd) }));
}

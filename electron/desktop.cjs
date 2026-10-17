// Windows desktop hosting is isolated here. No shell commands or elevated access.
let api;
function windowsAPI() {
  if (api) return api;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const EnumProc = koffi.proto('bool __stdcall PhotoCalendarEnumProc(intptr_t hwnd, intptr_t lparam)');
  api = {
    koffi,
    EnumProc,
    enumWindows: user32.func('bool __stdcall EnumWindows(PhotoCalendarEnumProc *callback, intptr_t lparam)'),
    findWindow: user32.func('intptr_t __stdcall FindWindowW(str16 className, str16 title)'),
    findWindowEx: user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 className, str16 title)'),
    getParent: user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)'),
    setParent: user32.func('intptr_t __stdcall SetParent(intptr_t hwnd, intptr_t parent)'),
    isWindow: user32.func('bool __stdcall IsWindow(intptr_t hwnd)'),
    getStyle: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
    setStyle: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
    position: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int width, int height, uint32_t flags)'),
  };
  return api;
}
class DesktopHost {
  constructor(window) { this.window = window; this.attached = false; this.parent = 0; this.timer = null; }
  handle() { return Number(this.window.getNativeWindowHandle().readBigUInt64LE()); }
  attach() {
    if (process.platform !== 'win32') throw new Error('바탕화면 고정은 Windows에서 사용할 수 있습니다.');
    if (this.attached) return;
    const a = windowsAPI();
    let desktop = 0;
    const callback = a.koffi.register((hwnd) => {
      if (a.findWindowEx(hwnd, 0, 'SHELLDLL_DefView', null)) { desktop = hwnd; return false; }
      return true;
    }, a.koffi.pointer(a.EnumProc));
    try { a.enumWindows(callback, 0); } finally { a.koffi.unregister(callback); }
    if (!desktop) desktop = a.findWindow('Progman', null);
    if (!desktop) throw new Error('Windows 바탕화면을 찾을 수 없습니다. 일반 위젯 모드를 사용해 주세요.');
    const hwnd = this.handle();
    this.savedBounds = this.window.getBounds();
    this.savedStyle = a.getStyle(hwnd, -16);
    // Set WS_CHILD and clear WS_POPUP, as required by SetParent.
    const style = (Number(this.savedStyle) | 0x40000000) & ~0x80000000;
    a.setStyle(hwnd, -16, style);
    a.setParent(hwnd, desktop);
    if (Number(a.getParent(hwnd)) !== Number(desktop)) {
      a.setStyle(hwnd, -16, this.savedStyle);
      throw new Error('바탕화면 고정에 실패했습니다. 일반 위젯 모드로 계속 사용할 수 있습니다.');
    }
    this.attached = true;
    this.parent = desktop;
    this.window.setSkipTaskbar(true);
    a.position(hwnd, 0, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0020 | 0x0040);
    // Explorer can restart independently of the widget.
    this.timer = setInterval(() => {
      if (this.window.isDestroyed()) { clearInterval(this.timer); return; }
      if (!a.isWindow(this.parent)) this.window.emit('desktop-host-lost');
    }, 3000);
    this.timer.unref();
  }
  detach() {
    if (!this.attached || this.window.isDestroyed()) return;
    clearInterval(this.timer);
    const currentBounds = this.window.getBounds();
    const a = windowsAPI();
    const hwnd = this.handle();
    a.setParent(hwnd, 0);
    a.setStyle(hwnd, -16, this.savedStyle);
    a.position(hwnd, 0, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0020);
    this.attached = false;
    this.window.setSkipTaskbar(false);
    // Restore screen coordinates after switching away from desktop coordinates.
    this.window.setBounds(currentBounds);
  }
  dispose() { clearInterval(this.timer); }
}
module.exports = { DesktopHost };

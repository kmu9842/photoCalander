const KEYS = ['x', 'y', 'width', 'height'];
let api;
function createNativeBounds(window, scale) {
  if (process.platform !== 'win32') return null;
  if (!api) {
    const koffi = require('koffi'), user32 = koffi.load('user32.dll');
    const Rect = koffi.struct('PhotoCalendarBoundsRect', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
    const Point = koffi.struct('PhotoCalendarBoundsPoint', { x: 'int32_t', y: 'int32_t' });
    api = {
      rect: user32.func('GetWindowRect', 'bool', ['intptr_t', koffi.out(koffi.pointer(Rect))]),
      parent: user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)'),
      style: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
      map: user32.func('MapWindowPoints', 'int', ['intptr_t', 'intptr_t', koffi.inout(koffi.pointer(Point)), 'uint32_t']),
      position: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int width, int height, uint32_t flags)'),
    };
  }
  const handle = () => Number(window.getNativeWindowHandle().readBigUInt64LE());
  return {
    scale,
    getBounds() {
      const rect = {};
      if (!api.rect(handle(), rect)) throw new Error('창 크기를 읽지 못했습니다.');
      return { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top };
    },
    setBounds(bounds) {
      const hwnd = handle(), point = { x: Math.round(bounds.x), y: Math.round(bounds.y) };
      // Desktop-hosted widgets use the parent's client coordinates.
      if (Number(api.style(hwnd, -16)) & 0x40000000) api.map(0, api.parent(hwnd), point, 1);
      if (!api.position(hwnd, 0, point.x, point.y, Math.round(bounds.width), Math.round(bounds.height), 0x0004 | 0x0010 | 0x0200)) throw new Error('창 크기를 복원하지 못했습니다.');
    },
  };
}

// On Windows with fractional DPI, setBounds(getBounds()) can add a DIP to
// both dimensions. Correct the native round-trip instead of accumulating it.
function setExactBounds(window, target) {
  let request = { ...target };
  for (let attempt = 0; attempt < 4; attempt++) {
    window.setBounds(request);
    const actual = window.getBounds();
    if (KEYS.every(key => actual[key] === target[key])) return;
    request = Object.fromEntries(KEYS.map(key => [key, request[key] + target[key] - actual[key]]));
  }
}

module.exports = { setExactBounds, createNativeBounds };

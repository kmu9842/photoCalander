// SetParent makes the widget an Explorer child, which does not reliably receive
// BrowserWindow activation events. Observe native focus without polling or input hooks.
function observeOutsideFocus(window, outside) {
  if (process.platform !== 'win32') return () => {};
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const FocusProc = koffi.proto('void __stdcall CalendarFocusEvent(intptr_t hook, uint32_t event, intptr_t hwnd, int32_t object, int32_t child, uint32_t thread, uint32_t time)');
  const hookEvent = user32.func('intptr_t __stdcall SetWinEventHook(uint32_t min, uint32_t max, intptr_t module, CalendarFocusEvent *callback, uint32_t process, uint32_t thread, uint32_t flags)');
  const unhook = user32.func('bool __stdcall UnhookWinEvent(intptr_t hook)');
  const getParent = user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)');
  const ownHandle = Number(window.getNativeWindowHandle().readBigUInt64LE());
  let disposed = false;
  const callback = koffi.register((_hook, _event, handle) => {
    if (disposed || !handle || window.isDestroyed()) return;
    // GetParent follows child parents and popup owners. Owned dialogs stay open.
    for (let hwnd = handle; hwnd; hwnd = getParent(hwnd)) if (Number(hwnd) === ownHandle) return;
    outside();
  }, koffi.pointer(FocusProc));
  // EVENT_SYSTEM_FOREGROUND and EVENT_OBJECT_FOCUS, WINEVENT_OUTOFCONTEXT.
  const hooks = [0x0003, 0x8005].map(event => hookEvent(event, event, 0, callback, 0, 0, 0)).filter(Boolean);
  return () => {
    disposed = true;
    for (const hook of hooks) unhook(hook);
    koffi.unregister(callback);
  };
}
module.exports = { observeOutsideFocus };

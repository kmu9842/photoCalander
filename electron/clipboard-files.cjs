function clipboardFiles() {
  if (process.platform !== 'win32') return [];
  const k = require('koffi');
  const user32 = k.load('user32.dll'), shell32 = k.load('shell32.dll');
  const open = user32.func('int __stdcall OpenClipboard(intptr_t owner)');
  const close = user32.func('int __stdcall CloseClipboard()');
  const get = user32.func('intptr_t __stdcall GetClipboardData(uint32_t format)');
  const query = shell32.func('uint32_t __stdcall DragQueryFileW(intptr_t drop, uint32_t index, void *buffer, uint32_t length)');
  if (!open(0)) return [];
  try {
    const drop = get(15); // CF_HDROP: copied files in Windows Explorer.
    if (!drop) return [];
    const count = Math.min(query(drop, 0xffffffff, null, 0), 20), paths = [];
    for (let i = 0; i < count; i++) {
      const size = query(drop, i, null, 0) + 1;
      const bytes = Buffer.alloc(size * 2);
      query(drop, i, bytes, size);
      paths.push(bytes.toString('utf16le').replace(/\0+$/, ''));
    }
    return paths;
  } finally { close(); }
}
module.exports = { clipboardFiles };

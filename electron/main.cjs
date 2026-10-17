const { app, BrowserWindow, ipcMain, protocol, net, nativeImage, Tray, Menu, dialog, shell, screen, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { CalendarStore, PHOTO_FILE, validateSettings } = require('./store.cjs');
const { DesktopHost } = require('./desktop.cjs');
const sharp = require('sharp');
const { WindowResizer } = require('./window-resize.cjs');
const { clipboardFiles } = require('./clipboard-files.cjs');
const { observeOutsideFocus } = require('./outside-focus.cjs');

if (process.env.PHOTO_CALENDAR_DATA_DIR) app.setPath('userData', process.env.PHOTO_CALENDAR_DATA_DIR);
else app.setPath('userData', path.join(app.getPath('appData'), 'PhotoCalendar'));
app.setName('Photo Calendar');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
protocol.registerSchemesAsPrivileged([{ scheme: 'photo', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, store, tray, host, resizer, quitting = false;
let nativeDialogDepth = 0;
async function withNativeDialog(action) {
  nativeDialogDepth++;
  try { return await action(); }
  finally { nativeDialogDepth--; }
}
const testMode = process.env.PHOTO_CALENDAR_TEST === '1';
const devURL = !app.isPackaged && process.env.VITE_DEV_SERVER_URL;

async function imageInfo(bytes) {
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error('사진은 한 장당 30MB 이하로 첨부해 주세요.');
  let ext;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ext = 'png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ext = 'jpg';
  else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') ext = 'webp';
  else if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) ext = 'gif';
  else throw new Error('PNG, JPG, WEBP, GIF 사진만 첨부할 수 있습니다.');
  try {
    const image = sharp(bytes, { limitInputPixels: 80000000 });
    const metadata = await image.metadata();
    const rotated = [5, 6, 7, 8].includes(metadata.orientation);
    const width = rotated ? metadata.height : metadata.width;
    const height = rotated ? metadata.width : metadata.height;
    const thumbnail = await image.rotate().resize({ width: 560, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return { thumbnail, width, height, ext };
  } catch { throw new Error('사진을 읽을 수 없습니다. 손상되지 않은 8천만 화소 이하의 사진을 선택해 주세요.'); }
}
function checkSender(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('허용되지 않은 요청입니다.');
}
function handle(channel, callback) { ipcMain.handle(channel, (event, ...args) => { checkSender(event); return callback(...args); }); }
function notifySettings() { if (window && !window.isDestroyed()) window.webContents.send('calendar:settings-changed', store.data.settings); updateTray(); }
function applyMode(mode) {
  if (mode !== 'desktop') host.detach();
  window.setAlwaysOnTop(mode === 'top');
  if (mode === 'desktop') host.attach();
}
function reveal() {
  if (!window) return;
  if (host.attached) { host.detach(); store.saveSettings({ ...store.data.settings, windowMode: 'normal' }); notifySettings(); }
  if (window.isMinimized()) window.restore();
  window.show();
  window.moveTop();
  window.focus();
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '달력 보기', click: reveal },
    { label: '오늘로 이동', click: () => { reveal(); window.webContents.send('calendar:today'); } },
    { type: 'separator' },
    { label: '바탕화면 고정', type: 'checkbox', checked: store.data.settings.windowMode === 'desktop', click: () => {
      try { const settings = { ...store.data.settings, windowMode: host.attached ? 'normal' : 'desktop' }; applyMode(settings.windowMode); store.saveSettings(settings); notifySettings(); reveal(); }
      catch (error) { dialog.showErrorBox('바탕화면 고정', error.message); }
    } },
    { label: '일반 창으로 가져오기', click: () => { applyMode('normal'); store.saveSettings({ ...store.data.settings, windowMode: 'normal' }); notifySettings(); reveal(); } },
    { type: 'separator' },
    { label: '종료', click: () => { quitting = true; app.quit(); } },
  ]));
}
function trayImage() {
  // An original vector-style app mark rendered into a tiny bitmap; no external assets.
  const size = 32, bytes = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const paper = x >= 7 && x <= 24 && y >= 7 && y <= 25;
    const line = paper && (y === 11 || (y >= 15 && y <= 21 && [11, 12, 18, 19].includes(x)));
    bytes[i] = paper && !line ? 240 : 76;
    bytes[i + 1] = paper && !line ? 246 : 113;
    bytes[i + 2] = paper && !line ? 242 : 88;
    bytes[i + 3] = ((x < 3 || x > 28) && (y < 3 || y > 28)) ? 0 : 255;
  }
  return nativeImage.createFromBitmap(bytes, { width: size, height: size });
}
async function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  let bounds = { width: Math.min(1260, area.width - 60), height: Math.min(820, area.height - 60) };
  bounds.x = Math.round(area.x + (area.width - bounds.width) / 2);
  bounds.y = Math.round(area.y + (area.height - bounds.height) / 2);
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(store.directory, 'window.json'), 'utf8'));
    if (['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved[key])) && screen.getAllDisplays().some(d => saved.x + 120 > d.workArea.x && saved.x < d.workArea.x + d.workArea.width - 120 && saved.y + 50 > d.workArea.y && saved.y < d.workArea.y + d.workArea.height - 50)) bounds = saved;
  } catch { /* First launch or display layout changed. */ }
  window = new BrowserWindow({
    ...bounds, minWidth: 760, minHeight: 540,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    title: 'Photo Calendar', show: false, autoHideMenuBar: true,
    icon: trayImage(),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  host = new DesktopHost(window);
  const stopObservingFocus = observeOutsideFocus(window, () => {
    if (host.attached && nativeDialogDepth === 0 && window.isEnabled()) window.webContents.send('window:blur');
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on('close', event => {
    if (!quitting && !testMode) { event.preventDefault(); window.hide(); }
  });
  let boundsTimer;
  const persistBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (window.isDestroyed() || window.isMinimized()) return;
      try { fs.writeFileSync(path.join(store.directory, 'window.json'), JSON.stringify(window.getBounds())); } catch { /* Window geometry is nonessential. */ }
    }, 500);
  };
  resizer = new WindowResizer(window, persistBounds);
  const dismissOnBlur = () => {
    resizer.end();
    // Owned native dialogs disable their owner.
    // Wait for that state to settle before treating a focus change as an outside click.
    setTimeout(() => {
      if (!window.isDestroyed() && !window.isFocused() && window.isEnabled() && nativeDialogDepth === 0) window.webContents.send('window:blur');
    }, 0);
  };
  window.on('blur', dismissOnBlur);
  // Draggable title areas receive native non-client clicks instead of DOM events.
  if (process.platform === 'win32') window.hookWindowMessage(0x00A1, () => window.webContents.send('window:blur'));
  window.on('moved', persistBounds);
  window.on('resized', persistBounds);
  window.on('closed', () => { clearTimeout(boundsTimer); stopObservingFocus(); host.dispose(); });
  window.on('desktop-host-lost', () => {
    try { host.detach(); store.saveSettings({ ...store.data.settings, windowMode: 'normal' }); notifySettings(); reveal(); } catch { /* User may be signing out. */ }
  });
  window.once('ready-to-show', () => {
    window.show();
    try { applyMode(store.data.settings.windowMode); }
    catch (error) {
      store.saveSettings({ ...store.data.settings, windowMode: 'normal' });
      notifySettings();
      dialog.showMessageBox(window, { type: 'info', title: '일반 위젯 모드', message: error.message });
    }
    if (store.recovered) dialog.showMessageBox(window, { type: 'info', message: '최근 자동 백업에서 기록을 복구했습니다. 손상된 원본도 데이터 폴더에 보관했습니다.' });
    if (process.argv.includes('--show-widget')) {
      if (host.attached) { host.detach(); store.saveSettings({ ...store.data.settings, windowMode: 'normal' }); notifySettings(); }
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      const size = window.getBounds();
      window.setBounds({ x: Math.round(area.x + (area.width - size.width) / 2), y: Math.round(area.y + (area.height - size.height) / 2), width: size.width, height: size.height });
      window.setAlwaysOnTop(true);
      window.show(); window.focus();
      setTimeout(() => { if (!window.isDestroyed() && store.data.settings.windowMode !== 'top') window.setAlwaysOnTop(false); }, 12000);
    }
  });
  if (devURL) await window.loadURL(devURL);
  else await window.loadFile(path.join(__dirname, '../dist/index.html'));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', reveal);
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(async () => {
    try { store = new CalendarStore(app.getPath('userData')); }
    catch (error) { dialog.showErrorBox('기록을 열 수 없습니다', error.message); app.quit(); return; }
    protocol.handle('photo', async request => {
      const url = new URL(request.url);
      const filename = url.pathname.slice(1);
      if (url.hostname !== 'local' || !PHOTO_FILE.test(filename)) return new Response('Not found', { status: 404 });
      let file = path.join(store.photoDirectory, filename);
      if (url.searchParams.has('thumb')) {
        const thumb = path.join(store.photoDirectory, 'thumb-' + filename + '.jpg');
        if (!fs.existsSync(thumb) && fs.existsSync(file)) {
          try { const image = await sharp(file, { limitInputPixels: 80000000 }).rotate().resize({ width: 560, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(); fs.writeFileSync(thumb, image); } catch { /* Fall back to original. */ }
        }
        if (fs.existsSync(thumb)) file = thumb;
      }
      if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    handle('calendar:load', () => store.data);
    handle('calendar:save-day', (date, entry) => store.saveDay(date, entry));
    async function importPhotoBuffers(files) {
      if (!Array.isArray(files) || files.length > 20) throw new Error('사진은 한 번에 20장까지 첨부할 수 있습니다.');
      // Validate the entire batch before writing any files.
      const decoded = await Promise.all(files.map(async file => {
        if (!file || typeof file.name !== 'string' || !(file.bytes instanceof ArrayBuffer || Buffer.isBuffer(file.bytes))) throw new Error('사진 데이터가 올바르지 않습니다.');
        const bytes = Buffer.from(file.bytes);
        return { name: file.name.slice(0, 300), bytes, ...await imageInfo(bytes) };
      }));
      return decoded.map(({ name, bytes, width, height, ext, thumbnail }) => {
        const id = randomUUID(), file = id + '.' + ext;
        fs.writeFileSync(path.join(store.photoDirectory, file), bytes, { flag: 'wx' });
        fs.writeFileSync(path.join(store.photoDirectory, 'thumb-' + file + '.jpg'), thumbnail);
        return { id, name, file, width, height };
      });
    }
    handle('calendar:import-photos', importPhotoBuffers);
    async function importPhotoPaths(paths) {
      const photos = [];
      for (const file of paths) {
        if (!/\.(png|jpe?g|webp|gif)$/i.test(file)) continue;
        if (fs.statSync(file).size > 30 * 1024 * 1024) throw new Error('사진은 한 장당 30MB 이하로 첨부해 주세요.');
        photos.push({ name: path.basename(file), bytes: fs.readFileSync(file) });
      }
      return importPhotoBuffers(photos);
    }
    handle('calendar:pick-photos', () => withNativeDialog(async () => {
      const wasAttached = host.attached;
      if (wasAttached) host.detach();
      window.focus();
      try {
        const result = await dialog.showOpenDialog(window, { title: '사진 선택', properties: ['openFile', 'multiSelections'], filters: [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] });
        if (result.canceled) return [];
        return await importPhotoPaths(result.filePaths);
      } finally { if (wasAttached && store.data.settings.windowMode === 'desktop') host.attach(); }
    }));
    handle('calendar:paste-photos', async () => {
      const files = clipboardFiles();
      if (files.length) return importPhotoPaths(files);
      const items = await clipboard.read();
      for (const item of items) {
        const type = item.types.find(type => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type));
        if (!type) continue;
        const blob = await item.getType(type);
        return importPhotoBuffers([{ name: `붙여넣은 이미지.${type.split('/')[1]}`, bytes: Buffer.from(await blob.arrayBuffer()) }]);
      }
      return [];
    });
    handle('calendar:settings', raw => {
      const settings = validateSettings(raw), previous = store.data.settings;
      try {
        if (settings.windowMode !== previous.windowMode) applyMode(settings.windowMode);
        if (settings.startAtLogin !== previous.startAtLogin) {
          if (!app.isPackaged) throw new Error('자동 시작은 빌드된 실행 파일에서 설정할 수 있습니다.');
          const executable = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
          app.setLoginItemSettings({ openAtLogin: settings.startAtLogin, path: executable });
        }
        store.saveSettings(settings);
      } catch (error) { try { applyMode(previous.windowMode); } catch {} throw error; }
      updateTray();
      return settings;
    });
    handle('calendar:export', () => withNativeDialog(async () => {
      const result = await dialog.showSaveDialog(window, { title: '사진과 기록 백업', defaultPath: path.join(app.getPath('documents'), `PhotoCalendar-${new Date().toISOString().slice(0, 10)}.json`), filters: [{ name: 'Photo Calendar 백업', extensions: ['json'] }] });
      if (result.canceled || !result.filePath) return false;
      fs.writeFileSync(result.filePath, store.exportBackup());
      return true;
    }));
    handle('calendar:restore', () => withNativeDialog(async () => {
      const result = await dialog.showOpenDialog(window, { title: '백업 불러오기', properties: ['openFile'], filters: [{ name: 'Photo Calendar 백업', extensions: ['json'] }] });
      if (result.canceled) return null;
      if (fs.statSync(result.filePaths[0]).size > 512 * 1024 * 1024) throw new Error('백업은 512MB 이하로 불러올 수 있습니다.');
      const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      const answer = await dialog.showMessageBox(window, { type: 'question', title: '백업 불러오기', message: '현재 달력을 백업의 기록으로 바꿀까요?', detail: '현재 기록과 사진은 데이터 폴더에 별도 백업한 뒤 불러옵니다.', buttons: ['취소', '불러오기'], defaultId: 0, cancelId: 0 });
      if (answer.response !== 1) return null;
      return store.restoreBackup(raw, imageInfo);
    }));
    handle('calendar:folder', () => shell.openPath(store.directory));
    ipcMain.on('window:resize-begin', (event, edge, x, y) => { checkSender(event); resizer?.begin(edge, x, y); });
    ipcMain.on('window:resize-to', (event, x, y) => { checkSender(event); resizer?.move(x, y); });
    ipcMain.on('window:resize-end', event => { checkSender(event); resizer?.end(); });
    for (const [channel, action] of Object.entries({ 'window:minimize': () => window.hide(), 'window:hide': () => window.hide(), 'window:quit': () => { quitting = true; app.quit(); } })) {
      ipcMain.on(channel, event => { checkSender(event); action(); });
    }
    if (!testMode) { tray = new Tray(trayImage()); tray.setToolTip('Photo Calendar'); tray.on('double-click', reveal); updateTray(); }
    await createWindow();
  }).catch(error => { dialog.showErrorBox('Photo Calendar', error.message); app.quit(); });
  app.on('window-all-closed', () => { if (quitting || testMode) app.quit(); });
  app.on('activate', reveal);
}

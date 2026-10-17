const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld('calendar', {
  load: () => ipcRenderer.invoke('calendar:load'),
  saveDay: (date, entry) => ipcRenderer.invoke('calendar:save-day', date, entry),
  importPhotos: (files) => ipcRenderer.invoke('calendar:import-photos', files),
  pickPhotos: () => ipcRenderer.invoke('calendar:pick-photos'),
  pastePhotos: () => ipcRenderer.invoke('calendar:paste-photos'),
  beginResize: (edge, x, y) => ipcRenderer.send('window:resize-begin', edge, x, y),
  resizeTo: (x, y) => ipcRenderer.send('window:resize-to', x, y),
  endResize: () => ipcRenderer.send('window:resize-end'),
  saveSettings: (settings) => ipcRenderer.invoke('calendar:settings', settings),
  exportBackup: () => ipcRenderer.invoke('calendar:export'),
  importBackup: () => ipcRenderer.invoke('calendar:restore'),
  openDataFolder: () => ipcRenderer.invoke('calendar:folder'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:hide'),
  quit: () => ipcRenderer.send('window:quit'),
  onSettings: callback => subscribe('calendar:settings-changed', callback),
  onFocusDate: callback => subscribe('calendar:today', callback),
  onBlur: callback => subscribe('window:blur', callback),
});

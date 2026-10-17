const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = Object.freeze({ theme: 'light', backgroundColor: 'none', opacity: 30, weekStart: 0, fontSize: 13, fontFamily: '', lineWidth: 1, showHolidays: true, holidayCountry: 'auto', windowMode: 'normal', startAtLogin: false });
const COLORS = ['none', 'sage', 'peach', 'lavender', 'sky', 'rose'];
const PHOTO_FILE = /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/;
function validDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return y >= 1900 && y <= 2200 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
function validateSettings(value) {
  if (!value || !['light', 'dark'].includes(value.theme) || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 100 || ![0, 1].includes(value.weekStart) || !Number.isInteger(value.fontSize) || value.fontSize < 8 || value.fontSize > 48 || !['normal', 'desktop', 'top'].includes(value.windowMode) || typeof value.startAtLogin !== 'boolean') throw new Error('설정 형식이 올바르지 않습니다.');
  const backgroundColor = value.backgroundColor === undefined ? DEFAULT_SETTINGS.backgroundColor : value.backgroundColor;
  if (backgroundColor !== 'none' && !(typeof backgroundColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(backgroundColor))) throw new Error('배경색 형식이 올바르지 않습니다.');
  const { fontFamily = '', lineWidth = 1, showHolidays = true, holidayCountry = 'auto' } = value;
  if (typeof fontFamily !== 'string' || fontFamily.length > 200 || /[\x00-\x1f]/.test(fontFamily) || !Number.isFinite(lineWidth) || lineWidth < 0 || lineWidth > 6 || !Number.isInteger(lineWidth * 2) || typeof showHolidays !== 'boolean' || (holidayCountry !== 'auto' && (typeof holidayCountry !== 'string' || !/^[A-Z]{2}$/.test(holidayCountry)))) throw new Error('글꼴, 선 두께 또는 공휴일 설정이 올바르지 않습니다.');
  return { theme: value.theme, backgroundColor, opacity: value.opacity, weekStart: value.weekStart, fontSize: value.fontSize, fontFamily, lineWidth, showHolidays, holidayCountry, windowMode: value.windowMode, startAtLogin: value.startAtLogin };
}
function legacyStrikes(source) {
  let text = '', offset = 0;
  const strikes = [];
  for (const match of source.matchAll(/~~([^~]+)~~/g)) {
    text += source.slice(offset, match.index);
    const from = text.length;
    text += match[1];
    strikes.push({ from, to: text.length });
    offset = match.index + match[0].length;
  }
  return { text: text + source.slice(offset), strikes };
}
function validateEntry(value, legacy = false) {
  if (!value || !Array.isArray(value.photos) || value.photos.length > 20 || !(COLORS.includes(value.color) || (typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)))) throw new Error('날짜 기록 형식이 올바르지 않습니다.');
  const ids = new Set();
  let text = value.text;
  if (!Object.hasOwn(value, 'text')) {
    // Preserve legacy text, blank lines, and strikes when reading records or backups.
    if (!Array.isArray(value.notes) || value.notes.length > 100) throw new Error('메모 형식이 올바르지 않습니다.');
    text = value.notes.map(n => {
      if (!n || typeof n.id !== 'string' || n.id.length > 100 || ids.has(n.id) || typeof n.text !== 'string' || n.text.length > 10000 || typeof n.done !== 'boolean') throw new Error('메모 형식이 올바르지 않습니다.');
      ids.add(n.id);
      return n.done && n.text ? `~~${n.text.replaceAll('~~', '')}~~` : n.text;
    }).join('\n');
  }
  if (typeof text !== 'string' || text.length > 2000000) throw new Error('메모 형식이 올바르지 않습니다.');
  let strikes = value.strikes ?? [];
  if (legacy) ({ text, strikes } = legacyStrikes(text));
  if (!Array.isArray(strikes) || strikes.length > text.length) throw new Error('취소선 형식이 올바르지 않습니다.');
  let end = 0;
  strikes = strikes.map(range => {
    if (!range || !Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < end || range.to <= range.from || range.to > text.length) throw new Error('취소선 범위가 올바르지 않습니다.');
    end = range.to;
    return { from: range.from, to: range.to };
  });
  let colorEnd = 0;
  const textColors = value.textColors ?? [];
  if (!Array.isArray(textColors) || textColors.length > text.length) throw new Error('글자색 형식이 올바르지 않습니다.');
  const colors = textColors.map(range => {
    if (!range || !Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < colorEnd || range.to <= range.from || range.to > text.length || typeof range.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(range.color)) throw new Error('글자색 범위가 올바르지 않습니다.');
    colorEnd = range.to;
    return { from: range.from, to: range.to, color: range.color };
  });
  return {
    text, strikes,
    ...(colors.length ? { textColors: colors } : {}),
    photos: value.photos.map(p => {
      if (!p || typeof p.id !== 'string' || p.id.length > 100 || ids.has(p.id) || typeof p.name !== 'string' || p.name.length > 300 || !PHOTO_FILE.test(p.file) || !Number.isInteger(p.width) || p.width < 1 || !Number.isInteger(p.height) || p.height < 1) throw new Error('사진 형식이 올바르지 않습니다.');
      ids.add(p.id);
      return { id: p.id, name: p.name, file: p.file, width: p.width, height: p.height };
    }),
    color: value.color,
  };
}
function validateData(value) {
  if (!value || ![1, 2, 3].includes(value.version) || !value.days || typeof value.days !== 'object' || Array.isArray(value.days) || Object.keys(value.days).length > 110000) throw new Error('지원하지 않는 달력 파일입니다.');
  const days = {};
  for (const [key, entry] of Object.entries(value.days)) {
    if (!validDate(key)) throw new Error('날짜 형식이 올바르지 않습니다.');
    days[key] = validateEntry(entry, value.version < 3);
  }
  return { version: 3, days, settings: validateSettings(value.settings) };
}
class CalendarStore {
  constructor(directory) {
    this.directory = directory;
    this.photoDirectory = path.join(directory, 'photos');
    this.filename = path.join(directory, 'calendar.json');
    fs.mkdirSync(this.photoDirectory, { recursive: true });
    this.recovered = false;
    if (!fs.existsSync(this.filename)) {
      this.data = { version: 3, days: {}, settings: { ...DEFAULT_SETTINGS } };
    } else {
      try { this.data = validateData(JSON.parse(fs.readFileSync(this.filename, 'utf8'))); }
      catch {
        try {
          this.data = validateData(JSON.parse(fs.readFileSync(this.filename + '.bak', 'utf8')));
          fs.copyFileSync(this.filename, this.filename + '.damaged-' + Date.now());
          fs.copyFileSync(this.filename + '.bak', this.filename);
          this.recovered = true;
        } catch { throw new Error('달력 파일을 읽을 수 없습니다. 원본을 보호하기 위해 저장을 중단했습니다. 데이터 폴더의 calendar.json을 확인해 주세요.'); }
      }
    }
  }
  commit(next) {
    const temporary = this.filename + '.tmp';
    const fd = fs.openSync(temporary, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(next, null, 2)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    if (fs.existsSync(this.filename)) fs.copyFileSync(this.filename, this.filename + '.bak');
    fs.renameSync(temporary, this.filename);
    this.data = next;
  }
  saveDay(key, value) {
    if (!validDate(key)) throw new Error('날짜 형식이 올바르지 않습니다.');
    const entry = validateEntry(value);
    for (const photo of entry.photos) if (!fs.existsSync(path.join(this.photoDirectory, photo.file))) throw new Error('사진 파일을 찾을 수 없습니다.');
    const days = { ...this.data.days };
    if (!entry.text.length && !entry.photos.length && entry.color === 'none') delete days[key];
    else days[key] = entry;
    this.commit({ ...this.data, days });
  }
  saveSettings(settings) { this.commit({ ...this.data, settings: validateSettings(settings) }); }
  exportBackup() {
    const photos = {};
    for (const entry of Object.values(this.data.days)) for (const photo of entry.photos) {
      if (!photos[photo.file]) photos[photo.file] = fs.readFileSync(path.join(this.photoDirectory, photo.file)).toString('base64');
    }
    return JSON.stringify({ format: 'photo-calendar-backup', ...this.data, files: photos });
  }
  async restoreBackup(raw, validateImage) {
    if (raw.format !== 'photo-calendar-backup' || !raw.files || typeof raw.files !== 'object') throw new Error('Photo Calendar 백업 파일이 아닙니다.');
    const data = validateData(raw);
    const buffers = new Map();
    for (const entry of Object.values(data.days)) for (const photo of entry.photos) {
      if (buffers.has(photo.file)) continue;
      const encoded = raw.files[photo.file];
      if (typeof encoded !== 'string' || encoded.length > 42 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('백업의 사진이 손상되었거나 너무 큽니다.');
      const bytes = Buffer.from(encoded, 'base64');
      await validateImage(bytes);
      buffers.set(photo.file, bytes);
    }
    // Preserve all current content before replacing the calendar. Never remove originals.
    fs.writeFileSync(path.join(this.directory, 'before-restore-' + Date.now() + '.json'), this.exportBackup());
    const renamed = new Map();
    for (const [file, bytes] of buffers) {
      const filename = require('node:crypto').randomUUID() + path.extname(file);
      fs.writeFileSync(path.join(this.photoDirectory, filename), bytes, { flag: 'wx' });
      renamed.set(file, filename);
    }
    for (const entry of Object.values(data.days)) for (const photo of entry.photos) photo.file = renamed.get(photo.file);
    // Machine-specific window/startup settings remain the user's current settings.
    data.settings = { ...data.settings, windowMode: this.data.settings.windowMode, startAtLogin: this.data.settings.startAtLogin };
    this.commit(data);
    return this.data;
  }
}
module.exports = { CalendarStore, DEFAULT_SETTINGS, PHOTO_FILE, validDate, validateEntry, validateData, validateSettings };

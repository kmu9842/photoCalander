import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CalendarStore, validDate } = require('../electron/store.cjs');
const directories: string[] = [];
function makeStore() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-unit-')); directories.push(dir); return new CalendarStore(dir); }
const text = '한글 기록\n\n여러 줄 취소선';
const entry = { text, strikes: [{ from: text.indexOf('취소선'), to: text.length }], photos: [], color: 'sage' };
afterEach(() => { for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
describe('durable local calendar storage', () => {
  it('persists expanded typography, borders and country preferences across restart and backup', async () => {
    const store = makeStore();
    store.saveSettings({ ...store.data.settings, fontSize: 48, fontFamily: '맑은 고딕', lineWidth: 3.5, holidayCountry: 'JP', showHolidays: false });
    const saved = new CalendarStore(store.directory).data.settings;
    expect(saved).toMatchObject({ fontSize: 48, fontFamily: '맑은 고딕', lineWidth: 3.5, holidayCountry: 'JP', showHolidays: false });
    const restored = makeStore();
    await restored.restoreBackup(JSON.parse(store.exportBackup()), () => undefined);
    expect(restored.data.settings).toEqual(saved);
    for (const fontSize of [8, 13, 24, 48]) expect(() => store.saveSettings({ ...saved, fontSize })).not.toThrow();
    for (const fontSize of [7, 49, 13.5, NaN, Infinity]) expect(() => store.saveSettings({ ...saved, fontSize })).toThrow();
    expect(() => store.saveSettings({ ...saved, lineWidth: -1 })).toThrow();
    expect(() => store.saveSettings({ ...saved, holidayCountry: '../KR' })).toThrow();
  });
  it('persists multiline text, blank lines, strikes, and colors across restarts', () => {
    const store = makeStore(); store.saveDay('2026-10-17', entry);
    expect(new CalendarStore(store.directory).data.days['2026-10-17']).toEqual(entry);
  });
  it('opens older settings without changing records and persists the calendar background', () => {
    const store = makeStore();
    const { backgroundColor: _backgroundColor, ...oldSettings } = store.data.settings;
    const original = JSON.stringify({ version: 3, days: { '2026-10-17': entry }, settings: oldSettings });
    fs.writeFileSync(store.filename, original);
    const loaded = new CalendarStore(store.directory);
    expect(loaded.data.settings.backgroundColor).toBe('none');
    expect(fs.readFileSync(store.filename, 'utf8')).toBe(original);
    loaded.saveSettings({ ...loaded.data.settings, backgroundColor: '#bFdbFe' });
    const reopened = new CalendarStore(store.directory);
    expect(reopened.data.settings).toMatchObject({ backgroundColor: '#bFdbFe', opacity: 30 });
    expect(reopened.data.days['2026-10-17']).toEqual(entry);
    expect(() => reopened.saveSettings({ ...reopened.data.settings, backgroundColor: 'invalid' })).toThrow();
    expect(new CalendarStore(store.directory).data.settings.backgroundColor).toBe('#bFdbFe');
  });
  it('recovers the previous valid record after a damaged primary file', () => {
    const store = makeStore(); store.saveDay('2026-10-17', entry); store.saveDay('2026-10-18', entry);
    fs.writeFileSync(store.filename, '{damaged');
    const recovered = new CalendarStore(store.directory);
    expect(recovered.recovered).toBe(true);
    expect(recovered.data.days['2026-10-17']).toEqual(entry);
    expect(fs.readdirSync(store.directory).some((name: string) => name.includes('.damaged-'))).toBe(true);
  });
  it('refuses to overwrite invalid storage without a valid backup', () => {
    const store = makeStore(); fs.writeFileSync(store.filename, '{broken');
    expect(() => new CalendarStore(store.directory)).toThrow();
    expect(fs.readFileSync(store.filename, 'utf8')).toBe('{broken');
  });
  it('rejects invalid dates and path traversal without changing data', () => {
    const store = makeStore();
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('2024-02-29')).toBe(true);
    expect(() => store.saveDay('2026-02-30', entry)).toThrow();
    expect(() => store.saveDay('2026-10-17', { ...entry, photos: [{ id: 'photo', name: 'escape', file: '../private.png', width: 10, height: 10 }] })).toThrow();
    expect(store.data.days).toEqual({});
  });
  it('round-trips backup photos and keeps a pre-restore backup', async () => {
    const store = makeStore();
    const file = '00000000-0000-4000-8000-000000000000.png';
    fs.writeFileSync(path.join(store.photoDirectory, file), Buffer.from('fixture'));
    store.saveDay('2026-10-17', { ...entry, photos: [{ id: 'photo', name: '사진.png', file, width: 10, height: 10 }] });
    store.saveSettings({ ...store.data.settings, backgroundColor: '#bfdbfe' });
    const backup = JSON.parse(store.exportBackup());
    const second = makeStore(); second.saveDay('2026-10-18', entry);
    await second.restoreBackup(backup, () => undefined);
    const photo = second.data.days['2026-10-17'].photos[0];
    expect(fs.readFileSync(path.join(second.photoDirectory, photo.file), 'utf8')).toBe('fixture');
    expect(second.data.days['2026-10-17'].text).toEqual(entry.text);
    expect(second.data.settings.backgroundColor).toBe('#bfdbfe');
    expect(fs.readdirSync(second.directory).some((name: string) => name.startsWith('before-restore-'))).toBe(true);
  });
  it('rejects a broken photo backup before replacing any current records', async () => {
    const store = makeStore(); store.saveDay('2026-10-17', entry);
    const raw = JSON.parse(store.exportBackup());
    raw.days['2026-10-18'] = { ...entry, photos: [{ id: 'photo', name: '사진.png', file: '00000000-0000-4000-8000-000000000000.png', width: 10, height: 10 }] };
    await expect(store.restoreBackup(raw, () => undefined)).rejects.toThrow();
    expect(new CalendarStore(store.directory).data.days).toEqual({ '2026-10-17': entry });
  });
  it('reads legacy checklist records as one memo without modifying the original file', () => {
    const store = makeStore();
    const legacy = { version: 1, settings: store.data.settings, days: { '2026-10-17': { photos: [], color: 'none', notes: [
      { id: 'a', text: '첫 줄\n둘째 줄', done: false },
      { id: 'b', text: '', done: false },
      { id: 'c', text: '일부 ~~취소선~~', done: false },
      { id: 'd', text: '완료된 ~~기록~~', done: true },
    ] } } };
    const original = JSON.stringify(legacy);
    fs.writeFileSync(store.filename, original);
    const migrated = new CalendarStore(store.directory);
    const memo = migrated.data.days['2026-10-17'];
    expect(memo.text).toBe('첫 줄\n둘째 줄\n\n일부 취소선\n완료된 기록');
    expect(memo.strikes.map((range: { from: number; to: number }) => memo.text.slice(range.from, range.to))).toEqual(['취소선', '완료된 기록']);
    expect(fs.readFileSync(store.filename, 'utf8')).toBe(original);
    migrated.saveDay('2026-10-18', entry);
    expect(new CalendarStore(store.directory).data).toEqual(migrated.data);
    expect(JSON.parse(fs.readFileSync(store.filename, 'utf8')).version).toBe(3);
  });
  it('migrates v2 strike markers once and treats newly typed tildes as literal text', () => {
    const store = makeStore();
    fs.writeFileSync(store.filename, JSON.stringify({ version: 2, settings: store.data.settings, days: { '2026-10-17': { text: '앞 ~~sfafas~~ 뒤', photos: [], color: 'none' } } }));
    const migrated = new CalendarStore(store.directory);
    expect(migrated.data.days['2026-10-17']).toMatchObject({ text: '앞 sfafas 뒤', strikes: [{ from: 2, to: 8 }] });
    migrated.saveDay('2026-10-18', { text: '문자 ~~그대로~~', strikes: [], photos: [], color: 'none' });
    const restored = new CalendarStore(store.directory);
    expect(restored.data.days['2026-10-18'].text).toBe('문자 ~~그대로~~');
    expect(restored.data.days['2026-10-18'].strikes).toEqual([]);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BUILTIN_THEMES, resolvedTheme, themePatch } from '../src/themes';
import { photoBox } from '../src/photo-layout';
const { CalendarStore, validateSettings, DEFAULT_SETTINGS, validateEntry } = createRequire(import.meta.url)('../electron/store.cjs');
const dirs: string[] = [];
const make = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-themes-')); dirs.push(dir); return new CalendarStore(dir); };
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const photo = { id: 'photo', file: randomUUID() + '.jpg', name: '추억.jpg', width: 1200, height: 800 };
describe('saved themes and photo arrangements', () => {
  it('keeps the chosen font size when applying any theme and persists the privacy cover', () => {
    const store = make();
    store.saveSettings({ ...store.data.settings, fontSize: 21, privacyLocked: true });
    for (const theme of BUILTIN_THEMES) {
      store.saveSettings({ ...store.data.settings, ...themePatch(theme) });
      expect(store.data.settings.fontSize).toBe(21);
    }
    const custom = { ...BUILTIN_THEMES[2], id: 'my-theme', fontSize: 8 };
    store.saveSettings({ ...store.data.settings, customThemes: [custom], ...themePatch(custom, true) });
    expect(new CalendarStore(store.directory).data.settings).toMatchObject({ fontSize: 21, privacyLocked: true });
    const { privacyLocked: _locked, ...oldSettings } = DEFAULT_SETTINGS;
    expect(validateSettings(oldSettings).privacyLocked).toBe(false);
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, privacyLocked: 'yes' })).toThrow();
  });
  it('follows system brightness by default, persists overrides and keeps the selected design', () => {
    const { colorMode: _mode, softFocus: _focus, ...old } = DEFAULT_SETTINGS;
    expect(validateSettings(old)).toMatchObject({ colorMode: 'system', softFocus: true });
    const light = resolvedTheme(DEFAULT_SETTINGS, false), dark = resolvedTheme(DEFAULT_SETTINGS, true);
    expect(light.mode).toBe('light'); expect(dark.mode).toBe('dark');
    expect(dark.id).toBe(light.id); expect(dark.defaultFrame).toBe(light.defaultFrame);
    expect(dark.background).not.toBe(light.background);
    const store = make();
    store.saveSettings({ ...store.data.settings, colorMode: 'light', softFocus: false });
    const settings = new CalendarStore(store.directory).data.settings;
    expect(settings).toMatchObject({ colorMode: 'light', softFocus: false });
    expect(resolvedTheme(settings, true).mode).toBe('light');
    expect(() => validateSettings({ ...settings, colorMode: 'unknown' })).toThrow();
    expect(() => validateSettings({ ...settings, softFocus: 'yes' })).toThrow();
  });
  it('preserves legacy defaults while persisting custom themes and per-photo placement through backup and restart', async () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    const store = make();
    const theme = { ...BUILTIN_THEMES[2], id: 'my-paper', name: '나의 종이' };
    store.saveSettings({ ...store.data.settings, theme: 'custom', customThemeId: theme.id, customThemes: [theme] });
    fs.writeFileSync(path.join(store.photoDirectory, photo.file), 'fixture');
    const entry = { text: '기록', strikes: [], color: 'none', photoSize: 'medium', photos: [{ ...photo, frame: 'stamp', placement: { x: 12, y: 87, rotation: -13 } }] };
    store.saveDay('2026-10-18', entry);
    expect(new CalendarStore(store.directory).data.days['2026-10-18']).toEqual(entry);
    const restored = make();
    await restored.restoreBackup(JSON.parse(store.exportBackup()), () => undefined);
    expect(restored.data.settings.customThemes).toEqual([theme]);
    expect(restored.data.settings.customThemeId).toBe(theme.id);
    expect(restored.data.days['2026-10-18'].photos[0]).toMatchObject({ frame: 'stamp', placement: entry.photos[0].placement });
    expect(restored.data.days['2026-10-18'].photos[0].file).not.toBe(photo.file);
  });
  it('rejects corrupted and unsafe theme/placement values before saving', () => {
    const theme = { ...BUILTIN_THEMES[2], id: 'custom' };
    for (const patch of [{ background: 'url(https://example.test)' }, { opacity: Infinity }, { fontSize: 90 }, { radius: -1 }, { texture: '../secret' }, { defaultFrame: 'unknown' }, { name: '' }]) expect(() => validateSettings({ ...DEFAULT_SETTINGS, customThemes: [{ ...theme, ...patch }] })).toThrow();
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, theme: 'custom' })).toThrow();
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, customThemeId: 'missing' })).toThrow();
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, customThemes: [theme, theme] })).toThrow();
    for (const patch of [{ frame: 'unknown' }, { placement: { x: -1, y: 50, rotation: 0 } }, { placement: { x: 50, y: Infinity, rotation: 0 } }, { placement: { x: 50, y: 50, rotation: 31 } }]) expect(() => validateEntry({ text: '', strikes: [], color: 'none', photos: [{ ...photo, ...patch }] })).toThrow();
  });
  it('keeps rotated photos inside cells at every corner and small window sizes', () => {
    for (const width of [60, 170, 300]) for (const height of [54, 130, 250]) for (const x of [0,50,100]) for (const y of [0,100]) for (const rotation of [-30,0,30]) for (const size of ['small','medium'] as const) {
      const box = photoBox({ ...photo, placement: { x, y, rotation }, frame: 'polaroid' }, size, width, height);
      const radians = rotation * Math.PI / 180, boundW = box.width * Math.abs(Math.cos(radians)) + box.height * Math.abs(Math.sin(radians)), boundH = box.height * Math.abs(Math.cos(radians)) + box.width * Math.abs(Math.sin(radians));
      const centerX = box.left + box.width / 2, centerY = box.top + box.height / 2;
      expect(centerX - boundW / 2).toBeGreaterThanOrEqual(3.999);
      expect(centerX + boundW / 2).toBeLessThanOrEqual(width - 3.999);
      expect(centerY - boundH / 2).toBeGreaterThanOrEqual(3.999);
      expect(centerY + boundH / 2).toBeLessThanOrEqual(height - 3.999);
    }
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseWorkbook, exportWorkbook, applyImport } = require('../electron/excel.cjs');
const { CalendarStore } = require('../electron/store.cjs');
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const memo = { text: '=회의 준비\n완료 🙂', strikes: [{ from: 7, to: 12 }], textColors: [{ from: 0, to: 6, color: '#ff9595' }], photos: [], color: '#bfdbfe' };

describe('CalendarTask Excel exchange', () => {
  it.each(['list', 'calendar'])('preserves character sizes in %s Excel exchange', async format => {
    const styled = { ...memo, textSizes: [{ from: 1, to: 4, size: 23 }, { from: 7, to: 12, size: 32 }] };
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(await exportWorkbook({ '2026-10-29': styled }, format).xlsx.writeBuffer());
    expect(parseWorkbook(reopened).days['2026-10-29']).toMatchObject(styled);
  });
  it.each(['list', 'calendar'])('round-trips dates, multiline text, literal formulas, strikes, and colors in %s format', async format => {
    const days = { '2026-10-29': memo, '2027-01-01': { ...memo, text: '새해', strikes: [], textColors: undefined } };
    const workbook = exportWorkbook(days, format);
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
    const parsed = parseWorkbook(reopened);
    expect(parsed.ambiguities).toEqual([]);
    expect(parsed.count).toBe(2);
    expect(parsed.days).toEqual(days);
    if (format === 'list') {
      expect(reopened.worksheets[0].name).toBe('CalendarTask');
      expect(reopened.worksheets[0].getCell('A1').value).toBeInstanceOf(Date);
    }
  });
  it('requires an explicit month for a numeric 2026.1 label when January and October both fit', () => {
    const wb = new ExcelJS.Workbook(), sheet = wb.addWorksheet('캘린더 목록™');
    sheet.addRow(['', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']);
    sheet.mergeCells('A2:A3'); sheet.getCell('A2').value = 2026.1;
    sheet.getCell('H2').value = 25;
    sheet.getCell('B3').value = '26\n메모';
    sheet.getCell('E3').value = { richText: [{ text: '29\n' }, { text: '완료', font: { strike: true, color: { argb: 'FF808080' } } }] };
    const parsed = parseWorkbook(wb);
    expect(parsed.count).toBe(0);
    expect(parsed.ambiguities[0].candidates).toEqual(['2026-01', '2026-10']);
    const resolved = parseWorkbook(wb, { [parsed.ambiguities[0].id]: '2026-10' });
    expect(resolved.days['2026-10-29']).toMatchObject({ text: '완료', strikes: [{ from: 0, to: 2 }], textColors: [{ from: 0, to: 2, color: '#808080' }] });
    expect(() => parseWorkbook(wb, { [parsed.ambiguities[0].id]: '2026-02' })).toThrow();
  });
  it('merges idempotently, preserves photos and other dates, and backs up before replacement', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photocalendar-excel-')); directories.push(dir);
    const store = new CalendarStore(dir);
    const photo = { id: 'p', name: 'photo.png', file: '00000000-0000-4000-8000-000000000000.png', width: 10, height: 10 };
    fs.writeFileSync(path.join(store.photoDirectory, photo.file), 'image fixture');
    store.saveDay('2026-10-29', { text: '기존 메모', strikes: [], photos: [photo], color: 'none', fontSize: 18, photoBlur: true, photoSize: 'small', textSizes: [{ from: 0, to: 2, size: 20 }] });
    store.saveDay('2026-10-30', { text: '유지', strikes: [], photos: [], color: 'none' });
    const parsed = parseWorkbook(exportWorkbook({ '2026-10-29': memo }, 'list'));
    applyImport(store, parsed, 'merge');
    const merged = store.data.days['2026-10-29'];
    expect(merged.text).toBe('기존 메모\n' + memo.text);
    expect(merged.photos).toEqual([photo]);
    expect(merged).toMatchObject({ fontSize: 18, photoBlur: true, photoSize: 'small', textSizes: [{ from: 0, to: 2, size: 20 }] });
    applyImport(store, parsed, 'merge');
    expect(store.data.days['2026-10-29']).toEqual(merged);
    applyImport(store, parsed, 'replace');
    expect(store.data.days['2026-10-29']).toEqual({ ...memo, photos: [photo], fontSize: 18, photoBlur: true, photoSize: 'small' });
    expect(store.data.days['2026-10-30'].text).toBe('유지');
    expect(fs.readdirSync(dir).some(file => file.startsWith('before-excel-'))).toBe(true);
  });
  it('rejects invalid dates and formulas rather than silently discarding records', () => {
    const wb = new ExcelJS.Workbook(), sheet = wb.addWorksheet('CalendarTask');
    sheet.addRow(['2026-02-30', '메모']);
    expect(() => parseWorkbook(wb)).toThrow();
    sheet.getCell('A1').value = new Date('2026-10-29T00:00:00Z');
    sheet.getCell('B1').value = { formula: '1+1', result: 2 };
    expect(() => parseWorkbook(wb)).toThrow();
  });
});

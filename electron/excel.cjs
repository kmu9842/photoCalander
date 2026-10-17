const ExcelJS = require('exceljs');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validDate, validateEntry } = require('./store.cjs');

const WEEKDAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const keyOf = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const colorOf = color => typeof color?.argb === 'string' && /^[0-9a-f]{8}$/i.test(color.argb) ? '#' + color.argb.slice(2).toLowerCase() : undefined;
function pushRange(ranges, from, to, color, size) {
  if (to <= from) return;
  const previous = ranges.at(-1);
  if (previous?.to === from && previous.color === color && previous.size === size) previous.to = to;
  else ranges.push({ from, to, ...(color ? { color } : {}), ...(size !== undefined ? { size } : {}) });
}
function cellMemo(cell, skip = 0) {
  const value = cell.value;
  if (value && typeof value === 'object' && !Array.isArray(value.richText)) throw new Error(`${cell.address}: 수식 대신 메모 텍스트를 입력해 주세요.`);
  const runs = value?.richText || [{ text: value == null ? '' : String(value), font: cell.font }];
  let text = '';
  const strikes = [], textColors = [], textSizes = [];
  for (const run of runs) {
    const part = run.text.replace(/\r\n?/g, '\n');
    const from = text.length;
    text += part;
    const font = { ...cell.font, ...run.font };
    if (font.strike) pushRange(strikes, Math.max(0, from - skip), text.length - skip);
    const color = colorOf(font.color);
    if (color) pushRange(textColors, Math.max(0, from - skip), text.length - skip, color);
    // Rich-text runs without a size inherit the calendar default, not Excel's implicit 11pt.
    const pointSize = run.font?.size;
    if (Number.isFinite(pointSize) && pointSize > 0) pushRange(textSizes, Math.max(0, from - skip), text.length - skip, undefined, Math.max(8, Math.min(48, Math.round(pointSize * 4 / 3))));
  }
  const color = cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid' ? colorOf(cell.fill.fgColor) : undefined;
  return { text: text.slice(skip), strikes, ...(textColors.length ? { textColors } : {}), ...(textSizes.length ? { textSizes } : {}), photos: [], color: color || 'none' };
}
function dateCell(cell, date1904) {
  const value = cell.value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return keyOf(value);
  if (typeof value === 'number' && value >= 1 && value <= 110000) return keyOf(new Date((Math.floor(value) - (date1904 ? 24107 : 25569)) * 86400000));
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})(?:日)?$/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return null;
}
function appendMemo(existing, incoming) {
  if (!existing?.text) return { ...existing, ...incoming, textSizes: incoming.textSizes, textColors: incoming.textColors, photos: existing?.photos || [], color: incoming.color === 'none' ? existing?.color || 'none' : incoming.color };
  if (!incoming.text || existing.text === incoming.text || existing.text.endsWith('\n' + incoming.text)) return existing;
  const offset = existing.text.length + 1;
  const textColors = [...(existing.textColors || []), ...(incoming.textColors || []).map(range => ({ ...range, from: range.from + offset, to: range.to + offset }))];
  const textSizes = [...(existing.textSizes || []), ...(incoming.textSizes || []).map(range => ({ ...range, from: range.from + offset, to: range.to + offset }))];
  return { ...existing, text: existing.text + '\n' + incoming.text, strikes: [...existing.strikes, ...incoming.strikes.map(range => ({ from: range.from + offset, to: range.to + offset }))], ...(textColors.length ? { textColors } : {}), ...(textSizes.length ? { textSizes } : {}) };
}
async function readWorkbook(filename) {
  if (fs.statSync(filename).size > 50 * 1024 * 1024) throw new Error('엑셀 파일은 50MB 이하로 가져와 주세요.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  return workbook;
}
function parseWorkbook(workbook, choices = {}) {
  const days = {}, ambiguities = [], formats = new Set();
  const add = (date, entry) => {
    if (!validDate(date)) throw new Error(`올바르지 않은 날짜입니다: ${date}`);
    if (!entry.text && entry.color === 'none') return;
    days[date] = appendMemo(days[date], validateEntry(entry));
  };
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > 110000 || sheet.columnCount > 1000) throw new Error('가져올 엑셀 범위가 너무 큽니다.');
    const isCalendar = WEEKDAYS.every((day, index) => sheet.getCell(1, index + 2).text.trim() === day);
    if (isCalendar) {
      formats.add('calendar');
      const groups = new Map();
      for (let row = 2; row <= sheet.rowCount; row++) {
        const label = sheet.getCell(row, 1).master;
        if (!label.value) continue;
        const id = `${sheet.id}:${label.address}`;
        if (!groups.has(id)) groups.set(id, { label, cells: [] });
        for (let column = 2; column <= 8; column++) {
          const cell = sheet.getCell(row, column);
          if (cell.value == null) continue;
          const match = cell.text.replace(/\r\n?/g, '\n').match(/^(\d{1,2})(?:\n|$)/);
          if (!match) throw new Error(`${sheet.name}!${cell.address}: 날짜가 없는 달력 칸입니다.`);
          groups.get(id).cells.push({ cell, day: Number(match[1]), skip: match[0].length, weekday: (column - 1) % 7 });
        }
      }
      for (const [id, { label, cells }] of groups) {
        const match = String(label.value).trim().match(/^(\d{4})[.\-/](\d{1,2})$/);
        if (!match) throw new Error(`${sheet.name}!${label.address}: 연월을 읽지 못했습니다.`);
        const year = Number(match[1]);
        const months = [Number(match[2])];
        // Excel stores 2026.10 as the number 2026.1. January and October can even share weekdays.
        if (typeof label.value === 'number' && match[2] === '1') months.push(10);
        const candidates = months.filter(month => month >= 1 && month <= 12 && cells.every(({ day, weekday }) => {
          const date = new Date(Date.UTC(year, month - 1, day));
          return day >= 1 && date.getUTCMonth() === month - 1 && date.getUTCDay() === weekday;
        })).map(month => `${year}-${String(month).padStart(2, '0')}`);
        if (!candidates.length) throw new Error(`${sheet.name}!${label.address}: 연월과 요일이 맞지 않습니다.`);
        const selected = choices[id] || (candidates.length === 1 ? candidates[0] : '');
        if (!selected) { ambiguities.push({ id, label: `${sheet.name} · ${label.address} (${label.text})`, candidates }); continue; }
        if (!candidates.includes(selected)) throw new Error('선택한 연월이 파일의 날짜와 맞지 않습니다.');
        for (const { cell, day, skip } of cells) add(`${selected}-${String(day).padStart(2, '0')}`, cellMemo(cell, skip));
      }
    } else {
      let matched = false;
      sheet.eachRow(row => {
        const date = dateCell(row.getCell(1), workbook.properties.date1904);
        if (date) { matched = true; add(date, cellMemo(row.getCell(2))); }
        else if (row.getCell(2).text && !(row.number === 1 && /^(날짜|date|日期)$/i.test(row.getCell(1).text.trim()))) throw new Error(`${sheet.name}!A${row.number}: 날짜를 읽지 못했습니다.`);
      });
      if (matched || sheet.name === 'CalendarTask' && sheet.rowCount === 0) formats.add('list');
    }
  }
  if (!formats.size) throw new Error('CalendarTask의 목록형 또는 달력형 엑셀 파일을 선택해 주세요.');
  const dates = Object.keys(days).sort();
  return { days, ambiguities, format: [...formats].join('+'), count: dates.length, firstDate: dates[0] || '', lastDate: dates.at(-1) || '' };
}
function richText(entry, prefix = '') {
  const colors = entry.textColors || [];
  const sizes = entry.textSizes || [];
  const boundaries = [...new Set([0, entry.text.length, ...[...entry.strikes, ...colors, ...sizes].flatMap(range => [range.from, range.to])])].sort((a, b) => a - b);
  const runs = prefix ? [{ text: prefix }] : [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i], to = boundaries[i + 1], font = {};
    if (entry.strikes.some(range => range.from <= from && range.to > from)) font.strike = true;
    const color = colors.find(range => range.from <= from && range.to > from)?.color;
    if (color) font.color = { argb: 'FF' + color.slice(1).toUpperCase() };
    const size = sizes.find(range => range.from <= from && range.to > from)?.size ?? entry.fontSize;
    if (size !== undefined) font.size = size * 3 / 4;
    runs.push({ text: entry.text.slice(from, to), ...(Object.keys(font).length ? { font } : {}) });
  }
  return { richText: runs.length ? runs : [{ text: '' }] };
}
function writeEntry(cell, entry, prefix = '') {
  // XLSX strings are literal values, including user text that begins with '='.
  if (entry.text.length + prefix.length > 32767) throw new Error('엑셀 한 칸에는 32,767자까지 저장할 수 있습니다. 긴 메모는 JSON 백업을 사용해 주세요.');
  cell.value = richText(entry, prefix);
  cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  if (/^#[0-9a-f]{6}$/i.test(entry.color)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + entry.color.slice(1).toUpperCase() } };
}
function exportWorkbook(days, format, fallbackMonth = new Date().toISOString().slice(0, 7)) {
  if (!['list', 'calendar'].includes(format)) throw new Error('엑셀 내보내기 형식이 올바르지 않습니다.');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Photo Calendar';
  const entries = Object.entries(days).filter(([, day]) => day.text || day.color !== 'none');
  if (format === 'list') {
    const sheet = workbook.addWorksheet('CalendarTask');
    sheet.getColumn(1).width = 16; sheet.getColumn(2).width = 70;
    for (const [date, entry] of entries.sort(([a], [b]) => b.localeCompare(a))) {
      const row = sheet.addRow([new Date(date + 'T00:00:00Z')]);
      row.getCell(1).numFmt = 'yyyy-mm-dd';
      writeEntry(row.getCell(2), entry);
    }
  } else {
    const sheet = workbook.addWorksheet('캘린더 목록™');
    sheet.addRow(['', ...WEEKDAYS]);
    sheet.getColumn(1).width = 12;
    for (let column = 2; column <= 8; column++) sheet.getColumn(column).width = 24;
    const months = [...new Set(entries.map(([date]) => date.slice(0, 7)))].sort();
    if (!months.length) months.push(fallbackMonth);
    let row = 2;
    for (const month of months) {
      const [year, number] = month.split('-').map(Number);
      const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
      const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
      const weeks = Math.ceil((offset + length) / 7);
      sheet.mergeCells(row, 1, row + weeks - 1, 1);
      sheet.getCell(row, 1).value = `${year}.${String(number).padStart(2, '0')}`;
      sheet.getCell(row, 1).alignment = { vertical: 'top' };
      for (let day = 1; day <= length; day++) {
        const index = offset + day - 1;
        const cell = sheet.getCell(row + Math.floor(index / 7), index % 7 + 2);
        const entry = days[`${month}-${String(day).padStart(2, '0')}`];
        if (entry?.text || entry?.color !== undefined && entry.color !== 'none') writeEntry(cell, entry, `${day}\n`);
        else cell.value = day;
        cell.alignment = { vertical: 'top', wrapText: true };
      }
      for (let week = 0; week < weeks; week++) sheet.getRow(row + week).height = 100;
      row += weeks;
    }
  }
  return workbook;
}
function applyImport(store, parsed, mode, source = 'excel') {
  if (parsed.ambiguities.length) throw new Error('모호한 연월을 먼저 선택해 주세요.');
  if (!['merge', 'replace'].includes(mode)) throw new Error('가져오기 방식이 올바르지 않습니다.');
  const days = { ...store.data.days };
  for (const [date, entry] of Object.entries(parsed.days)) {
    const existing = days[date];
    const next = mode === 'merge' ? appendMemo(existing, entry) : { ...existing, ...entry, textSizes: entry.textSizes, textColors: entry.textColors, photos: existing?.photos || [], color: entry.color === 'none' ? existing?.color || 'none' : entry.color };
    days[date] = validateEntry(next);
  }
  if (!parsed.count) throw new Error('가져올 메모가 없습니다.');
  fs.writeFileSync(path.join(store.directory, `before-${source === 'ical' ? 'calendar' : 'excel'}-${Date.now()}-${randomUUID()}.json`), JSON.stringify(store.data), { flag: 'wx' });
  store.commit({ ...store.data, days });
  return store.data;
}
module.exports = { readWorkbook, parseWorkbook, exportWorkbook, applyImport };

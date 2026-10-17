import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
const require = createRequire(import.meta.url);
const { readCalendarFile, parseCalendars } = require('../electron/ical.cjs');
const { previewCalendar } = require('../electron/ical-import.cjs');
const { CalendarStore } = require('../electron/store.cjs');
const { applyImport } = require('../electron/excel.cjs');
const event = (body: string) => `BEGIN:VEVENT\r\n${body.replaceAll('\n', '\r\n')}\r\nEND:VEVENT`;
const calendar = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:내 일정\r\n${events.join('\r\n')}\r\nEND:VCALENDAR`;
const parse = (text: string, from = '2026-10-01', to = '2026-10-31') => parseCalendars([{ name: 'google.ics', text }], { from, to }, 'Asia/Seoul');

describe('Google Calendar ICS import', () => {
  it('preserves all-day dates, exclusive ends, local timed dates, escaped Korean text and multi-day events', () => {
    const result = parse(calendar(
      event('UID:holiday\nDTSTART;VALUE=DATE:20261018\nDTEND;VALUE=DATE:20261020\nSUMMARY:휴가'),
      event('UID:meeting\nDTSTART:20261017T160000Z\nDTEND:20261017T170000Z\nSUMMARY:한글 회의\\, 준비\nDESCRIPTION:첫 줄\\n둘째\n 줄\nLOCATION:서울\\, 본사'),
      event('UID:overnight\nDTSTART;TZID=Asia/Seoul:20261020T230000\nDTEND;TZID=Asia/Seoul:20261021T010000\nSUMMARY:야간 작업'),
      event('UID:midnight\nDTSTART;TZID=Asia/Seoul:20261022T220000\nDTEND;TZID=Asia/Seoul:20261023T000000\nSUMMARY:자정 종료')
    ));
    expect(result.days['2026-10-18'].text).toContain('종일 휴가\n01:00–02:00 한글 회의, 준비\n장소: 서울, 본사\n첫 줄\n둘째줄');
    expect(result.days['2026-10-19'].text).toBe('종일 휴가');
    expect(result.days['2026-10-20'].text).toBe(result.days['2026-10-21'].text);
    expect(result.days['2026-10-20'].text).not.toContain('휴가');
    expect(result.days['2026-10-23']).toBeUndefined();
    expect(result.calendars).toEqual(['내 일정']);
  });
  it('expands timezone-aware recurrence across DST, exclusions, moved instances and cancellations', () => {
    const result = parse(calendar(
      event('UID:weekly\nDTSTART;TZID=America/New_York:20260301T090000\nDTEND;TZID=America/New_York:20260301T100000\nRRULE:FREQ=WEEKLY;COUNT=4\nEXDATE;TZID=America/New_York:20260308T090000\nSUMMARY:주간 회의'),
      event('UID:weekly\nRECURRENCE-ID;TZID=America/New_York:20260315T090000\nDTSTART;TZID=America/New_York:20260315T110000\nDTEND;TZID=America/New_York:20260315T120000\nSUMMARY:시간 변경'),
      event('UID:weekly\nRECURRENCE-ID;TZID=America/New_York:20260322T090000\nDTSTART;TZID=America/New_York:20260322T090000\nSTATUS:CANCELLED'),
      event('UID:dst\nDTSTART;TZID=America/New_York:20260301T090000\nDTEND;TZID=America/New_York:20260301T100000\nRRULE:FREQ=WEEKLY;COUNT=2\nSUMMARY:DST 확인')
    ), '2026-03-01', '2026-03-31');
    expect(result.days['2026-03-01'].text).toContain('23:00');
    expect(result.days['2026-03-08'].text).toBe('22:00–23:00 DST 확인');
    expect(result.days['2026-03-15']).toBeUndefined();
    expect(result.days['2026-03-16'].text).toBe('00:00–01:00 시간 변경');
    expect(result.days['2026-03-22']).toBeUndefined();
  });
  it('supports all-day recurrence and RDATE while avoiding duplicate calendars', () => {
    const text = calendar(
      event('UID:daily\nDTSTART;VALUE=DATE:20261001\nRRULE:FREQ=DAILY;COUNT=4\nEXDATE;VALUE=DATE:20261002\nSUMMARY:매일'),
      event('UID:extra\nDTSTART;VALUE=DATE:20261005\nRDATE;VALUE=DATE:20261007,20261009\nSUMMARY:추가 날짜')
    );
    const result = parseCalendars([{ name: 'one', text }, { name: 'two', text }], { from: '2026-10-01', to: '2026-10-31' }, 'Asia/Seoul');
    expect(Object.keys(result.days)).toEqual(['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07', '2026-10-09']);
    expect(result.eventCount).toBe(6);
    expect(result.days['2026-10-03'].text).toBe('종일 매일');
  });
  it('bounds infinite recurrence to the selected range, includes ongoing events, and rejects broken input', () => {
    const text = calendar(event('UID:infinite\nDTSTART;VALUE=DATE:20200101\nRRULE:FREQ=DAILY\nSUMMARY:반복'), event('UID:ongoing\nDTSTART;VALUE=DATE:20260928\nDTEND;VALUE=DATE:20261003\nSUMMARY:연휴'));
    const result = parse(text, '2026-10-01', '2026-10-02');
    expect(Object.keys(result.days)).toEqual(['2026-10-01', '2026-10-02']);
    expect(result.days['2026-10-01'].text).toContain('연휴');
    expect(() => parse('not a calendar')).toThrow();
    expect(() => parse(text, '2026-10-32')).toThrow();
    expect(() => parse(text, '2026-11-01', '2026-10-01')).toThrow();
  });
  it('reads ICS and multi-calendar ZIP without extracting paths; worker returns the same preview', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photocalendar-ical-'));
    try {
      const text = calendar(event('UID:zip\nDTSTART;VALUE=DATE:20261018\nSUMMARY:ZIP 일정'));
      const file = path.join(directory, 'google.zip');
      const zip = new JSZip();
      zip.file('Takeout/Calendar/personal.ics', text); zip.file('work.ics', text); zip.file('ignored.txt', 'ignore');
      await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }));
      const sources = await readCalendarFile(file);
      expect(sources).toHaveLength(2);
      const result = await previewCalendar({ filename: file, range: { from: '2026-10-01', to: '2026-10-31' } });
      expect(result.parsed.eventCount).toBe(1);
      expect(result.parsed.days['2026-10-18'].text).toBe('종일 ZIP 일정');
      expect(await fs.readdir(directory)).toEqual(['google.zip']);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
  it('backs up before import, preserves date settings and formatting, and does not duplicate a repeated merge', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photocalendar-ical-'));
    try {
      const store = new CalendarStore(directory);
      store.saveDay('2026-10-18', { text: '기존 메모', strikes: [{ from: 0, to: 2 }], textSizes: [{ from: 0, to: 2, size: 20 }], fontSize: 18, photoBlur: true, photoSize: 'small', photos: [], color: '#ff0000' });
      const parsed = parse(calendar(event('UID:new\nDTSTART;VALUE=DATE:20261018\nSUMMARY:가져온 일정')));
      applyImport(store, parsed, 'merge', 'ical');
      applyImport(store, parsed, 'merge', 'ical');
      expect(store.data.days['2026-10-18']).toMatchObject({ text: '기존 메모\n종일 가져온 일정', fontSize: 18, photoSize: 'small', photoBlur: true, textSizes: [{ from: 0, to: 2, size: 20 }] });
      applyImport(store, parsed, 'replace', 'ical');
      expect(store.data.days['2026-10-18']).toMatchObject({ text: '종일 가져온 일정', fontSize: 18, photoSize: 'small', color: '#ff0000' });
      expect(store.data.days['2026-10-18'].textSizes).toBeUndefined();
      expect((await fs.readdir(directory)).filter(file => file.startsWith('before-calendar-'))).toHaveLength(3);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
});

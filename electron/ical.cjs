const fs = require('node:fs');
const path = require('node:path');
const ical = require('node-ical');
const JSZip = require('jszip');
const { validDate } = require('./store.cjs');

const DAY = 86400000;
const MAX_BYTES = 64 * 1024 * 1024;
const valueOf = value => String(value?.val ?? value ?? '').replace(/\r\n?/g, '\n').trim();
const localDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const nextDay = key => new Date(Date.parse(key + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);

async function readCalendarFile(filename) {
  if (fs.statSync(filename).size > MAX_BYTES) throw new Error('캘린더 파일은 64MB 이하로 선택해 주세요.');
  const bytes = await fs.promises.readFile(filename);
  if (/\.ics$/i.test(filename)) return [{ name: path.basename(filename), text: bytes.toString('utf8') }];
  if (!/\.zip$/i.test(filename)) throw new Error('구글 캘린더에서 내보낸 .ics 또는 .zip 파일을 선택해 주세요.');
  const archive = await JSZip.loadAsync(bytes);
  const entries = Object.values(archive.files).filter(entry => !entry.dir && /\.ics$/i.test(entry.name));
  if (!entries.length) throw new Error('ZIP 안에 .ics 캘린더 파일이 없습니다.');
  if (entries.length > 100) throw new Error('한 번에 캘린더 100개까지 가져올 수 있습니다.');
  const sources = [];
  let total = 0;
  for (const entry of entries) {
    const chunks = [];
    // Read in memory without extracting paths, and limit inflated ZIP content.
    await new Promise((resolve, reject) => {
      const stream = entry.nodeStream();
      stream.on('data', chunk => {
        total += chunk.length;
        if (total > MAX_BYTES) { stream.destroy(); reject(new Error('압축을 푼 캘린더 내용이 64MB를 초과합니다. 캘린더별로 나누어 가져와 주세요.')); return; }
        chunks.push(chunk);
      });
      stream.once('error', reject);
      stream.once('end', resolve);
    });
    sources.push({ name: entry.name, text: Buffer.concat(chunks).toString('utf8') });
  }
  return sources;
}

function withAdditionalDates(event) {
  if (!event.rdate) return event;
  const dates = [];
  for (const property of [event.rdate].flat()) {
    const params = Object.entries(property?.params ?? {}).map(([key, value]) => `;${key}=${value}`).join('');
    for (const raw of valueOf(property).split(',')) {
      if (raw.includes('/')) throw new Error('기간을 지정한 RDATE 일정은 아직 지원하지 않습니다. 해당 일정을 개별 일정으로 내보내 주세요.');
      const parsed = ical.sync.parseICS(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:rdate\r\nDTSTART${params}:${raw}\r\nEND:VEVENT\r\nEND:VCALENDAR`);
      const date = parsed.rdate?.start;
      if (!(date instanceof Date) || !Number.isFinite(+date)) throw new Error('추가 반복 날짜를 읽지 못했습니다.');
      dates.push(date);
    }
  }
  const rule = event.rrule;
  return { ...event, rrule: { between(from, to, inclusive) {
    const base = rule ? rule.between(from, to, inclusive) : [event.start];
    return [...new Map([...base, ...dates].filter(date => date >= from && date <= to).map(date => [+date, date])).values()].sort((a, b) => a - b);
  } } };
}

function parseCalendars(sources, range, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  if (!range || !validDate(range.from) || !validDate(range.to) || range.from > range.to) throw new Error('가져올 시작일과 종료일을 확인해 주세요.');
  const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayOf = date => {
    const parts = Object.fromEntries(dateFormat.formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const query = { from: new Date(Date.parse(range.from + 'T00:00:00Z') - 2 * DAY), to: new Date(Date.parse(range.to + 'T00:00:00Z') + 3 * DAY), expandOngoing: true };
  const records = {}, seen = new Set(), names = [];
  let eventCount = 0, allocations = 0;
  for (const source of sources) {
    if (!/^BEGIN:VCALENDAR\s*$/im.test(source.text.replace(/^\uFEFF/, '')) || !/^END:VCALENDAR\s*$/im.test(source.text)) throw new Error(`${source.name}: 올바른 iCalendar 파일이 아닙니다.`);
    if ((source.text.match(/^BEGIN:VEVENT\s*$/gim) || []).length !== (source.text.match(/^END:VEVENT\s*$/gim) || []).length) throw new Error(`${source.name}: 일정 데이터가 완전하지 않습니다.`);
    const parsed = ical.sync.parseICS(source.text.replace(/^\uFEFF/, ''));
    names.push(valueOf(parsed.vcalendar?.['WR-CALNAME']) || source.name);
    for (const original of Object.values(parsed)) {
      if (original.type !== 'VEVENT' || original.status === 'CANCELLED') continue;
      if (!(original.start instanceof Date) || !Number.isFinite(+original.start)) throw new Error(`${source.name}: 일정의 시작 날짜를 읽지 못했습니다.`);
      const event = withAdditionalDates(original);
      for (const instance of ical.expandRecurringEvent(event, query)) {
        if (instance.event.status === 'CANCELLED') continue;
        const { start, end, isFullDay } = instance;
        if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start) throw new Error(`${source.name}: 일정의 시간 범위를 확인해 주세요.`);
        const first = isFullDay ? localDay(start) : dayOf(start);
        // DTEND is exclusive: midnight must not add an extra calendar day.
        const lastInstant = new Date(Math.max(+start, +end - 1));
        const last = isFullDay ? localDay(lastInstant) : dayOf(lastInstant);
        if (first > range.to || last < range.from) continue;
        const identity = `${original.uid}:${+start}:${+end}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        if (++eventCount > 50000) throw new Error('일정이 너무 많습니다. 가져올 기간을 줄여 주세요.');
        const data = { ...original, ...instance.event };
        const summary = valueOf(instance.summary) || '(제목 없음)';
        const when = isFullDay ? '종일' : first === dayOf(end)
          ? `${timeFormat.format(start)}${+end > +start ? `–${timeFormat.format(end)}` : ''}`
          : `${first.slice(5)} ${timeFormat.format(start)}–${dayOf(end).slice(5)} ${timeFormat.format(end)}`;
        const text = [`${when} ${summary}`, valueOf(data.location) && `장소: ${valueOf(data.location)}`, valueOf(data.description)].filter(Boolean).join('\n');
        for (let day = first < range.from ? range.from : first; day <= last && day <= range.to; day = nextDay(day)) {
          if (++allocations > 100000) throw new Error('날짜별 일정이 너무 많습니다. 가져올 기간을 줄여 주세요.');
          (records[day] ??= []).push({ text, sort: isFullDay ? 0 : +start });
        }
      }
    }
  }
  const days = Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b)).map(([day, entries]) => [day, { text: entries.sort((a, b) => a.sort - b.sort).map(entry => entry.text).join('\n'), strikes: [], photos: [], color: 'none' }]));
  const dates = Object.keys(days);
  return { days, ambiguities: [], count: dates.length, eventCount, firstDate: dates[0] || '', lastDate: dates.at(-1) || '', calendars: names, range, timeZone };
}
module.exports = { readCalendarFile, parseCalendars };

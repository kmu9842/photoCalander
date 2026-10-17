import { useState } from 'react';
import type { CalendarData, CalendarPreview } from './types';

export function CalendarImportSettings({ restored, notify }: { restored: (data: CalendarData) => void; notify: (message: string) => void }) {
  const year = new Date().getFullYear();
  const [range, setRange] = useState({ from: `${year}-01-01`, to: `${year + 1}-12-31` });
  const [preview, setPreview] = useState<CalendarPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const current = preview?.range.from === range.from && preview?.range.to === range.to;
  const valid = range.from && range.to && range.from <= range.to;
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (error) { notify(String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setBusy(false); }
  };
  return <section className="settings-section calendar-import" aria-label="구글 캘린더 가져오기">
    <strong>구글 캘린더 가져오기</strong>
    <p>구글에서 내보낸 .ics 또는 .zip 파일을 날짜별 메모로 가져옵니다.</p>
    <div className="calendar-import-range"><label>시작일<input aria-label="캘린더 가져올 시작일" type="date" min="1900-01-01" max="2200-12-31" value={range.from} disabled={busy} onChange={event => setRange(previous => ({ ...previous, from: event.target.value }))} /></label><label>종료일<input aria-label="캘린더 가져올 종료일" type="date" min="1900-01-01" max="2200-12-31" value={range.to} disabled={busy} onChange={event => setRange(previous => ({ ...previous, to: event.target.value }))} /></label></div>
    <p>선택한 기간만 가져옵니다. 반복 일정도 이 기간까지 추가됩니다.</p>
    <div className="excel-actions"><button disabled={busy || !valid} onClick={() => void action(async () => { const result = await window.calendar.openCalendar(range); if (result) setPreview(result); })}>{busy ? '읽는 중…' : '구글 캘린더 파일 선택'}</button>{preview && <button disabled={busy || !valid} onClick={() => void action(async () => setPreview(await window.calendar.previewCalendar(preview.token, range)))}>기간 다시 미리보기</button>}</div>
    {preview && <div className="excel-preview">
      <strong>{preview.filename}</strong><p>{preview.calendars.join(' · ')}</p>
      <p>{preview.eventCount}개 일정 · {preview.count}일{preview.count ? ` · ${preview.firstDate} ~ ${preview.lastDate}` : ''}<br />시간대: {preview.timeZone} · 종일 일정은 원래 날짜 유지</p>
      {!current && <p role="status">기간이 바뀌었습니다. 다시 미리보기해 주세요.</p>}
      {current && !preview.count && <p role="status">선택한 기간에 가져올 일정이 없습니다.</p>}
      <div className="excel-sample">{preview.sample.map(item => <div key={item.date}><b>{item.date}</b><span>{item.text}</span></div>)}</div>
      <label className="calendar-import-mode">같은 날짜의 메모<select aria-label="캘린더 가져오기 방식" disabled={busy} value={mode} onChange={event => setMode(event.target.value as 'merge' | 'replace')}><option value="merge">기존 메모에 추가</option><option value="replace">가져온 메모로 교체</option></select></label>
      <p>기존 사진과 날짜별 설정은 유지하며, 적용 전 기록을 자동 백업합니다.</p>
      <div className="excel-actions"><button disabled={busy || !current || !preview.count} onClick={() => void action(async () => { const data = await window.calendar.importCalendar(preview.token, mode); restored(data); setPreview(null); notify(`${preview.eventCount}개 일정을 가져왔습니다.`); })}>캘린더 가져오기 적용</button><button disabled={busy} onClick={() => setPreview(null)}>취소</button></div>
    </div>}
  </section>;
}

import { useState } from 'react';
import type { CalendarData, ExcelPreview } from './types';

export function ExcelSettings({ restored, notify }: { restored: (data: CalendarData) => void; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [ambiguities, setAmbiguities] = useState<ExcelPreview['ambiguities']>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [format, setFormat] = useState<'list' | 'calendar'>('list');
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (error) { notify(String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setBusy(false); }
  };
  return <div className="settings-section excel-settings">
    <strong>엑셀 가져오기 · 내보내기</strong>
    <p>CalendarTask 목록형·달력형 지원. 메모·취소선·글자색·글자 크기·날짜 배경색을 옮깁니다. 사진과 날짜별 표시 설정은 JSON 백업을 사용하세요.</p>
    <div className="excel-actions">
      <button disabled={busy} onClick={() => void action(async () => {
        const result = await window.calendar.openExcel();
        if (result) { setPreview(result); setAmbiguities(result.ambiguities); setChoices({}); }
      })}>엑셀 파일 선택</button>
      <select aria-label="엑셀 내보내기 형식" value={format} onChange={e => setFormat(e.target.value as 'list' | 'calendar')}><option value="list">목록형</option><option value="calendar">달력형</option></select>
      <button disabled={busy} onClick={() => void action(async () => { if (await window.calendar.exportExcel(format)) notify('엑셀 파일을 저장했습니다.'); })}>엑셀 내보내기</button>
    </div>
    {preview && <div className="excel-preview">
      <strong>{preview.filename}</strong>
      {ambiguities.length > 0 && <p>숫자로 저장된 연월은 1월과 10월이 모호합니다. 실제 연월을 선택해 주세요.</p>}
      {ambiguities.map(item => <label key={item.id}>{item.label}<select aria-label={`${item.label} 연월`} value={choices[item.id] || ''} disabled={busy} onChange={e => {
        const next = { ...choices, [item.id]: e.target.value };
        void action(async () => {
          const result = await window.calendar.previewExcel(preview.token, next);
          setChoices(next); setPreview(result);
        });
      }}><option value="">연월 선택</option>{item.candidates.map(month => <option key={month} value={month}>{month}</option>)}</select></label>)}
      <p>{preview.count}일의 메모{preview.count > 0 && ` · ${preview.firstDate} ~ ${preview.lastDate}`}</p>
      <div className="excel-sample">{preview.sample.map(item => <div key={item.date}><b>{item.date}</b><span>{item.text}</span></div>)}</div>
      <label>같은 날짜의 메모<select aria-label="엑셀 가져오기 방식" value={mode} onChange={e => setMode(e.target.value as 'merge' | 'replace')}><option value="merge">기존 메모에 추가</option><option value="replace">가져온 메모로 교체</option></select></label>
      <p>다른 날짜와 기존 사진은 유지하며, 적용 전 기록을 자동 백업합니다.</p>
      <div className="excel-actions"><button disabled={busy || preview.ambiguities.length > 0 || preview.count === 0} onClick={() => void action(async () => {
        const data = await window.calendar.importExcel(preview.token, choices, mode);
        restored(data); setPreview(null); notify(`${preview.count}일의 메모를 가져왔습니다.`);
      })}>엑셀 가져오기 적용</button><button disabled={busy} onClick={() => setPreview(null)}>취소</button></div>
    </div>}
  </div>;
}

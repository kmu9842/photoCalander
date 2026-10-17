import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardPaste, FolderOpen, ImagePlus, Images, LoaderCircle, Maximize2, Minus, Moon, Palette, Pin, Plus, RotateCcw, Settings2, Strikethrough, Sun, Trash2, X } from 'lucide-react';
import { dateKey, emptyDay, fromKey, longDate, monthDays, shiftMonth, WEEKDAYS } from './calendar';
import { MemoEditor, type MemoFormat, type MemoHandle } from './MemoEditor';
import { FontSizeSpinner } from './FontSizeSpinner';
import { useEditorPanel } from './useEditorPanel';
import { CellPhotos } from './CellPhotos';
import { AppearanceSettings, HolidaySettings, fontStack } from './AppearanceSettings';
import { ExcelSettings } from './ExcelSettings';
import { CalendarImportSettings } from './CalendarImportSettings';
const ThemeSettings = lazy(() => import('./ThemeSettings').then(module => ({ default: module.ThemeSettings })));
import { resolvedTheme, themeStyle, useSystemDark } from './themes';
import { PhotoArrangement } from './PhotoArrangement';
import type { CalendarData, Color, DayEntry, HolidayResult, ImportPhoto, PaletteColor, Photo, PhotoFrame, PhotoSize, ResizeEdge, Settings, StrikeRange, TextColorRange, TextSizeRange } from './types';

const COLOR_ROWS = [
  ['#ffffff','#e5e7eb','#9ca3af','#6b7280','#374151','#111827','#000000','#64748b'],
  ['#fecaca','#fed7aa','#fef08a','#d9f99d','#bbf7d0','#a5f3fc','#bfdbfe','#ddd6fe'],
  ['#fca5a5','#fdba74','#fde047','#bef264','#86efac','#67e8f9','#93c5fd','#c4b5fd'],
  ['#f87171','#fb923c','#facc15','#a3e635','#4ade80','#22d3ee','#60a5fa','#a78bfa'],
  ['#ef4444','#f97316','#eab308','#84cc16','#22c55e','#06b6d4','#3b82f6','#8b5cf6'],
  ['#b91c1c','#c2410c','#a16207','#4d7c0f','#15803d','#0e7490','#1d4ed8','#6d28d9'],
];
function ColorPicker({ value, change, scope = 'day', defaultColor = '#ffffff' }: { value: Color; change: (color: PaletteColor) => void; scope?: 'day' | 'calendar'; defaultColor?: string }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<string>(value.startsWith('#') ? value : defaultColor);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setCustom(value.startsWith('#') ? value : defaultColor); }, [value, defaultColor]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  const calendar = scope === 'calendar';
  const label = calendar ? '달력 배경색' : '색상 팔레트';
  return <div className={`palette-control ${calendar ? 'calendar-palette' : ''}`} ref={ref}>
    <button className="palette-toggle" title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><Palette size={16} /><span className="palette-current" style={{ background: value.startsWith('#') ? value : calendar ? defaultColor : 'transparent' }} /><ChevronDown size={13} /></button>
    {open && <div className="palette-popover" role="group" aria-label={calendar ? '달력 배경색 팔레트' : '날짜 색상'}>
      <button className="palette-clear" onClick={() => { change('none'); setOpen(false); }}>{calendar ? '기본색' : '색상 없음'}</button>
      <div className="palette-grid">{COLOR_ROWS.flat().map(color => <button key={color} className="palette-swatch" style={{ backgroundColor: color }} aria-label={`${color} 색상`} aria-pressed={value === color} title={color} onClick={() => { change(color as PaletteColor); setCustom(color); setOpen(false); }}>{value === color && <Check size={14} />}</button>)}</div>
      <div className="palette-custom"><input type="color" aria-label="직접 색상 선택" value={/^#[a-fA-F0-9]{6}$/.test(custom) ? custom : defaultColor} onChange={e => { setCustom(e.target.value); change(e.target.value as PaletteColor); }} /><input aria-label="색상 코드" value={custom} maxLength={7} onChange={e => { setCustom(e.target.value); if (/^#[a-fA-F0-9]{6}$/.test(e.target.value)) change(e.target.value as PaletteColor); }} /></div>
    </div>}
  </div>;
}

function ResizeHandles() {
  const active = useRef(false);
  const edges: ResizeEdge[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
  return <>{edges.map(edge => <div key={edge} className={`resize-handle resize-${edge}`} role="separator" aria-label={`${edge} 크기 조절`} title="크기 조절"
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); active.current = true; e.currentTarget.setPointerCapture(e.pointerId); window.calendar.beginResize(edge, e.screenX, e.screenY); }}
    onPointerMove={e => { if (active.current && e.currentTarget.hasPointerCapture(e.pointerId)) window.calendar.resizeTo(e.screenX, e.screenY); }}
    onPointerUp={e => { if (!active.current) return; window.calendar.resizeTo(e.screenX, e.screenY); active.current = false; window.calendar.endResize(); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={() => { active.current = false; window.calendar.endResize(); }}
    onLostPointerCapture={() => { if (active.current) { active.current = false; window.calendar.endResize(); } }}>
    {edge === 'se' && <span className="resize-grip" aria-hidden="true"><i /><i /><i /></span>}
  </div>)}</>;
}
const photoURL = (photo: Photo, thumb = false) => `photo://local/${photo.file}${thumb ? '?thumb=1' : ''}`;
const errorText = (error: unknown) => String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /, '');

function IconButton({ label, children, onClick, active = false, className = '', disabled = false }: {
  label: string; children: ReactNode; onClick: () => void; active?: boolean; className?: string; disabled?: boolean;
}) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function NoteText({ text, strikes, textColors = [], textSizes = [] }: { text: string; strikes: StrikeRange[]; textColors?: TextColorRange[]; textSizes?: TextSizeRange[] }) {
  const parts: ReactNode[] = [];
  const boundaries = [...new Set([0, text.length, ...[...strikes, ...textColors, ...textSizes].flatMap(range => [range.from, range.to])])].sort((a, b) => a - b);
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i], to = boundaries[i + 1];
    const color = textColors.find(range => range.from <= from && range.to > from)?.color;
    const fontSize = textSizes.find(range => range.from <= from && range.to > from)?.size;
    const content = text.slice(from, to);
    parts.push(<span key={from} style={{ color, fontSize }}>{strikes.some(range => range.from <= from && range.to > from) ? <s style={color ? { color: 'inherit' } : undefined}>{content}</s> : content}</span>);
  }
  return <>{parts}</>;
}

function Modal({ title, children, close, className = '' }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={e => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first?.focus(); }
    }}>
      {children}
    </div>
  </div>;
}

function DayEditor({ date, entry, defaultFontSize, defaultFrame, ready, update, close, attach, paste, drop, showPhoto, uploading }: {
  date: string; entry: DayEntry; defaultFontSize: number; defaultFrame: PhotoFrame; ready: boolean; update: (updater: (entry: DayEntry) => DayEntry) => void;
  close: () => void; attach: () => void; paste: () => void; drop: (files: File[]) => void; showPhoto: (photos: Photo[], index: number) => void; uploading: boolean;
}) {
  const memo = useRef<MemoHandle>(null);
  const [arranging, setArranging] = useState(false);
  const fontSize = entry.fontSize ?? defaultFontSize;
  const [format, setFormat] = useState<MemoFormat>({ strike: false, fontSize });
  return <aside className="day-editor" aria-label={`${longDate(date)} 기록`} style={{ '--memo-font-size': `${fontSize}px` } as CSSProperties} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(Array.from(e.dataTransfer.files)); }}>
    <div className="editor-heading"><h2>{longDate(date)}</h2><IconButton label="편집 닫기" onClick={close}><X size={18} /></IconButton></div>
    <div className="editor-body">
      <div className="editor-tools"><ColorPicker value={entry.color} change={color => update(day => ({ ...day, color }))} /><button className="strike-button" title="커서가 있는 줄 취소선 · Ctrl+5" aria-label="현재 줄 취소선" aria-keyshortcuts="Control+5" aria-pressed={format.strike} onMouseDown={e => e.preventDefault()} onClick={() => memo.current?.toggleStrike()}><Strikethrough size={18} /><span>줄 취소선</span><kbd>Ctrl+5</kbd></button></div>
      <div className="memo-formatting">
        <div className="memo-size-row"><span>날짜 기본 크기</span><FontSizeSpinner label="날짜 기본 글자 크기" value={fontSize} change={fontSize => update(day => ({ ...day, fontSize }))} /><button className="format-reset" disabled={entry.fontSize === undefined} title="전체 글자 크기 설정 따르기" onClick={() => update(day => ({ ...day, fontSize: undefined }))}>전체 설정</button></div>
        <div className="memo-size-row"><span>선택·입력 글자</span><FontSizeSpinner label="선택 글자 크기" value={format.fontSize} change={size => memo.current?.setFontSize(size)} /><button className="format-reset" title="선택한 글자를 날짜 기본 크기로" onMouseDown={e => e.preventDefault()} onClick={() => memo.current?.setFontSize(null)}>날짜 기본</button></div>
      </div>
      <MemoEditor ref={memo} value={entry} fontSize={fontSize} autoFocus={ready} onChange={value => update(day => ({ ...day, ...value, textColors: value.textColors, textSizes: value.textSizes }))} onFormatChange={setFormat} />
      <div className="section-label photos-heading"><span>사진</span><div className="photo-actions"><IconButton label="사진 붙여넣기" disabled={uploading} onClick={paste}><ClipboardPaste size={16} /></IconButton><IconButton label="사진 첨부" disabled={uploading || entry.photos.length >= 20} onClick={attach}>{uploading ? <LoaderCircle className="spin" size={16} /> : <Plus size={17} />}</IconButton></div></div>
      <div className="photo-settings"><div className="photo-setting-row"><span>달력 사진 블러</span><button role="switch" aria-label="날짜 사진 블러" aria-checked={!!entry.photoBlur} className={`switch ${entry.photoBlur ? 'on' : ''}`} onClick={() => update(day => ({ ...day, photoBlur: !day.photoBlur }))}><span /></button></div><div className="photo-setting-row"><span>칸에서 사진 크기</span><div className="segmented" role="group" aria-label="날짜 사진 크기">{([['large', '대'], ['medium', '중'], ['small', '소']] as [PhotoSize, string][]).map(([size, label]) => <button key={size} aria-pressed={(entry.photoSize ?? 'medium') === size} className={(entry.photoSize ?? 'medium') === size ? 'selected' : ''} onClick={() => update(day => ({ ...day, photoSize: size }))}>{label}</button>)}</div></div></div>
      {entry.photos.length === 0 ? <button className="photo-dropzone" aria-label="파일에서 사진 선택" onClick={attach} disabled={uploading}><ImagePlus size={24} /><span>사진 추가</span></button> : <div className="editor-photos">{entry.photos.map((photo, i) => <div key={photo.id} className="editor-photo"><button onClick={() => showPhoto(entry.photos, i)} aria-label={`${photo.name} 크게 보기`}><img src={photoURL(photo, true)} alt={photo.name} /><span className="photo-zoom"><Maximize2 size={14} /></span></button><button className="delete-photo" aria-label={`${photo.name} 사진 제거`} onClick={() => update(day => ({ ...day, photos: day.photos.filter(p => p.id !== photo.id) }))}><Trash2 size={13} /></button></div>)}</div>}
      {entry.photos.length > 0 && <button className="photo-arrange-toggle" aria-expanded={arranging} onClick={() => setArranging(!arranging)}><Images size={15} /> 사진 틀 · 위치 · 기울기<ChevronDown size={14} /></button>}
      {arranging && entry.photos.length > 0 && <PhotoArrangement date={date} entry={entry} defaultFrame={defaultFrame} update={update} />}
    </div>
  </aside>;
}

function SettingsModal({ settings, update, close, notify, restored, holidays, refreshHolidays }: {
  settings: Settings; update: (patch: Partial<Settings>) => Promise<void>; close: () => void;
  notify: (message: string) => void; restored: (data: CalendarData) => void;
  holidays: HolidayResult & { loading: boolean }; refreshHolidays: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [opacity, setOpacity] = useState(settings.opacity);
  const systemDark = useSystemDark();
  useEffect(() => { setOpacity(settings.opacity); }, [settings.opacity]);
  const [category, setCategory] = useState('appearance');
  const categories = [{ id: 'appearance', label: '화면' }, { id: 'theme', label: '테마' }, { id: 'calendar', label: '달력' }, { id: 'window', label: '창 동작' }, { id: 'data', label: '데이터' }];
  const action = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (error) { notify(errorText(error)); } finally { setBusy(false); } };
  return <Modal title="위젯 설정" close={close} className="settings-modal">
    <div className="modal-heading"><h2>설정</h2><IconButton label="설정 닫기" onClick={close}><X size={19} /></IconButton></div>
    <div className="settings-tabs" role="tablist" aria-label="설정 카테고리">{categories.map(({ id, label }, index) => <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={category === id} aria-controls={`settings-panel-${id}`} tabIndex={category === id ? 0 : -1} onClick={() => setCategory(id)} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % categories.length : event.key === 'ArrowLeft' ? (index + categories.length - 1) % categories.length : event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); setCategory(categories[next].id); document.getElementById(`settings-tab-${categories[next].id}`)?.focus();
    }}>{label}</button>)}</div>
    <div className="settings-scroll">
      <div id="settings-panel-theme" role="tabpanel" aria-labelledby="settings-tab-theme" hidden={category !== 'theme'}><Suspense fallback={<p>테마를 불러오는 중…</p>}><ThemeSettings settings={settings} update={update} /></Suspense></div>
      <div id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" hidden={category !== 'appearance'}>
      <div className="setting-row"><strong>달력 배경색</strong><ColorPicker scope="calendar" value={settings.backgroundColor} defaultColor={resolvedTheme(settings, systemDark).background} change={backgroundColor => void update({ backgroundColor })} /></div>
      <div className="setting-row opacity-setting"><strong>배경 불투명도</strong><output>{opacity}%</output><input aria-label="배경 불투명도" type="range" min={0} max={100} value={opacity} onChange={e => setOpacity(Number(e.target.value))} onPointerUp={() => void update({ opacity })} onKeyUp={() => void update({ opacity })} /></div>
      <div className="setting-row font-size-setting"><div><strong>전체 글자 크기</strong><p>날짜·요일·메모·메뉴에 함께 적용 · 기본 13px</p></div><FontSizeSpinner label="전체 글자 크기" value={settings.fontSize} change={fontSize => void update({ fontSize })} /></div>
      <AppearanceSettings settings={settings} update={update} />
      </div>
      <div id="settings-panel-calendar" role="tabpanel" aria-labelledby="settings-tab-calendar" hidden={category !== 'calendar'}>
      <div className="setting-row"><div><strong>한 주의 시작</strong></div><select aria-label="한 주의 시작" value={settings.weekStart} onChange={e => void update({ weekStart: Number(e.target.value) as 0 | 1 })}><option value={0}>일요일</option><option value={1}>월요일</option></select></div>
      <HolidaySettings settings={settings} update={update} holidays={holidays} refresh={refreshHolidays} />
      </div>
      <div id="settings-panel-window" role="tabpanel" aria-labelledby="settings-tab-window" hidden={category !== 'window'}>
      <div className="setting-row"><strong>표시 위치</strong><select aria-label="위젯 표시 위치" value={settings.windowMode} onChange={e => void update({ windowMode: e.target.value as Settings['windowMode'] })}><option value="desktop">바탕화면 고정</option><option value="normal">일반 위젯</option><option value="top">항상 위에</option></select></div>
      <div className="setting-row"><strong>Windows 시작 시 실행</strong><button role="switch" aria-checked={settings.startAtLogin} aria-label="Windows 시작 시 실행" className={`switch ${settings.startAtLogin ? 'on' : ''}`} onClick={() => void update({ startAtLogin: !settings.startAtLogin })}><span /></button></div>
      <div className="settings-about"><button onClick={() => window.calendar.quit()}>앱 종료</button></div>
      </div>
      <div id="settings-panel-data" role="tabpanel" aria-labelledby="settings-tab-data" hidden={category !== 'data'}>
      <CalendarImportSettings restored={restored} notify={notify} />
      <ExcelSettings restored={restored} notify={notify} />
      <div className="settings-section"><strong>전체 백업 · 복원</strong><p>사진과 메모, 설정을 함께 보관합니다.</p><div className="backup-actions"><button disabled={busy} onClick={() => void action(async () => { if (await window.calendar.exportBackup()) notify('백업 저장됨'); })}><ArrowDownToLine size={16} /> 백업 저장</button><button disabled={busy} onClick={() => void action(async () => { const result = await window.calendar.importBackup(); if (result) restored(result); })}><ArrowUpFromLine size={16} /> 불러오기</button><IconButton label="데이터 폴더 열기" onClick={() => void action(async () => { await window.calendar.openDataFolder(); })}><FolderOpen size={17} /></IconButton></div></div>
      </div>
    </div>
  </Modal>;
}

export default function App() {
  const systemDark = useSystemDark();
  const [data, setData] = useState<CalendarData | null>(null);
  const dataRef = useRef<CalendarData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const editorPanel = useEditorPanel(editorDate);
  const displayedDate = editorPanel.date;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: Photo[]; index: number } | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [failed, setFailed] = useState(false);
  const dirty = useRef(new Map<string, DayEntry>());
  const revisions = useRef(new Map<string, number>());
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsQueue = useRef(Promise.resolve());
  const [holidays, setHolidays] = useState<HolidayResult & { loading: boolean }>({ countryCode: '', holidays: [], stale: false, error: '', loading: false });
  const [holidayRevision, setHolidayRevision] = useState(0);
  const showHolidays = data?.settings.showHolidays;
  const holidayCountry = data?.settings.holidayCountry;
  const weekStart = data?.settings.weekStart;
  useEffect(() => {
    if (!showHolidays || holidayCountry === undefined || weekStart === undefined) {
      setHolidays({ countryCode: '', holidays: [], stale: false, error: '', loading: false });
      return;
    }
    let active = true;
    const years = [...new Set(monthDays(month, weekStart).map(day => day.getFullYear()))];
    const refresh = () => {
      setHolidays({ countryCode: '', holidays: [], stale: false, error: '', loading: true });
      window.calendar.holidays(years, holidayCountry).then(result => { if (active) setHolidays({ ...result, loading: false }); }).catch(() => {
        if (active) setHolidays({ countryCode: '', holidays: [], stale: false, error: '공휴일을 불러오지 못했습니다. 설정에서 다시 시도해 주세요.', loading: false });
      });
    };
    refresh();
    const timer = setInterval(refresh, 60 * 60 * 1000);
    window.addEventListener('online', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', refresh); };
  }, [month, weekStart, showHolidays, holidayCountry, holidayRevision]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('.day-editor, .editor-dismiss-layer, .modal-scrim')) return;
      setEditorDate(null);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    const unsubscribe = window.calendar?.onBlur(() => { setEditorDate(null); setMonthPickerOpen(false); });
    return () => { document.removeEventListener('pointerdown', closeOutside, true); unsubscribe?.(); };
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5500);
  }, []);
  useEffect(() => { if (editorPanel.error) notify(`편집창을 열지 못했습니다: ${errorText(editorPanel.error)}`); }, [editorPanel.error, notify]);
  const replaceData = useCallback((next: CalendarData) => { dataRef.current = next; setData(next); }, []);
  useEffect(() => {
    if (!window.calendar) { setLoadError('Photo Calendar 실행 파일로 열어 주세요.'); return; }
    window.calendar.load().then(replaceData).catch(error => setLoadError(errorText(error)));
    const unsubscribe = window.calendar.onSettings(settings => {
      if (dataRef.current) replaceData({ ...dataRef.current, settings });
    });
    const todayUnsubscribe = window.calendar.onFocusDate(() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); setSelected(dateKey(now)); });
    const interval = setInterval(() => setToday(dateKey(new Date())), 30000);
    return () => { unsubscribe(); todayUnsubscribe(); clearInterval(interval); };
  }, [replaceData]);

  const persistDay = useCallback((date: string, entry: DayEntry) => {
    const revision = (revisions.current.get(date) || 0) + 1;
    revisions.current.set(date, revision);
    dirty.current.set(date, entry);
    window.calendar.saveDay(date, entry).then(() => {
      if (revisions.current.get(date) === revision) dirty.current.delete(date);
      if (!dirty.current.size) setFailed(false);
    }).catch(error => { setFailed(true); notify(`저장 실패: ${errorText(error)}`); });
  }, [notify]);
  const updateDay = useCallback((date: string, updater: (entry: DayEntry) => DayEntry) => {
    if (!dataRef.current) return;
    const entry = updater(dataRef.current.days[date] || emptyDay());
    replaceData({ ...dataRef.current, days: { ...dataRef.current.days, [date]: entry } });
    persistDay(date, entry);
  }, [persistDay, replaceData]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    settingsQueue.current = settingsQueue.current.then(async () => {
      if (!dataRef.current) return;
      try {
        const settings = await window.calendar.saveSettings({ ...dataRef.current.settings, ...patch });
        replaceData({ ...dataRef.current, settings });
      } catch (error) { notify(errorText(error)); }
    });
    await settingsQueue.current;
  }, [notify, replaceData]);

  const attachFiles = useCallback(async (date: string, files: File[]) => {
    if (!files.length || !dataRef.current) return;
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name))) { notify('JPG, PNG, WEBP, GIF 사진을 선택해 주세요.'); return; }
    if ((dataRef.current.days[date]?.photos.length || 0) + files.length > 20) { notify('하루에 사진을 20장까지 첨부할 수 있어요.'); return; }
    setUploading(count => count + 1);
    try {
      const inputs: ImportPhoto[] = [];
      for (const file of files) {
        const path = window.calendar.photoPath(file);
        inputs.push(path ? { name: file.name, path } : { name: file.name, bytes: await file.arrayBuffer() });
      }
      const imported = await window.calendar.importPhotos(inputs);
      if ((dataRef.current.days[date]?.photos.length || 0) + imported.length > 20) throw new Error('하루에 사진을 20장까지 첨부할 수 있어요.');
      updateDay(date, day => ({ ...day, photos: [...day.photos, ...imported] }));
    } catch (error) { notify(errorText(error)); }
    finally { setUploading(count => count - 1); }
  }, [notify, updateDay]);

  const nativePhotos = useCallback(async (date: string, source: 'file' | 'clipboard', quiet = false) => {
    if (!dataRef.current) return;
    setUploading(count => count + 1);
    try {
      const photos = await (source === 'file' ? window.calendar.pickPhotos() : window.calendar.pastePhotos());
      if (!photos.length) { if (source === 'clipboard' && !quiet) notify('클립보드에 이미지가 없습니다.'); return; }
      if ((dataRef.current.days[date]?.photos.length || 0) + photos.length > 20) throw new Error('사진은 날짜당 최대 20장입니다.');
      updateDay(date, day => ({ ...day, photos: [...day.photos, ...photos] }));
    } catch (error) { notify(errorText(error)); }
    finally { setUploading(count => count - 1); }
  }, [notify, updateDay]);
  const choosePhotos = (date: string) => { void nativePhotos(date, 'file'); };
  const goToday = useCallback(() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); setSelected(dateKey(now)); }, []);
  const navigate = useCallback((amount: number) => { setMonth(current => { const next = shiftMonth(current, amount); return next.getFullYear() >= 1900 && next.getFullYear() <= 2200 ? next : current; }); setMonthPickerOpen(false); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else if (settingsOpen) setSettingsOpen(false);
        else if (monthPickerOpen) setMonthPickerOpen(false);
        else setEditorDate(null);
      }
      if (lightbox && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); setLightbox(current => current ? { ...current, index: (current.index + (e.key === 'ArrowRight' ? 1 : -1) + current.photos.length) % current.photos.length } : null); return; }
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); setSettingsOpen(open => !open); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navigate(1); }
      if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); goToday(); }
    };
    const paste = (e: ClipboardEvent) => {
      const target = editorDate || selected;
      if (!target || settingsOpen || lightbox) return;
      const files = Array.from(e.clipboardData?.files || []).filter(file => file.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); void attachFiles(target, files); }
      else if (!e.clipboardData?.getData('text/plain')) { e.preventDefault(); void nativePhotos(target, 'clipboard', true); }
    };
    const preventDrop = (e: DragEvent) => e.preventDefault();
    document.addEventListener('keydown', onKey); document.addEventListener('paste', paste);
    document.addEventListener('dragover', preventDrop); document.addEventListener('drop', preventDrop);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('paste', paste); document.removeEventListener('dragover', preventDrop); document.removeEventListener('drop', preventDrop); };
  }, [lightbox, settingsOpen, monthPickerOpen, editorDate, selected, attachFiles, nativePhotos, navigate, goToday]);

  if (!data) return <div className="loading-shell"><CalendarDays size={32} /><p>{loadError || '불러오는 중…'}</p>{loadError && <button onClick={() => window.location.reload()}>다시 시도</button>}</div>;
  const days = monthDays(month, data.settings.weekStart);
  const monthPrefix = dateKey(month).slice(0, 7);
  const background = data.settings.backgroundColor;
  const theme = resolvedTheme(data.settings, systemDark);
  const designed = !['light', 'dark'].includes(data.settings.theme);
  const style = {
    ...(designed ? themeStyle(theme) : {}),
    '--surface-alpha': data.settings.opacity / 100,
    ...(background === 'none' ? {} : { '--surface-rgb': [1, 3, 5].map(offset => parseInt(background.slice(offset, offset + 2), 16)).join(',') }),
    '--font-size': `${data.settings.fontSize}px`,
    '--font-scale': data.settings.fontSize / 13,
    '--grid-line-width': `${data.settings.lineWidth}px`,
    '--calendar-layout-width': editorPanel.calendarWidth === null ? undefined : `${editorPanel.calendarWidth}px`,
    '--editor-duration': `${editorPanel.duration}ms`,
    fontFamily: fontStack(data.settings.fontFamily),
    '--title-font': data.settings.fontFamily ? fontStack(data.settings.fontFamily) : theme.layout === 'glass' ? "'Caveat',cursive" : "'Cormorant Garamond',serif",
    '--date-font': data.settings.fontFamily ? fontStack(data.settings.fontFamily) : "'Cormorant Garamond','Gowun Dodum',serif",
  } as CSSProperties;

  return <main className={`widget theme-${designed ? data.settings.theme : theme.id} mode-${theme.mode} ${data.settings.softFocus ? 'soft-focus' : ''} layout-${theme.layout} ${designed ? 'designed-theme' : ''} ${data.settings.opacity < 15 ? 'transparent-widget' : ''} ${displayedDate ? 'editing' : ''} editor-${editorPanel.phase}`} style={style} onTransitionEnd={editorPanel.onTransitionEnd}>
    {editorDate && <button type="button" className="editor-dismiss-layer" aria-label="편집창 바깥" tabIndex={-1} onClick={e => { e.stopPropagation(); setEditorDate(null); }} onDragEnter={e => { if (Array.from(e.dataTransfer.types).includes('Files')) setEditorDate(null); }} />}
    <div className="calendar-layout" ref={editorPanel.layoutRef}>
    <header className="titlebar">
      <div className="brand"><CalendarDays size={15} strokeWidth={1.8} /><span>Photo Calendar</span></div>
      <div className="window-controls"><IconButton label={data.settings.windowMode === 'desktop' ? '바탕화면 고정 해제' : '바탕화면에 고정'} active={data.settings.windowMode === 'desktop'} onClick={() => void updateSettings({ windowMode: data.settings.windowMode === 'desktop' ? 'normal' : 'desktop' })}><Pin size={14} /></IconButton><span className="control-separator" /><IconButton label="트레이로 숨기기" onClick={() => { window.calendar.minimize(); }}><Minus size={16} /></IconButton><IconButton className="close-window" label="위젯 숨기기 (트레이에서 다시 열기)" onClick={() => { window.calendar.close(); }}><X size={16} /></IconButton></div>
    </header>
    <div className="month-header">
      <div className="month-heading"><button className="month-title" title="월 이동" onClick={() => setMonthPickerOpen(open => !open)}><span>{month.getFullYear()}.</span><b>{String(month.getMonth() + 1).padStart(2, '0')}</b>{theme.layout !== 'classic' && <span className="themed-month">{month.toLocaleString('en-US', { month: 'long' })}<small>{month.getFullYear()}</small></span>}</button>
        {monthPickerOpen && <div className="month-picker"><input id="month-jump" aria-label="이동할 월" type="month" min="1900-01" max="2200-12" value={monthPrefix} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { const next = fromKey(e.target.value + '-01'); if (next.getFullYear() >= 1900 && next.getFullYear() <= 2200) { setMonth(next); setMonthPickerOpen(false); } } }} /></div>}
      </div>
      <div className="navigation"><IconButton label="이전 달" onClick={() => navigate(-1)}><ChevronLeft size={18} /></IconButton><button className="today-button" onClick={goToday}>오늘</button><IconButton label="다음 달" onClick={() => navigate(1)}><ChevronRight size={18} /></IconButton><span className="control-separator" /><ColorPicker scope="calendar" value={background} defaultColor={theme.background} change={backgroundColor => void updateSettings({ backgroundColor })} /><IconButton label={theme.mode === 'light' ? '다크 테마' : '라이트 테마'} onClick={() => void updateSettings({ colorMode: theme.mode === 'light' ? 'dark' : 'light' })}>{theme.mode === 'light' ? <Moon size={17} /> : <Sun size={17} />}</IconButton><IconButton label="위젯 설정" active={settingsOpen} onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></IconButton></div>
    </div>
    <div className="calendar-and-editor">
      <section className="calendar" aria-label={`${month.getFullYear()}년 ${month.getMonth() + 1}월 달력`}>
        <div className="weekdays" role="row">{Array.from({ length: 7 }, (_, i) => (i + data.settings.weekStart) % 7).map(day => <div key={day} className={day === 0 ? 'sunday' : day === 6 ? 'saturday' : ''} role="columnheader">{WEEKDAYS[day]}</div>)}</div>
        <div className="calendar-grid" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(calc(54px * var(--font-scale)), 1fr))` }} role="grid">
          {days.map(date => {
            const key = dateKey(date), entry = data.days[key] || emptyDay(), outside = date.getMonth() !== month.getMonth(), isToday = key === today;
            const photos = entry.photos;
            const photoSize = entry.photoSize ?? 'medium';
            const free = photos.some(photo => photo.placement || (photo.frame ?? theme.defaultFrame) !== 'none');
            const photoGrid = photos.length > 0 && <CellPhotos photos={photos} size={photoSize} blur={entry.photoBlur} defaultFrame={theme.defaultFrame} free={free} show={index => setLightbox({ photos, index })} />;
            const holiday = showHolidays ? [...new Set(holidays.holidays.filter(item => item.date === key).map(item => item.name))].join(' · ') : '';
            return <div key={key} data-date={key} data-holiday={holiday || undefined} role="gridcell" tabIndex={0} aria-label={`${longDate(key)}${isToday ? ', 오늘' : ''}${holiday ? `, ${holiday}` : ''}${photos.length ? `, 사진 ${photos.length}장` : ''}`} aria-selected={selected === key}
              style={entry.color.startsWith('#') ? { backgroundColor: `${entry.color}66` } : undefined}
              className={`day-cell ${free ? 'photo-custom' : ''} ${photos.length ? `photo-layout-${photoSize}` : ''} ${entry.color.startsWith('#') ? '' : `color-${entry.color}`} ${outside ? 'outside' : ''} ${isToday ? 'is-today' : ''} ${selected === key ? 'is-selected' : ''} ${dropDate === key ? 'is-dragging' : ''} ${date.getDay() === 0 ? 'sunday' : date.getDay() === 6 ? 'saturday' : ''}`}
              onClick={() => { setSelected(key); setEditorDate(key); }}
              onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(key); setEditorDate(key); } }}
              onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropDate(key); } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropDate(null); }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); setDropDate(null); setSelected(key); void attachFiles(key, Array.from(e.dataTransfer.files)); }}>
              {(photoSize === 'large' || free) && photoGrid}
              <div className="day-top"><div className="day-date"><span className="date-number">{date.getDate()}</span>{outside && date.getDate() === 1 && <span className="other-month">{date.getMonth() + 1}월</span>}</div>{photoSize === 'small' && photos.length ? !free && photoGrid : <button className="cell-add" aria-label={`${key} 사진 추가`} title="사진 추가" onClick={e => { e.stopPropagation(); choosePhotos(key); }}><ImagePlus size={14} /></button>}</div>
              <div className={`day-content ${photos.length ? 'has-photos' : ''}`}>
                {holiday && <div className="holiday-name" title={holiday}>{holiday}</div>}
                <div className="cell-notes">{entry.text && <div className="note-text" style={{ fontSize: entry.fontSize }}><NoteText text={entry.text} strikes={entry.strikes} textColors={entry.textColors} textSizes={entry.textSizes} /></div>}</div>
                {photoSize === 'medium' && !free && photoGrid}
                {!entry.text && !photos.length && <button className="cell-placeholder" aria-label={`${key} 메모 작성`} title="메모 작성" onClick={e => { e.stopPropagation(); setSelected(key); setEditorDate(key); }}><Plus size={13} /></button>}
              </div>
              {dropDate === key && <div className="drop-overlay"><ImagePlus size={24} /></div>}
            </div>;
          })}
        </div>
      </section>
      {displayedDate && <div className="editor-viewport" inert={editorPanel.phase === 'ready' || editorPanel.phase === 'closing'}><DayEditor key={displayedDate} date={displayedDate} entry={data.days[displayedDate] || emptyDay()} defaultFontSize={data.settings.fontSize} defaultFrame={theme.defaultFrame} ready={editorPanel.phase === 'opening' || editorPanel.phase === 'open'} update={updater => updateDay(displayedDate, updater)} close={() => setEditorDate(null)} attach={() => choosePhotos(displayedDate)} paste={() => void nativePhotos(displayedDate, 'clipboard')} drop={files => void attachFiles(displayedDate, files)} showPhoto={(photos, index) => setLightbox({ photos, index })} uploading={uploading > 0} /></div>}
    </div>
    </div>
    {failed && <button className="save-error" onClick={() => { for (const [date, entry] of dirty.current) persistDay(date, entry); }}><RotateCcw size={14} /> 저장 실패 · 재시도</button>}
    <ResizeHandles />
    {settingsOpen && <SettingsModal settings={data.settings} update={updateSettings} close={() => setSettingsOpen(false)} notify={notify} holidays={holidays} refreshHolidays={() => setHolidayRevision(value => value + 1)} restored={next => { replaceData(next); setEditorDate(null); dirty.current.clear(); setFailed(false); }} />}
    {lightbox && <Modal title="사진 크게 보기" close={() => setLightbox(null)} className="lightbox"><div className="lightbox-top"><span><Images size={16} /> {lightbox.index + 1} / {lightbox.photos.length}</span><IconButton label="사진 닫기" onClick={() => setLightbox(null)}><X size={21} /></IconButton></div><div className="lightbox-image"><img src={photoURL(lightbox.photos[lightbox.index])} alt={lightbox.photos[lightbox.index].name} /></div><div className="lightbox-bottom"><IconButton label="이전 사진" disabled={lightbox.photos.length < 2} onClick={() => setLightbox(current => current && { ...current, index: (current.index - 1 + current.photos.length) % current.photos.length })}><ChevronLeft size={22} /></IconButton><span>{lightbox.photos[lightbox.index].name}</span><IconButton label="다음 사진" disabled={lightbox.photos.length < 2} onClick={() => setLightbox(current => current && { ...current, index: (current.index + 1) % current.photos.length })}><ChevronRight size={22} /></IconButton></div></Modal>}
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="알림 닫기" onClick={() => setToast('')}><X size={14} /></button></div>}
  </main>;
}

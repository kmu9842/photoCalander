import { useEffect, useState, type CSSProperties } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { BUILTIN_THEMES, contrastRatio, resolvedTheme, themePatch, useSystemDark } from './themes';
import { FRAME_NAMES } from './PhotoFrame';
import { FontSizeSpinner } from './FontSizeSpinner';
import { BUNDLED_FONTS, fontStack } from './AppearanceSettings';
import type { Settings, ThemeDesign } from './types';

function ThemePreview({ theme }: { theme: ThemeDesign }) {
  return <div className={`theme-preview preview-${theme.layout}`} style={{ backgroundColor: theme.background, color: theme.text, borderColor: theme.line, borderRadius: theme.radius, fontFamily: fontStack(theme.fontFamily), '--preview-line': theme.line, '--preview-accent': theme.accent, '--preview-paper': theme.texture === 'paper' ? theme.textureStrength / 100 : 0 } as CSSProperties} aria-hidden="true">
    <strong>OCTOBER <span>2026</span></strong><div className="preview-week">SUN　MON　TUE　WED　THU　FRI　SAT</div>
    <div className="preview-grid">{Array.from({ length: 21 }, (_, i) => <span key={i}>{i + 1}</span>)}<i className={`preview-photo preview-frame-${theme.defaultFrame}`} /></div>
    <div className="preview-note">일상의 작은 기록</div>
  </div>;
}
export function ThemeSettings({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => Promise<void> }) {
  const systemDark = useSystemDark();
  const [draft, setDraft] = useState<ThemeDesign | null>(null);
  const [fonts, setFonts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const saved = settings.customThemes ?? [];
  useEffect(() => { let active = true; window.calendar.installedFonts().then(value => { if (active) setFonts(value); }).catch(() => {}); return () => { active = false; }; }, []);
  const edit = (theme: ThemeDesign, copy: boolean) => { setDraft({ ...theme, id: copy ? crypto.randomUUID() : theme.id, name: copy ? `${theme.name} 복사` : theme.name }); setMessage(''); };
  const change = (patch: Partial<ThemeDesign>) => setDraft(old => old && { ...old, ...patch });
  const save = async (copy = false) => {
    if (!draft || !draft.name.trim()) return;
    const next = { ...draft, id: copy ? crypto.randomUUID() : draft.id, name: draft.name.trim() };
    const themes = [...saved.filter(t => t.id !== next.id), next];
    if (themes.length > 30) { setMessage('테마는 최대 30개까지 저장할 수 있습니다.'); return; }
    setBusy(true);
    try {
      await update({ ...themePatch(next, true), customThemes: themes });
      const stored = (await window.calendar.load()).settings;
      if (stored.customThemeId !== next.id || JSON.stringify(stored.customThemes?.find(t => t.id === next.id)) !== JSON.stringify(next)) { setMessage('저장하지 못했습니다. 다시 시도해 주세요.'); return; }
      setDraft(null); setMessage('테마를 저장하고 적용했습니다.');
    } catch { setMessage('저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return <div className="theme-settings">
    <p className="theme-intro">종이 달력처럼, 바탕화면 위에 붙인 사진처럼.</p>
    <label className="theme-field">화면 밝기<select aria-label="화면 밝기 모드" value={settings.colorMode} onChange={e => void update({ colorMode: e.target.value as Settings['colorMode'] })}><option value="system">시스템 설정 따르기</option><option value="light">라이트</option><option value="dark">다크</option></select></label>
    <div className="setting-row"><div><strong>달력 글자·선 블러</strong><p>글자와 격자선을 부드럽게 · 기본 켜짐</p></div><button role="switch" aria-label="달력 글자·선 블러" aria-checked={settings.softFocus} className={`switch ${settings.softFocus ? 'on' : ''}`} onClick={() => void update({ softFocus: !settings.softFocus })}><span /></button></div>
    <div className="theme-presets">{BUILTIN_THEMES.map(theme => <button key={theme.id} className="theme-card" aria-label={`${theme.name} 테마 적용`} aria-pressed={settings.theme === theme.id} onClick={() => void update(themePatch(theme))}><ThemePreview theme={theme} /><span>{theme.name}</span></button>)}</div>
    <div className="theme-saved-heading"><strong>내 테마 <small>{saved.length}/30</small></strong><button onClick={() => edit({ ...resolvedTheme(settings, systemDark), opacity: settings.opacity, fontFamily: settings.fontFamily, fontSize: settings.fontSize, lineWidth: settings.lineWidth, ...(settings.backgroundColor !== 'none' ? { background: settings.backgroundColor } : {}) }, true)} disabled={saved.length >= 30}><Plus size={14} /> 새 테마 만들기</button></div>
    {!saved.length && <p className="theme-empty">기본 테마를 바탕으로 색상과 질감, 사진 틀을 바꿔 저장하세요.</p>}
    <div className="saved-themes">{saved.map(theme => <div className="saved-theme" key={theme.id}><button aria-label={`${theme.name} 저장 테마 적용`} aria-pressed={settings.theme === 'custom' && settings.customThemeId === theme.id} onClick={() => void update(themePatch(theme, true))}><span style={{ background: theme.background, color: theme.text, borderColor: theme.accent }}>Aa</span>{theme.name}</button><button title="테마 편집" aria-label={`${theme.name} 테마 편집`} onClick={() => edit(theme, false)}><Pencil size={14} /></button><button title="테마 삭제" aria-label={`${theme.name} 테마 삭제`} onClick={async () => { await update({ ...(settings.customThemeId === theme.id ? themePatch(BUILTIN_THEMES[2]) : {}), customThemes: saved.filter(t => t.id !== theme.id) }); if (draft?.id === theme.id) setDraft(null); }}><Trash2 size={14} /></button></div>)}</div>
    {draft && <section className="theme-designer" aria-label="테마 편집기">
      <div className="theme-designer-heading"><strong>테마 디자인</strong><button onClick={() => setDraft(null)}>취소</button></div>
      <ThemePreview theme={draft} />
      <label className="theme-field">테마 이름<input aria-label="테마 이름" maxLength={60} value={draft.name} onChange={e => change({ name: e.target.value })} /></label>
      <div className="theme-colors">{([['background','배경'],['panel','설정창 배경'],['text','글자'],['accent','강조'],['line','달력 선']] as const).map(([key, label]) => <label key={key}><input type="color" aria-label={`테마 ${label} 색상`} value={draft[key]} onChange={e => change({ [key]: e.target.value })} /><span>{label}</span></label>)}</div>
      {contrastRatio(draft.background, draft.text) < 4.5 && <p className="theme-contrast">글자와 배경의 명도 차이를 키우면 더 잘 보입니다.</p>}
      <label className="theme-field">제목 스타일<select aria-label="테마 제목 스타일" value={draft.layout} onChange={e => change({ layout: e.target.value as ThemeDesign['layout'] })}><option value="classic">기본</option><option value="paper">종이 달력</option><option value="glass">아날로그 필기체</option></select></label>
      <label className="theme-field">밝기 모드<select aria-label="테마 밝기 모드" value={draft.mode} onChange={e => change({ mode: e.target.value as ThemeDesign['mode'] })}><option value="light">라이트</option><option value="dark">다크</option></select></label>
      <label className="theme-field">질감<select aria-label="테마 질감" value={draft.texture} onChange={e => change({ texture: e.target.value as ThemeDesign['texture'] })}><option value="none">없음</option><option value="paper">아날로그 종이</option></select></label>
      {draft.texture === 'paper' && <label className="theme-field">종이 질감 {draft.textureStrength}%<input aria-label="종이 질감 강도" type="range" min={0} max={100} value={draft.textureStrength} onChange={e => change({ textureStrength: +e.target.value })} /></label>}
      <label className="theme-field">기본 사진 틀<select aria-label="테마 기본 사진 틀" value={draft.defaultFrame} onChange={e => change({ defaultFrame: e.target.value as ThemeDesign['defaultFrame'] })}>{Object.entries(FRAME_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="theme-field">모서리 {draft.radius}px<input aria-label="테마 모서리" type="range" min={0} max={24} value={draft.radius} onChange={e => change({ radius: +e.target.value })} /></label>
      <label className="theme-field">불투명도 {draft.opacity}%<input aria-label="테마 불투명도" type="range" min={0} max={100} value={draft.opacity} onChange={e => change({ opacity: +e.target.value })} /></label>
      <label className="theme-field">글꼴<select aria-label="테마 글꼴" value={draft.fontFamily} onChange={e => change({ fontFamily: e.target.value })}><option value="">테마 기본</option>{[...new Set([draft.fontFamily, ...BUNDLED_FONTS, ...fonts])].filter(Boolean).map(font => <option key={font}>{font}</option>)}</select></label>
      <div className="theme-field"><span>글자 크기</span><FontSizeSpinner label="테마 글자 크기" value={draft.fontSize} change={fontSize => change({ fontSize })} /></div>
      <label className="theme-field">선 두께<select aria-label="테마 선 두께" value={draft.lineWidth} onChange={e => change({ lineWidth: +e.target.value })}>{Array.from({ length: 13 }, (_, i) => i / 2).map(v => <option key={v} value={v}>{v}px</option>)}</select></label>
      <div className="theme-save-actions"><button className="primary" disabled={busy || !draft.name.trim()} onClick={() => void save()}>저장하고 적용</button>{saved.some(t => t.id === draft.id) && <button disabled={busy || !draft.name.trim()} onClick={() => void save(true)}><Copy size={14} /> 새 테마로 저장</button>}</div>
    </section>}
    {message && <p role="status">{message}</p>}
  </div>;
}

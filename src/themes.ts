import { useEffect, useState, type CSSProperties } from 'react';
import type { Settings, ThemeDesign } from './types';

const base: ThemeDesign = { id: 'light', name: '라이트', mode: 'light', layout: 'classic', background: '#ffffff', panel: '#ffffff', text: '#252525', accent: '#505050', line: '#a0a0a0', texture: 'none', textureStrength: 0, defaultFrame: 'none', radius: 8, opacity: 30, fontFamily: '', fontSize: 13, lineWidth: 1 };
export const BUILTIN_THEMES: ThemeDesign[] = [
  base,
  { ...base, id: 'dark', name: '다크', mode: 'dark', background: '#181818', panel: '#252525', text: '#f2f2f2', accent: '#d5d5d5', line: '#777777' },
  { ...base, id: 'polaroid', name: '폴라로이드', layout: 'paper', background: '#ffffff', panel: '#ffffff', text: '#282828', accent: '#444444', line: '#888888', texture: 'paper', textureStrength: 68, defaultFrame: 'polaroid', radius: 2, opacity: 96 },
  { ...base, id: 'analog', name: '아날로그', mode: 'dark', layout: 'glass', background: '#262626', panel: '#303030', text: '#fafafa', accent: '#e4e4e4', line: '#d4d4d4', defaultFrame: 'stamp', radius: 4, opacity: 36 },
];
export const themeFor = (settings: Settings): ThemeDesign => settings.theme === 'custom'
  ? settings.customThemes?.find(t => t.id === settings.customThemeId) ?? BUILTIN_THEMES[0]
  : BUILTIN_THEMES.find(t => t.id === settings.theme) ?? BUILTIN_THEMES[0];
export const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
export const themePatch = (theme: ThemeDesign, custom = false): Partial<Settings> => ({ theme: custom ? 'custom' : theme.id as Settings['theme'], customThemeId: custom ? theme.id : undefined, ...(!custom && ['light','dark'].includes(theme.id) ? { colorMode: theme.mode } : {}), backgroundColor: 'none', opacity: theme.opacity, fontFamily: theme.fontFamily, fontSize: theme.fontSize, lineWidth: theme.lineWidth });
export function useSystemDark() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const query = matchMedia('(prefers-color-scheme: dark)'); const update = () => setDark(query.matches); query.addEventListener('change', update); update(); return () => query.removeEventListener('change', update); }, []);
  return dark;
}
// Reverse lightness while preserving the user's hue and saturation.
function oppositeLightness(hex: `#${string}`): `#${string}` {
  const channels = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16) / 255);
  const max = Math.max(...channels), min = Math.min(...channels), delta = 1 - max - min;
  return `#${channels.map(c => Math.round((c + delta) * 255).toString(16).padStart(2,'0')).join('')}`;
}
export function resolvedTheme(settings: Settings, systemDark: boolean): ThemeDesign {
  const theme = themeFor(settings);
  const mode = settings.colorMode === 'system' || !settings.colorMode ? (systemDark ? 'dark' : 'light') : settings.colorMode;
  if (settings.theme === 'custom') return mode === theme.mode ? theme : { ...theme, mode, background: oppositeLightness(theme.background), panel: oppositeLightness(theme.panel), text: oppositeLightness(theme.text), accent: oppositeLightness(theme.accent), line: oppositeLightness(theme.line) };
  if (['light','dark'].includes(settings.theme)) return BUILTIN_THEMES.find(t => t.id === mode)!;
  const palette = mode === 'dark'
    ? { background: '#222222', panel: '#292929', text: '#f2f2f2', accent: '#dedede', line: '#8c8c8c' } as const
    : { background: '#ffffff', panel: '#ffffff', text: '#282828', accent: '#444444', line: '#888888' } as const;
  return { ...theme, mode, ...palette };
}
export function themeStyle(theme: ThemeDesign): CSSProperties {
  return { '--surface-rgb': rgb(theme.background), '--panel': theme.panel, '--text': theme.text, '--sub': theme.text + 'b8', '--soft': theme.text + '8a', '--accent': theme.accent, '--accent-dark': theme.accent, '--accent-bg': theme.accent + '1a', '--hover': theme.accent + '12', '--line': theme.line, '--theme-radius': `${theme.radius}px`, '--paper-opacity': theme.texture === 'paper' ? theme.textureStrength / 100 : 0, colorScheme: theme.mode } as CSSProperties;
}
export function contrastRatio(a: string, b: string) {
  const luma = (hex: string) => [1,3,5].map(i => parseInt(hex.slice(i, i + 2),16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126,.7152,.0722][i], 0);
  const x = luma(a), y = luma(b);
  return (Math.max(x,y) + .05) / (Math.min(x,y) + .05);
}

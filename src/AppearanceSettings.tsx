import { useEffect, useState } from 'react';
import type { HolidayResult, Settings } from './types';

export const fontStack = (family: string) => `${family ? JSON.stringify(family) + ',' : ''}'Segoe UI','Malgun Gothic',sans-serif`;
const countryNames = new Intl.DisplayNames(['ko'], { type: 'region' });
export const countryName = (code: string) => code ? countryNames.of(code) || code : '감지 안 됨';

export function AppearanceSettings({ settings, update, holidays, refresh }: {
  settings: Settings; update: (patch: Partial<Settings>) => Promise<void>;
  holidays: HolidayResult & { loading: boolean }; refresh: () => void;
}) {
  const [fonts, setFonts] = useState<string[]>([]);
  const [fontError, setFontError] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [countryError, setCountryError] = useState('');
  const [systemCountry, setSystemCountry] = useState('');
  useEffect(() => {
    let active = true;
    window.calendar.installedFonts().then(value => { if (active) setFonts(value); }).catch(() => { if (active) setFontError('설치된 글꼴 목록을 읽지 못했습니다. 설정을 다시 열어 주세요.'); });
    window.calendar.systemCountry().then(value => { if (active) setSystemCountry(value); }).catch(() => {});
    window.calendar.holidayCountries().then(value => { if (active) setCountries(value.map(country => country.countryCode).sort((a, b) => countryName(a).localeCompare(countryName(b), 'ko'))); }).catch(() => { if (active) setCountryError('국가 목록을 받지 못했습니다. 인터넷 연결 후 설정을 다시 열어 주세요.'); });
    return () => { active = false; };
  }, []);
  const choices = [...new Set([...(settings.fontFamily ? [settings.fontFamily] : []), ...fonts])];
  const countryChoices = [...new Set([...(settings.holidayCountry !== 'auto' ? [settings.holidayCountry] : []), ...(systemCountry ? [systemCountry] : []), ...countries])];
  return <>
    <div className="setting-row"><div><strong>글꼴</strong>{fontError && <p role="status">{fontError}</p>}</div><select aria-label="글꼴" value={settings.fontFamily} onChange={e => void update({ fontFamily: e.target.value })}><option value="">시스템 기본</option>{choices.map(font => <option key={font} value={font} style={{ fontFamily: fontStack(font) }}>{font}</option>)}</select></div>
    <div className="setting-row"><strong>달력 선 두께</strong><select aria-label="달력 선 두께" value={settings.lineWidth} onChange={e => void update({ lineWidth: Number(e.target.value) })}>{Array.from({ length: 13 }, (_, i) => i / 2).map(width => <option key={width} value={width}>{width === 0 ? '선 없음' : `${width}px`}</option>)}</select></div>
    <div className="setting-row"><strong>공휴일 표시</strong><button role="switch" aria-label="공휴일 표시" aria-checked={settings.showHolidays} className={`switch ${settings.showHolidays ? 'on' : ''}`} onClick={() => void update({ showHolidays: !settings.showHolidays })}><span /></button></div>
    {settings.showHolidays && <div className="setting-row holiday-setting">
      <strong>공휴일 국가</strong>
      <select aria-label="공휴일 국가" value={settings.holidayCountry} onChange={e => void update({ holidayCountry: e.target.value })}>
        <option value="auto">자동 · {countryName(systemCountry)}</option>
        {countryChoices.map(code => <option key={code} value={code}>{countryName(code)}</option>)}
      </select>
      <p>자동 선택은 Windows 국가/지역 설정을 따릅니다. 국가 공통 공휴일을 표시합니다.</p>
      <p className="holiday-status" role="status">{holidays.loading ? '공휴일을 불러오는 중…' : holidays.error || (holidays.stale ? '오프라인 · 마지막으로 받은 공휴일 표시 중' : `${countryName(holidays.countryCode)} · 공휴일 자동 갱신`)}{countryError && ` ${countryError}`}</p>
      <button className="holiday-refresh" disabled={holidays.loading} onClick={refresh}>공휴일 다시 불러오기</button>
    </div>}
  </>;
}

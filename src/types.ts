export type PaletteColor = 'none' | `#${string}`;
export type Color = PaletteColor | 'sage' | 'peach' | 'lavender' | 'sky' | 'rose';
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type PhotoFrame = 'none' | 'polaroid' | 'stamp';
export interface PhotoPlacement { x: number; y: number; rotation: number }
export interface Photo { id: string; name: string; file: string; width: number; height: number; frame?: PhotoFrame; placement?: PhotoPlacement }
export interface ThemeDesign {
  id: string; name: string; mode: 'light' | 'dark'; layout: 'classic' | 'paper' | 'glass';
  background: `#${string}`; panel: `#${string}`; text: `#${string}`; accent: `#${string}`; line: `#${string}`;
  texture: 'none' | 'paper'; textureStrength: number; defaultFrame: PhotoFrame;
  radius: number; opacity: number; fontFamily: string; fontSize: number; lineWidth: number;
}
export interface StrikeRange { from: number; to: number }
export interface TextColorRange extends StrikeRange { color: `#${string}` }
export interface TextSizeRange extends StrikeRange { size: number }
export type PhotoSize = 'small' | 'medium' | 'large';
export interface DayEntry { text: string; strikes: StrikeRange[]; textColors?: TextColorRange[]; textSizes?: TextSizeRange[]; fontSize?: number; photoBlur?: boolean; photoSize?: PhotoSize; photos: Photo[]; color: Color }
export interface Settings {
  theme: 'light' | 'dark' | 'polaroid' | 'analog' | 'custom';
  colorMode: 'system' | 'light' | 'dark';
  softFocus: boolean;
  privacyLocked: boolean;
  customThemes?: ThemeDesign[];
  customThemeId?: string;
  backgroundColor: PaletteColor;
  opacity: number;
  weekStart: 0 | 1;
  fontSize: number;
  fontFamily: string;
  lineWidth: number;
  showHolidays: boolean;
  holidayCountry: string;
  windowMode: 'normal' | 'desktop' | 'top';
  startAtLogin: boolean;
}
export interface CalendarData { version: 3; days: Record<string, DayEntry>; settings: Settings }
export type ImportPhoto = { name: string; bytes: ArrayBuffer } | { name: string; path: string };
export interface HolidayResult { countryCode: string; holidays: { date: string; name: string }[]; stale: boolean; error: string }
export interface ExcelPreview {
  token: string; filename: string; format: string; count: number; firstDate: string; lastDate: string;
  ambiguities: { id: string; label: string; candidates: string[] }[];
  sample: { date: string; text: string }[];
}
export interface DesktopAPI {
  openCalendar(range: CalendarRange): Promise<CalendarPreview | null>;
  previewCalendar(token: string, range: CalendarRange): Promise<CalendarPreview>;
  importCalendar(token: string, mode: 'merge' | 'replace'): Promise<CalendarData>;
  load(): Promise<CalendarData>;
  openExcel(): Promise<ExcelPreview | null>;
  previewExcel(token: string, choices: Record<string, string>): Promise<ExcelPreview>;
  importExcel(token: string, choices: Record<string, string>, mode: 'merge' | 'replace'): Promise<CalendarData>;
  exportExcel(format: 'list' | 'calendar'): Promise<boolean>;
  saveDay(date: string, entry: DayEntry): Promise<void>;
  importPhotos(files: ImportPhoto[]): Promise<Photo[]>;
  photoLuminance(file: string, aspectRatio: number): Promise<number>;
  photoPath(file: File): string;
  installedFonts(): Promise<string[]>;
  systemCountry(): Promise<string>;
  holidayCountries(): Promise<{ countryCode: string; name: string }[]>;
  holidays(years: number[], countryCode: string): Promise<HolidayResult>;
  pickPhotos(): Promise<Photo[]>;
  pastePhotos(): Promise<Photo[]>;
  beginResize(edge: ResizeEdge, x: number, y: number): void;
  resizeTo(x: number, y: number): void;
  endResize(): void;
  setEditorOpen(open: boolean): Promise<number>;
  saveSettings(settings: Settings): Promise<Settings>;
  exportBackup(): Promise<boolean>;
  importBackup(): Promise<CalendarData | null>;
  openDataFolder(): Promise<void>;
  minimize(): void;
  close(): void;
  quit(): void;
  onSettings(callback: (settings: Settings) => void): () => void;
  onFocusDate(callback: () => void): () => void;
  onBlur(callback: () => void): () => void;
}
export interface CalendarRange { from: string; to: string }
export interface CalendarPreview {
  token: string; filename: string; count: number; eventCount: number; firstDate: string; lastDate: string;
  calendars: string[]; range: CalendarRange; timeZone: string; sample: { date: string; text: string }[];
}
declare global { interface Window { calendar: DesktopAPI } }

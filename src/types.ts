export type PaletteColor = 'none' | `#${string}`;
export type Color = PaletteColor | 'sage' | 'peach' | 'lavender' | 'sky' | 'rose';
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export interface Photo { id: string; name: string; file: string; width: number; height: number }
export interface StrikeRange { from: number; to: number }
export interface DayEntry { text: string; strikes: StrikeRange[]; photos: Photo[]; color: Color }
export interface Settings {
  theme: 'light' | 'dark';
  backgroundColor: PaletteColor;
  opacity: number;
  weekStart: 0 | 1;
  fontSize: number;
  windowMode: 'normal' | 'desktop' | 'top';
  startAtLogin: boolean;
}
export interface CalendarData { version: 3; days: Record<string, DayEntry>; settings: Settings }
export interface ImportPhoto { name: string; bytes: ArrayBuffer }
export interface DesktopAPI {
  load(): Promise<CalendarData>;
  saveDay(date: string, entry: DayEntry): Promise<void>;
  importPhotos(files: ImportPhoto[]): Promise<Photo[]>;
  pickPhotos(): Promise<Photo[]>;
  pastePhotos(): Promise<Photo[]>;
  beginResize(edge: ResizeEdge, x: number, y: number): void;
  resizeTo(x: number, y: number): void;
  endResize(): void;
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
declare global { interface Window { calendar: DesktopAPI } }

import type { DayEntry } from './types';

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export const emptyDay = (): DayEntry => ({ text: '', strikes: [], photos: [], color: 'none' });
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function monthDays(month: Date, weekStart: 0 | 1): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Math.max(35, Math.ceil((offset + count) / 7) * 7);
  return Array.from({ length: cells }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i, 12));
}
export function shiftMonth(month: Date, amount: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + amount, 1, 12);
}
export function longDate(key: string): string {
  return fromKey(key).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}
export function hasContent(entry?: DayEntry): boolean {
  return !!entry && (!!entry.text.trim() || entry.photos.length > 0);
}

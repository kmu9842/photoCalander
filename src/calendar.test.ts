import { describe, expect, it } from 'vitest';
import { dateKey, fromKey, monthDays, shiftMonth } from './calendar';

describe('calendar dates', () => {
  it('keeps dates local and includes leap days', () => {
    expect(dateKey(fromKey('2024-02-29'))).toBe('2024-02-29');
    const days = monthDays(fromKey('2024-02-01'), 0);
    expect(days.map(dateKey)).toContain('2024-02-29');
    expect(days[0].getDay()).toBe(0);
    expect(days).toHaveLength(35);
  });
  it('uses six weeks when necessary and supports Monday first', () => {
    expect(monthDays(fromKey('2026-08-01'), 0)).toHaveLength(42);
    expect(monthDays(fromKey('2026-08-01'), 1)[0].getDay()).toBe(1);
  });
  it('changes months without overflowing short months', () => {
    expect(dateKey(shiftMonth(fromKey('2026-01-31'), 1))).toBe('2026-02-01');
    expect(dateKey(shiftMonth(fromKey('2026-12-31'), 1))).toBe('2027-01-01');
    expect(dateKey(shiftMonth(fromKey('2026-01-01'), -1))).toBe('2025-12-01');
  });
});

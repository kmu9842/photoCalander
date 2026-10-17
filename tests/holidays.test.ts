import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { HolidayService } = createRequire(import.meta.url)('../electron/holidays.cjs');
const directories: string[] = [];
const holiday = { date: '2026-10-09', localName: '한글날', name: 'Hangul Day', countryCode: 'KR', global: true, types: ['Public'] };
async function service(fetcher: unknown) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photocalendar-holiday-'));
  directories.push(directory);
  return new HolidayService(directory, fetcher);
}
afterEach(async () => { vi.restoreAllMocks(); for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });

describe('country public holiday retrieval', () => {
  it('deduplicates requests, filters regional/observance dates, and reuses a disk cache after restart', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => [holiday, { ...holiday, global: false }, { ...holiday, types: ['Observance'] }] }));
    const api = await service(fetcher);
    const [first, second] = await Promise.all([api.holidays([2026], 'KR'), api.holidays([2026], 'KR')]);
    expect(first).toEqual(second);
    expect(first.holidays).toEqual([{ date: '2026-10-09', name: '한글날' }]);
    expect(fetcher).toHaveBeenCalledOnce();
    const offline = vi.fn(async () => { throw new Error('offline'); });
    const reopened = new HolidayService(directories[0], offline);
    expect(await reopened.holidays([2026], 'KR')).toEqual(first);
    expect(offline).not.toHaveBeenCalled();
  });
  it('retains stale holidays offline and never mixes one country with another', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => [holiday] }));
    const api = await service(fetcher);
    await api.holidays([2026], 'KR');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 86400000);
    fetcher.mockRejectedValue(new Error('offline'));
    expect(await api.holidays([2026], 'KR')).toMatchObject({ stale: true, holidays: [{ date: holiday.date, name: holiday.localName }] });
    expect(await api.holidays([2026], 'US')).toMatchObject({ holidays: [], stale: false, error: expect.any(String) });
  });
  it('reports unavailable locations and rejects malformed responses without caching them', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => [{ ...holiday, date: '2026-02-30' }] }));
    const api = await service(fetcher);
    expect(await api.holidays([2026], '')).toMatchObject({ holidays: [], error: expect.stringContaining('국가') });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await api.holidays([2026], 'KR')).toMatchObject({ holidays: [], error: expect.stringContaining('불러오지') });
  });
});

const fs = require('node:fs/promises');
const path = require('node:path');
const { validDate } = require('./store.cjs');

const API = 'https://date.nager.at/api/v3';
const DAY = 24 * 60 * 60 * 1000;
class HolidayService {
  constructor(directory, fetcher = fetch) {
    this.directory = path.join(directory, 'holiday-cache');
    this.fetcher = fetcher;
    this.pending = new Map();
    this.memory = new Map();
  }
  async cached(key, endpoint, validate) {
    if (this.pending.has(key)) return this.pending.get(key);
    const request = this.read(key, endpoint, validate).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
  async read(key, endpoint, validate) {
    const filename = path.join(this.directory, key + '.json');
    let cached = this.memory.get(key);
    if (!cached) {
      try {
        const raw = JSON.parse(await fs.readFile(filename, 'utf8'));
        if (Number.isFinite(raw.savedAt)) cached = { savedAt: raw.savedAt, data: validate(raw.data) };
      } catch { /* Missing or invalid caches are refreshed from the service. */ }
    }
    if (cached && Date.now() - cached.savedAt < DAY && cached.savedAt <= Date.now()) return { data: cached.data, stale: false };
    try {
      const response = await this.fetcher(`${API}/${endpoint}`, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = validate(await response.json());
      const record = { savedAt: Date.now(), data };
      this.memory.set(key, record);
      try {
        await fs.mkdir(this.directory, { recursive: true });
        await fs.writeFile(filename + '.tmp', JSON.stringify(record));
        await fs.rename(filename + '.tmp', filename);
      } catch { /* Display a successful response even when the cache cannot be saved. */ }
      return { data, stale: false };
    } catch (error) {
      if (cached) return { data: cached.data, stale: true };
      throw error;
    }
  }
  async countries() {
    const result = await this.cached('countries', 'AvailableCountries', data => {
      if (!Array.isArray(data) || !data.length || data.some(item => !/^[A-Z]{2}$/.test(item.countryCode) || typeof item.name !== 'string')) throw new Error('Invalid countries');
      return data.map(({ countryCode, name }) => ({ countryCode, name }));
    });
    return result.data;
  }
  async holidays(years, countryCode) {
    if (!/^[A-Z]{2}$/.test(countryCode)) return { countryCode: '', holidays: [], stale: false, error: 'Windows 지역을 확인할 수 없습니다. 설정에서 국가를 선택해 주세요.' };
    if (!Array.isArray(years) || years.length > 3 || years.some(year => !Number.isInteger(year) || year < 1899 || year > 2201)) throw new Error('조회 연도가 올바르지 않습니다.');
    const results = await Promise.allSettled([...new Set(years)].map(year => this.cached(`${countryCode}-${year}`, `PublicHolidays/${year}/${countryCode}`, data => {
      if (!Array.isArray(data) || data.some(item => !item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !validDate(item.date) || Number(item.date.slice(0, 4)) !== year || item.countryCode !== countryCode || typeof item.localName !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.types) || typeof item.global !== 'boolean')) throw new Error('Invalid holidays');
      return data;
    })));
    const holidays = results.flatMap(result => result.status === 'fulfilled' ? result.value.data : [])
      .filter(item => item.global && item.types.includes('Public'))
      .map(({ date, localName, name }) => ({ date, name: localName || name }));
    return {
      countryCode, holidays, stale: results.some(result => result.status === 'fulfilled' && result.value.stale),
      error: results.some(result => result.status === 'rejected') ? '공휴일을 불러오지 못했습니다. 인터넷 연결과 지원 국가를 확인해 주세요.' : '',
    };
  }
}
module.exports = { HolidayService };

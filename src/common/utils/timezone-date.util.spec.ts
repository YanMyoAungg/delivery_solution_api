import { getDateInTimeZone } from './timezone-date.util.js';

describe('getDateInTimeZone', () => {
  it('uses the configured timezone calendar day', () => {
    expect(getDateInTimeZone(new Date('2026-10-16T17:30:00.000Z'), 'Asia/Yangon')).toBe('2026-10-17');
  });

  it('does not advance the day before midnight in the configured timezone', () => {
    expect(getDateInTimeZone(new Date('2026-10-16T17:29:59.999Z'), 'Asia/Yangon')).toBe('2026-10-16');
  });

  it('changes the Myanmar business day exactly at local midnight', () => {
    expect(getDateInTimeZone(new Date('2026-10-16T17:30:00.000Z'), 'Asia/Yangon')).toBe('2026-10-17');
    expect(getDateInTimeZone(new Date('2026-10-16T17:29:59.999Z'), 'Asia/Yangon')).toBe('2026-10-16');
  });
});

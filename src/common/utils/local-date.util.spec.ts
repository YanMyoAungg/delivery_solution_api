import { currentDateInTimezone } from './local-date.util.js';

describe('currentDateInTimezone', () => {
  it('uses the configured office calendar date rather than the UTC date', () => {
    expect(
      currentDateInTimezone('Asia/Yangon', new Date('2026-09-28T18:29:00.000Z')),
    ).toBe('2026-09-29');
  });

  it('keeps the previous office date until local midnight', () => {
    expect(
      currentDateInTimezone('Asia/Yangon', new Date('2026-09-28T17:29:00.000Z')),
    ).toBe('2026-09-28');
  });
});

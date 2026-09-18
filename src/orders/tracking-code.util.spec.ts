import { generateTrackingCode, generateUlid } from './tracking-code.util.js';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TRACKING_CODE_PATTERN = /^ORD-[0-9A-HJKMNP-TV-Z]{26}$/;

describe('tracking-code.util', () => {
  it('generates a 26-character Crockford base32 ULID', () => {
    const ulid = generateUlid();
    expect(ulid).toMatch(ULID_PATTERN);
    expect(ulid).toHaveLength(26);
  });

  it('generates tracking codes in the ORD-<ULID> format', () => {
    expect(generateTrackingCode()).toMatch(TRACKING_CODE_PATTERN);
  });

  it('generates distinct tracking codes', () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateTrackingCode()),
    );
    expect(codes.size).toBe(50);
  });
});

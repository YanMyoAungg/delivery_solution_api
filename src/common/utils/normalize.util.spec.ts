import { describe, expect, it } from 'vitest';
import { normalizeEmail, escapeLikeWildcards } from './normalize.util.js';

describe('normalizeEmail', () => {
  it('lowercases the address', () => {
    expect(normalizeEmail('Owner@Delivery.Local')).toBe('owner@delivery.local');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  owner@delivery.local  ')).toBe(
      'owner@delivery.local',
    );
  });
});

describe('escapeLikeWildcards', () => {
  it('escapes % and _ wildcards', () => {
    expect(escapeLikeWildcards('foo%bar_baz')).toBe('foo\\%bar\\_baz');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLikeWildcards('alice smith')).toBe('alice smith');
  });
});

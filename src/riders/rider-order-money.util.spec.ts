import { calculateCodToCollect } from './rider-order-money.util.js';

describe('calculateCodToCollect', () => {
  it('adds package price and delivery fee when neither has been paid', () => {
    expect(calculateCodToCollect('47000.00', '3500.00', false, false)).toBe(
      '50500.00',
    );
  });

  it('excludes the delivery fee when it has already been paid', () => {
    expect(calculateCodToCollect('47000.00', '3500.00', false, true)).toBe(
      '47000.00',
    );
  });

  it('returns zero when the package price and delivery fee are paid', () => {
    expect(calculateCodToCollect('47000.00', '3500.00', true, true)).toBe(
      '0.00',
    );
  });
});

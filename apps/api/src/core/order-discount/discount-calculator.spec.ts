import {
  allocateCents,
  calculateDiscountCents,
  fromCents,
  toCents,
} from './discount-calculator';

describe('discount-calculator', () => {
  it('calculates percentage and fixed discounts in cents', () => {
    expect(calculateDiscountCents('percentage', 10, 19000)).toBe(1900);
    expect(calculateDiscountCents('fixed', 35, 7000)).toBe(3500);
  });

  it('calculates a special price for all units', () => {
    expect(calculateDiscountCents('special_price', 25, 7000, 2)).toBe(2000);
  });

  it('allocates every cent exactly once', () => {
    const allocation = allocateCents(100, [1, 1, 1]);
    expect(allocation).toEqual([34, 33, 33]);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('converts money without losing cents', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(fromCents(1999)).toBe(19.99);
  });
});

// backend/tests/unit/PricingService.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PricingService = require('../../services/PricingService');

describe('PricingService.calculateOrderTotal', () => {
  it('порожній список → 0', () => {
    expect(PricingService.calculateOrderTotal([])).toBe(0);
  });

  it('сума ціна × кількість; ціна з БД приходить рядком', () => {
    const items = [{ price: '150.50', quantity: 2 }, { price: '10.00', quantity: 3 }];
    expect(PricingService.calculateOrderTotal(items)).toBe(331);
  });

  it("D-BIZ-01: знижка товару, надбавки варіантів і опції позиції не впливають на суму", () => {
    const items = [{ price: '100.00', quantity: 1, sale_percentage: 50, options: { size: 'XL', extra: 500 } }];
    expect(PricingService.calculateOrderTotal(items)).toBe(100);
  });

  it("D-BIZ-09: від'ємна кількість дає від'ємний внесок", () => {
    const items = [{ price: '100.00', quantity: 2 }, { price: '1.00', quantity: -1 }];
    expect(PricingService.calculateOrderTotal(items)).toBe(199);
    expect(PricingService.calculateOrderTotal([{ price: '100.00', quantity: -1 }])).toBe(-100);
  });

  it('нечислова кількість або ціна дають NaN', () => {
    expect(Number.isNaN(PricingService.calculateOrderTotal([{ price: '100.00', quantity: 'abc' }]))).toBe(true);
    expect(Number.isNaN(PricingService.calculateOrderTotal([{ price: 'x', quantity: 1 }]))).toBe(true);
  });

  it('порядок додавання збігається з послідовним накопиченням', () => {
    const items = [{ price: '0.1', quantity: 1 }, { price: '0.2', quantity: 1 }, { price: '0.3', quantity: 1 }];
    let expected = 0;
    for (const item of items) expected += parseFloat(item.price) * item.quantity;
    expect(PricingService.calculateOrderTotal(items)).toBe(expected);
  });
});

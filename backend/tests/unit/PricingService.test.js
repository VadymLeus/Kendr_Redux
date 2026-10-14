// backend/tests/unit/PricingService.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PricingService = require('../../services/PricingService');
const { ServiceError } = require('../../services/ServiceError');

const SIZE = {
  name: 'Розмір',
  values: [
    { label: 'S', priceModifier: 0, salePercentage: 0 },
    { label: 'XL', priceModifier: 50, salePercentage: 0 },
    { label: 'Акція', priceModifier: 20, salePercentage: 25 },
  ],
};
const COLOR = { name: 'Колір', values: [{ label: 'Червоний', priceModifier: 10, salePercentage: 10 }, { label: 'Білий' }] };
const product = (overrides = {}) => ({
  name: 'Кава', price: '100.00', sale_percentage: 0, category_discount: null, variants: null, ...overrides,
});

describe('PricingService.unitPrice: ціна без варіантів', () => {
  it('каталожна ціна, якщо знижок немає; ціна з БД приходить рядком', () => {
    expect(PricingService.unitPrice(product(), {})).toBe(100);
    expect(PricingService.unitPrice(product({ price: '149.90' }), {})).toBe(150);
  });

  it('D-BIZ-01: знижка товару', () => {
    expect(PricingService.unitPrice(product({ sale_percentage: 20 }), {})).toBe(80);
  });

  it('D-BIZ-01: знижка категорії застосовується, якщо знижки товару немає', () => {
    expect(PricingService.unitPrice(product({ category_discount: 15 }), {})).toBe(85);
  });

  it('D-BIZ-01: знижка товару має пріоритет над знижкою категорії, а не складається з нею', () => {
    expect(PricingService.unitPrice(product({ sale_percentage: 10, category_discount: 50 }), {})).toBe(90);
  });

  it('ціна округлюється до цілого, як у вітрині', () => {
    expect(PricingService.unitPrice(product({ price: '99', sale_percentage: 10 }), {})).toBe(89);
    expect(PricingService.unitPrice(product({ price: '10.5', sale_percentage: 0 }), {})).toBe(11);
  });

  it.each([[-10], [150], ['abc'], [null]])('некоректна знижка %j не дає від\'ємної ціни', (sale) => {
    const price = PricingService.unitPrice(product({ sale_percentage: sale }), {});
    expect(price >= 0 && price <= 100).toBe(true);
  });

  it('знижка 100 % і 150 % дають нульову ціну', () => {
    expect(PricingService.unitPrice(product({ sale_percentage: 100 }), {})).toBe(0);
    expect(PricingService.unitPrice(product({ sale_percentage: 150 }), {})).toBe(0);
  });

  it('нечислова ціна дорівнює нулю', () => {
    expect(PricingService.unitPrice(product({ price: 'x' }), {})).toBe(0);
  });
});

describe('PricingService.unitPrice: варіанти', () => {
  const withVariants = (overrides = {}) => product({ variants: [SIZE, COLOR], ...overrides });

  it('D-BIZ-01: надбавка вибраного значення додається до ціни', () => {
    expect(PricingService.unitPrice(withVariants(), { 'Розмір': 'XL' })).toBe(150);
  });

  it('надбавки кількох варіантів сумуються', () => {
    expect(PricingService.unitPrice(withVariants(), { 'Розмір': 'XL', 'Колір': 'Білий' })).toBe(150);
    expect(PricingService.unitPrice(withVariants(), { 'Розмір': 'XL', 'Колір': 'Червоний' })).toBe(Math.round(160 * 0.9));
  });

  it('D-BIZ-01: знижка вибраного значення має пріоритет над знижками товару й категорії', () => {
    const catalog = withVariants({ sale_percentage: 50, category_discount: 60 });
    expect(PricingService.unitPrice(catalog, { 'Розмір': 'Акція' })).toBe(Math.round(120 * 0.75));
  });

  it('з кількох знижок вибраних значень береться найбільша', () => {
    expect(PricingService.unitPrice(withVariants(), { 'Розмір': 'Акція', 'Колір': 'Червоний' })).toBe(Math.round(130 * 0.75));
  });

  it('значення без знижки лишає знижку товару', () => {
    expect(PricingService.unitPrice(withVariants({ sale_percentage: 20 }), { 'Розмір': 'XL' })).toBe(120);
  });

  it('варіанти, не вибрані покупцем, ціну не змінюють', () => {
    expect(PricingService.unitPrice(withVariants(), {})).toBe(100);
    expect(PricingService.unitPrice(withVariants(), undefined)).toBe(100);
  });

  it('варіанти з БД можуть бути рядком JSON', () => {
    const catalog = product({ variants: JSON.stringify([SIZE]) });
    expect(PricingService.unitPrice(catalog, { 'Розмір': 'XL' })).toBe(150);
  });

  it('від\'ємна надбавка знижує ціну, але не нижче нуля', () => {
    const cheap = product({ price: 10, variants: [{ name: 'Тип', values: [{ label: 'Знижка', priceModifier: -50 }] }] });
    expect(PricingService.unitPrice(cheap, { 'Тип': 'Знижка' })).toBe(0);
  });

  it.each([['size', 'XL'], ['Розмір', 'XXL'], ['Розмір', undefined]])(
    'D-BIZ-01: невідомий варіант %j: %j відхиляється з 400', (name, label) => {
      let error;
      try {
        PricingService.unitPrice(withVariants(), { [name]: label });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ServiceError);
      expect(error.status).toBe(400);
      expect(error.message).toContain('Кава');
    }
  );

  it('товар без варіантів відхиляє будь-яку опцію', () => {
    expect(() => PricingService.unitPrice(product(), { 'Розмір': 'XL' })).toThrow();
  });

  it.each([[null], [[]], ['XL'], [5]])('опції у вигляді %j рахуються порожніми', (options) => {
    expect(PricingService.unitPrice(product({ variants: [SIZE] }), options)).toBe(100);
  });

  it('пошкоджені варіанти в товарі не ламають розрахунок без вибору', () => {
    expect(PricingService.unitPrice(product({ variants: '{oops' }), {})).toBe(100);
    expect(PricingService.unitPrice(product({ variants: [null, { name: 'X' }] }), {})).toBe(100);
  });
});

describe('PricingService.calculateOrderTotal', () => {
  it('порожній список → 0', () => {
    expect(PricingService.calculateOrderTotal([])).toBe(0);
  });

  it('сума ціна × кількість; ціна з БД приходить рядком', () => {
    const items = [{ price: '150.50', quantity: 2 }, { price: '10.00', quantity: 3 }];
    expect(PricingService.calculateOrderTotal(items)).toBe(331);
  });

  it('сума округлюється до копійок без накопичення похибки', () => {
    const items = [{ price: '0.1', quantity: 1 }, { price: '0.2', quantity: 1 }, { price: '0.3', quantity: 1 }];
    expect(PricingService.calculateOrderTotal(items)).toBe(0.6);
  });
});

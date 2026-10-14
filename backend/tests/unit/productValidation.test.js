// backend/tests/unit/productValidation.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readPrice, readSalePercentage, readStock, readType, readDiscount } = require('../../services/productValidation');
const { ServiceError } = require('../../services/ServiceError');

const refusal = (fn) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    return error;
  }
  throw new Error('Очікувалася ServiceError');
};

describe('readPrice', () => {
  it.each([[undefined, 0], [null, 0], ['', 0], [0, 0], ['0', 0], [12.5, 12.5], ['12.50', 12.5], [99999999.99, 99999999.99]])('%j → %j', (input, expected) => {
    expect(readPrice(input)).toBe(expected);
  });

  it.each([[-0.01], ['-1'], ['abc'], [NaN], [Infinity], [100000000], [[]], [{}], [true], ['  ']])('%j → 400', (input) => {
    expect(refusal(() => readPrice(input)).status).toBe(400);
  });
});

describe('readSalePercentage', () => {
  it.each([[undefined, 0], ['', 0], [0, 0], ['25', 25], [100, 100], [33.4, 33], [33.5, 34]])('%j → %j', (input, expected) => {
    expect(readSalePercentage(input)).toBe(expected);
  });

  it.each([[-1], [100.5], [101], ['abc'], [NaN]])('%j → 400', (input) => {
    expect(refusal(() => readSalePercentage(input)).status).toBe(400);
  });
});

describe('readStock', () => {
  it.each([[undefined, null], [null, null], ['', null], [0, 0], ['0', 0], ['7', 7], [7, 7]])('%j → %j', (input, expected) => {
    expect(readStock(input)).toBe(expected);
  });

  it.each([[-1], ['1.5'], [2.5], ['abc'], [NaN]])('%j → 400', (input) => {
    expect(refusal(() => readStock(input)).status).toBe(400);
  });
});

describe('readType', () => {
  it.each([['physical', 'physical'], ['digital', 'digital'], [undefined, undefined], [null, undefined], ['', undefined]])('%j → %j', (input, expected) => {
    expect(readType(input)).toBe(expected);
  });

  it.each([['gift'], ['Digital'], [5]])('%j → 400', (input) => {
    expect(refusal(() => readType(input)).message).toBe('Недопустимий тип товару.');
  });
});

describe('readDiscount (знижка категорії)', () => {
  it.each([[undefined, 0], [null, 0], ['', 0], [0, 0], ['15', 15], [100, 100]])('%j → %j', (input, expected) => {
    expect(readDiscount(input)).toBe(expected);
  });

  it.each([[-1], [101], [10.5], ['abc'], [NaN]])('%j → 400', (input) => {
    expect(refusal(() => readDiscount(input)).message).toBe('Знижка категорії має бути цілим числом від 0 до 100 %.');
  });
});

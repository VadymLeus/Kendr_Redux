// backend/tests/unit/PlanPolicy.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PlanPolicy = require('../../services/PlanPolicy');

describe('PlanPolicy.getLimits', () => {
  it('FREE: 3 сайти, 50 товарів, 20 категорій, 50 файлів по 5 МБ', () => {
    expect(PlanPolicy.getLimits('FREE')).toMatchObject({
      maxSites: 3, maxProducts: 50, maxCategories: 20, maxFiles: 50, maxFileSizeMB: 5, isUnlimited: false,
    });
  });

  it('PLUS: 8 сайтів, 200 товарів, 100 категорій, 150 файлів по 15 МБ', () => {
    expect(PlanPolicy.getLimits('PLUS')).toMatchObject({
      maxSites: 8, maxProducts: 200, maxCategories: 100, maxFiles: 150, maxFileSizeMB: 15, isUnlimited: false,
    });
  });

  it('ADMIN: без обмежень', () => {
    const limits = PlanPolicy.getLimits('ADMIN');
    expect(limits.isUnlimited).toBe(true);
    expect(limits.maxSites).toBeGreaterThan(1000000);
    expect(limits.maxProducts).toBeGreaterThan(1000000);
    expect(limits.maxCategories).toBeGreaterThan(1000000);
  });

  it.each([[undefined], [null], [''], ['UNKNOWN'], ['enterprise']])('невідомий тариф %j → ліміти FREE', (plan) => {
    expect(PlanPolicy.getLimits(plan)).toEqual(PlanPolicy.getLimits('FREE'));
  });

  it.each([['plus'], [' PLUS '], ['Plus']])('регістр і пробіли не мають значення: %j → PLUS', (plan) => {
    expect(PlanPolicy.getLimits(plan)).toEqual(PlanPolicy.getLimits('PLUS'));
  });

  it('дозволені розширення й MIME-типи однакові для всіх тарифів', () => {
    const free = PlanPolicy.getLimits('FREE');
    const plus = PlanPolicy.getLimits('PLUS');
    expect(plus.allowedExtensions).toEqual(free.allowedExtensions);
    expect(plus.allowedMimeTypes).toEqual(free.allowedMimeTypes);
  });
});

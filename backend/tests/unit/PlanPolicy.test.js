// backend/tests/unit/PlanPolicy.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PlanPolicy = require('../../services/PlanPolicy');
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

describe('PlanPolicy.assertWithinLimit', () => {
  it.each([
    ['FREE', 'sites', 3], ['FREE', 'products', 50], ['FREE', 'categories', 20],
    ['PLUS', 'sites', 8], ['PLUS', 'products', 200], ['PLUS', 'categories', 100],
  ])('D-BIZ-03: тариф %s дозволяє %s до %i включно, наступний — 403', (plan, resource, max) => {
    PlanPolicy.assertWithinLimit(plan, resource, max - 1);
    const error = refusal(() => PlanPolicy.assertWithinLimit(plan, resource, max));
    expect(error.status).toBe(403);
    expect(error.message).toContain(`(${max})`);
  });

  it('повідомлення про сайти звернене до користувача, про товари й категорії — до тарифу власника сайту', () => {
    expect(refusal(() => PlanPolicy.assertWithinLimit('FREE', 'sites', 3)).message).toBe('Ви досягли ліміту сайтів (3) на вашому тарифі.');
    expect(refusal(() => PlanPolicy.assertWithinLimit('FREE', 'products', 50)).message).toBe('Досягнуто ліміту товарів (50) на тарифі власника сайту.');
    expect(refusal(() => PlanPolicy.assertWithinLimit('FREE', 'categories', 20)).message).toBe('Досягнуто ліміту категорій (20) на тарифі власника сайту.');
  });

  it('кількість, більша за ліміт, теж відхиляється', () => {
    expect(refusal(() => PlanPolicy.assertWithinLimit('FREE', 'sites', 10)).status).toBe(403);
  });

  it('ADMIN без обмежень', () => {
    PlanPolicy.assertWithinLimit('ADMIN', 'sites', 5000);
    PlanPolicy.assertWithinLimit('ADMIN', 'products', 5000);
    PlanPolicy.assertWithinLimit('ADMIN', 'categories', 5000);
  });

  it.each([[undefined], [null], ['UNKNOWN']])('невідомий тариф %j обмежується як FREE', (plan) => {
    PlanPolicy.assertWithinLimit(plan, 'sites', 2);
    expect(refusal(() => PlanPolicy.assertWithinLimit(plan, 'sites', 3)).status).toBe(403);
  });

  it('кількість з БД може прийти рядком', () => {
    PlanPolicy.assertWithinLimit('FREE', 'sites', '2');
    expect(refusal(() => PlanPolicy.assertWithinLimit('FREE', 'sites', '3')).status).toBe(403);
  });
});

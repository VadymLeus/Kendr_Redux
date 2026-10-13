// backend/tests/unit/PaymentService.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const PaymentService = require('../../services/PaymentService');
const LiqPayService = require('../../services/LiqPayService');
const { ServiceError } = require('../../services/ServiceError');

const encode = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64');

function failure(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Очікувалася помилка');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('decodeCallback', () => {
  it('розбирає base64 від JSON-об\'єкта', () => {
    expect(PaymentService.decodeCallback(encode({ order_id: 'A_1', status: 'success' }))).toEqual({ order_id: 'A_1', status: 'success' });
  });

  it.each([
    ['не JSON', encode('не json')],
    ['масив', encode('[]')],
    ['null', encode('null')],
    ['рядок', encode('"abc"')],
    ['число', encode('123')],
    ['undefined', undefined],
    ['об\'єкт замість рядка', {}],
    ['число замість рядка', 5],
  ])('%s — ServiceError 400', (_title, data) => {
    const error = failure(() => PaymentService.decodeCallback(data));
    expect(error).toBeInstanceOf(ServiceError);
    expect([error.status, error.message]).toEqual([400, 'Invalid payload']);
  });
});

describe('referenceOf', () => {
  it.each([
    ['ORD1_1700000000', 'ORD1'],
    ['ORD1', 'ORD1'],
    ['3f2b8c1e-aaaa-bbbb-cccc-1234567890ab', '3f2b8c1e-aaaa-bbbb-cccc-1234567890ab'],
  ])('%s → %s', (orderId, expected) => {
    expect(PaymentService.referenceOf({ order_id: orderId })).toBe(expected);
  });

  it.each([[{}], [{ order_id: '' }], [{ order_id: '_1700' }], [{ order_id: 123 }], [{ order_id: null }]])('%j — ServiceError 400', (payload) => {
    const error = failure(() => PaymentService.referenceOf(payload));
    expect(error).toBeInstanceOf(ServiceError);
    expect([error.status, error.message]).toEqual([400, 'Invalid payload']);
  });
});

describe('verifySignature', () => {
  const data = encode({ order_id: 'A_1' });

  it('приймає підпис, обчислений приватним ключем', () => {
    expect(PaymentService.verifySignature(data, LiqPayService.sign(data, 'key'), 'key')).toBe(true);
  });

  it.each([
    ['інший ключ', LiqPayService.sign(encode({ order_id: 'A_1' }), 'other')],
    ['інші дані', LiqPayService.sign(encode({ order_id: 'B_1' }), 'key')],
    ['інша довжина', 'short'],
    ['порожній підпис', ''],
  ])('відхиляє підпис: %s', (_title, signature) => {
    expect(PaymentService.verifySignature(data, signature, 'key')).toBe(false);
  });

  it.each([
    ['дані не рядок', [{ a: 1 }, 'sig', 'key']],
    ['підпис не рядок', [data, undefined, 'key']],
    ['ключа немає', [data, LiqPayService.sign(data, 'undefined'), undefined]],
    ['ключ порожній', [data, LiqPayService.sign(data, ''), '']],
  ])('відхиляє, якщо %s', (_title, args) => {
    expect(PaymentService.verifySignature(...args)).toBe(false);
  });

  it('порівнює підписи функцією сталого часу, а для різної довжини не викликає її', () => {
    const compare = vi.spyOn(crypto, 'timingSafeEqual');
    PaymentService.verifySignature(data, LiqPayService.sign(data, 'key'), 'key');
    expect(compare).toHaveBeenCalledTimes(1);
    PaymentService.verifySignature(data, 'short', 'key');
    expect(compare).toHaveBeenCalledTimes(1);
  });
});

describe('isPaidStatus', () => {
  it.each([['success'], ['wait_accept']])('%s — оплата', (status) => {
    expect(PaymentService.isPaidStatus(status)).toBe(true);
  });

  it.each([['failure'], ['error'], ['reversed'], ['processing'], [undefined], [null], [1]])('%s — не оплата', (status) => {
    expect(PaymentService.isPaidStatus(status)).toBe(false);
  });

  it('D-CFG-01: sandbox — оплата лише при LIQPAY_SANDBOX=1', () => {
    expect(PaymentService.isPaidStatus('sandbox')).toBe(false);
    vi.stubEnv('LIQPAY_SANDBOX', '1');
    expect(PaymentService.isPaidStatus('sandbox')).toBe(true);
  });
});

describe('assertPaymentMatches', () => {
  const expected = { amount: '100.00', currency: 'UAH' };

  it.each([
    [{ amount: 100, currency: 'UAH' }],
    [{ amount: '100', currency: 'UAH' }],
    [{ amount: '100.00', currency: 'UAH' }],
    [{ amount: 100.0, currency: 'uah' }],
  ])('%j збігається', (payload) => {
    expect(() => PaymentService.assertPaymentMatches(payload, expected)).not.toThrow();
  });

  it.each([
    [{ amount: 99.99, currency: 'UAH' }],
    [{ amount: 100.01, currency: 'UAH' }],
    [{ amount: 100, currency: 'USD' }],
    [{ amount: 100 }],
    [{ currency: 'UAH' }],
    [{ amount: 'сто', currency: 'UAH' }],
    [{ amount: '', currency: 'UAH' }],
    [{ amount: null, currency: 'UAH' }],
    [{ amount: true, currency: 'UAH' }],
    [{ amount: 100, currency: 980 }],
    [{ amount: Infinity, currency: 'UAH' }],
  ])('%j відхиляється', (payload) => {
    const error = failure(() => PaymentService.assertPaymentMatches(payload, expected));
    expect(error).toBeInstanceOf(ServiceError);
    expect([error.status, error.message]).toEqual([400, 'Amount or currency mismatch']);
  });

  it('копійки порівнюються без похибки плаваючої коми', () => {
    expect(() => PaymentService.assertPaymentMatches({ amount: 0.29, currency: 'UAH' }, { amount: '0.29' })).not.toThrow();
    expect(() => PaymentService.assertPaymentMatches({ amount: 1.1, currency: 'UAH' }, { amount: 1.1 })).not.toThrow();
  });

  it('очікувана сума, яку не вдалося прочитати, ніколи не збігається', () => {
    const error = failure(() => PaymentService.assertPaymentMatches({ amount: 0, currency: 'UAH' }, { amount: undefined }));
    expect(error.status).toBe(400);
  });

  it('валюта за замовчуванням — UAH', () => {
    expect(() => PaymentService.assertPaymentMatches({ amount: 5, currency: 'UAH' }, { amount: 5 })).not.toThrow();
  });
});

describe('verifyGooglePay', () => {
  it('D-SEC-01, D-SEC-02: без серверної перевірки токена платіж не підтверджується — 501', async () => {
    await expect(PaymentService.verifyGooglePay({ token: 'x' }, { amount: 1, currency: 'UAH', reference: 'A' })).rejects.toMatchObject({
      name: 'ServiceError',
      status: 501,
      message: 'Оплата через Google Pay тимчасово недоступна: платіж не можна підтвердити на сервері.',
    });
  });
});

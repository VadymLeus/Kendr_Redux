// backend/tests/unit/LiqPayService.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const LiqPayService = require('../../services/LiqPayService');

const decode = (data) => JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
const KEYS = ['BACKEND_URL', 'FRONTEND_URL', 'NGROK_URL'];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('LiqPayService.sign', () => {
  it('sha1(private + data + private) у base64', () => {
    const expected = crypto.createHash('sha1').update('k' + 'payload' + 'k').digest('base64');
    expect(LiqPayService.sign('payload', 'k')).toBe(expected);
  });

  it('залежить від приватного ключа й даних', () => {
    expect(LiqPayService.sign('a', 'k1')).not.toBe(LiqPayService.sign('a', 'k2'));
    expect(LiqPayService.sign('a', 'k1')).not.toBe(LiqPayService.sign('b', 'k1'));
  });
});

describe('LiqPayService.createPayment', () => {
  it('формує параметри платежу й підписує їх приватним ключем продавця', () => {
    process.env.BACKEND_URL = 'http://backend.test';
    process.env.FRONTEND_URL = 'http://front.test';
    delete process.env.NGROK_URL;

    const { data, signature } = LiqPayService.createPayment('ORD123', 250, 'pub', 'priv');
    const params = decode(data);

    expect(params).toMatchObject({
      public_key: 'pub', version: '3', action: 'pay', amount: 250, currency: 'UAH', sandbox: 1,
      description: 'Замовлення #ORD123 на суму 250 UAH',
      server_url: 'http://backend.test/api/orders/liqpay-callback',
      result_url: 'http://front.test/my-orders',
    });
    expect(params.order_id).toMatch(/^ORD123_\d+$/);
    expect(signature).toBe(LiqPayService.sign(data, 'priv'));
  });

  it('NGROK_URL має пріоритет для адреси зворотного виклику', () => {
    process.env.NGROK_URL = 'https://tunnel.test';
    const { data } = LiqPayService.createPayment('ORD1', 1, 'pub', 'priv');
    expect(decode(data).server_url).toBe('https://tunnel.test/api/orders/liqpay-callback');
  });

  it('без змінних середовища використовує адреси за замовчуванням', () => {
    delete process.env.BACKEND_URL;
    delete process.env.FRONTEND_URL;
    delete process.env.NGROK_URL;
    const params = decode(LiqPayService.createPayment('ORD1', 1, 'pub', 'priv').data);
    expect(params.server_url).toBe('http://localhost:5000/api/orders/liqpay-callback');
    expect(params.result_url).toBe('http://localhost:5173/my-orders');
  });

  it('платіж завжди створюється в режимі sandbox', () => {
    expect(decode(LiqPayService.createPayment('ORD1', 1, 'pub', 'priv').data).sandbox).toBe(1);
  });
});

// backend/tests/unit/LiqPayService.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const LiqPayService = require('../../services/LiqPayService');

const decode = (data) => JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
const KEYS = ['BACKEND_URL', 'FRONTEND_URL', 'NGROK_URL', 'LIQPAY_SANDBOX'];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  delete process.env.LIQPAY_SANDBOX;
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
      public_key: 'pub', version: '3', action: 'pay', amount: 250, currency: 'UAH',
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

  it('D-CFG-01: без LIQPAY_SANDBOX параметра sandbox немає', () => {
    expect(decode(LiqPayService.createPayment('ORD1', 1, 'pub', 'priv').data)).not.toHaveProperty('sandbox');
  });

  it.each([['1'], ['true'], ['TRUE'], [' 1 ']])('D-CFG-01: LIQPAY_SANDBOX=%j додає sandbox: 1', (value) => {
    process.env.LIQPAY_SANDBOX = value;
    expect(decode(LiqPayService.createPayment('ORD1', 1, 'pub', 'priv').data).sandbox).toBe(1);
  });

  it.each([[''], ['0'], ['false'], ['yes']])('D-CFG-01: LIQPAY_SANDBOX=%j тестовий режим не вмикає', (value) => {
    process.env.LIQPAY_SANDBOX = value;
    expect(LiqPayService.isSandbox()).toBe(false);
    expect(decode(LiqPayService.createPayment('ORD1', 1, 'pub', 'priv').data)).not.toHaveProperty('sandbox');
  });
});

describe('LiqPayService.createUpgradePayment', () => {
  it('формує платіж за тариф: ідентифікатор транзакції як order_id, адреса зворотного виклику транзакцій', () => {
    process.env.BACKEND_URL = 'http://backend.test';
    process.env.FRONTEND_URL = 'http://front.test';
    delete process.env.NGROK_URL;

    const { data, signature } = LiqPayService.createUpgradePayment('tx-1', 299, 'Опис', 'pub', 'priv');
    expect(decode(data)).toEqual({
      public_key: 'pub', version: '3', action: 'pay', amount: 299, currency: 'UAH', description: 'Опис',
      order_id: 'tx-1', server_url: 'http://backend.test/api/transactions/liqpay-callback', result_url: 'http://front.test/settings',
    });
    expect(signature).toBe(LiqPayService.sign(data, 'priv'));
  });

  it('NGROK_URL має пріоритет, sandbox додається лише за LIQPAY_SANDBOX=1', () => {
    process.env.NGROK_URL = 'https://tunnel.test';
    process.env.LIQPAY_SANDBOX = '1';
    const params = decode(LiqPayService.createUpgradePayment('tx-1', 299, 'Опис', 'pub', 'priv').data);
    expect(params.server_url).toBe('https://tunnel.test/api/transactions/liqpay-callback');
    expect(params.sandbox).toBe(1);
  });
});

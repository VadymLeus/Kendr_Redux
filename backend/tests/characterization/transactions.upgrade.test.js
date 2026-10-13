// Тариф PLUS: transactionController (POST /api/transactions/upgrade, /upgrade/gpay, /liqpay-callback).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app, paymentService, ServiceError } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { decodeLiqpay, signLiqpay, postLiqpay } from '../helpers/liqpay.js';
import { createUser, getUser, getTransactions } from '../helpers/factories.js';

useTestDatabase();

const WEBHOOK_URL = '/api/transactions/liqpay-callback';
const platformKey = () => process.env.LIQPAY_PRIVATE_KEY;

let user;

beforeEach(async () => {
  user = await createUser({ plan: 'FREE' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const paid = (transaction, overrides = {}) => ({
  order_id: transaction.id, status: 'success', amount: 299, currency: 'UAH', payment_id: 777, ...overrides,
});

describe('POST /api/transactions/upgrade (оплата через LiqPay)', () => {
  const upgrade = (u) => request(app).post('/api/transactions/upgrade').set(authHeader(u)).send({});

  it('без токена — 401', async () => {
    const res = await request(app).post('/api/transactions/upgrade').send({});
    expect(res.status).toBe(401);
  });

  it('створює транзакцію pending і повертає підписані дані платежу; тариф ще не змінюється', async () => {
    const res = await upgrade(user);
    expect(res.status).toBe(200);
    expect(res.body.signature).toBe(signLiqpay(res.body.data, platformKey()));

    const [transaction] = await getTransactions();
    expect(transaction).toMatchObject({ user_id: user.id, status: 'pending', currency: 'UAH' });
    expect(Number(transaction.amount)).toBe(299);

    const payment = decodeLiqpay(res.body.data);
    expect(payment).toMatchObject({ order_id: transaction.id, amount: 299, currency: 'UAH' });
    expect(payment).not.toHaveProperty('sandbox');
    expect((await getUser(user.id)).plan).toBe('FREE');
  });

  it('D-CFG-01: параметр sandbox додається, лише коли LIQPAY_SANDBOX=1', async () => {
    vi.stubEnv('LIQPAY_SANDBOX', '1');
    const res = await upgrade(user);
    expect(res.status).toBe(200);
    expect(decodeLiqpay(res.body.data).sandbox).toBe(1);
  });

  it('для користувача з тарифом PLUS — 400', async () => {
    const plus = await createUser({ plan: 'PLUS' });
    const res = await upgrade(plus);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('У вас вже активовано преміум тариф.');
  });
});

describe('POST /api/transactions/liqpay-callback', () => {
  const pendingTransaction = async () => {
    await request(app).post('/api/transactions/upgrade').set(authHeader(user)).send({});
    const [transaction] = await getTransactions();
    return transaction;
  };

  it('без data або signature — 400', async () => {
    const res = await request(app).post(WEBHOOK_URL).send({});
    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing data or signature');
  });

  it('із невірним підписом — 403, тариф не змінюється', async () => {
    const transaction = await pendingTransaction();
    const res = await postLiqpay(app, WEBHOOK_URL, paid(transaction), 'wrong-key');
    expect(res.status).toBe(403);
    expect((await getUser(user.id)).plan).toBe('FREE');
  });

  it('без приватного ключа платформи callback не приймається — 500, тариф не змінюється', async () => {
    const transaction = await pendingTransaction();
    vi.stubEnv('LIQPAY_PRIVATE_KEY', '');
    const res = await postLiqpay(app, WEBHOOK_URL, paid(transaction), '');
    expect(res.status).toBe(500);
    expect((await getUser(user.id)).plan).toBe('FREE');
  });

  it('підписаний callback зі статусом success активує PLUS і закриває транзакцію', async () => {
    const transaction = await pendingTransaction();
    const res = await postLiqpay(app, WEBHOOK_URL, paid(transaction), platformKey());
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect((await getUser(user.id)).plan).toBe('PLUS');
    const [updated] = await getTransactions();
    expect(updated).toMatchObject({ status: 'success', provider_id: '777' });
  });

  it('D-CFG-01: статус sandbox при вимкненому тестовому режимі не активує PLUS', async () => {
    const transaction = await pendingTransaction();
    const res = await postLiqpay(app, WEBHOOK_URL, paid(transaction, { status: 'sandbox' }), platformKey());
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).plan).toBe('FREE');
    expect((await getTransactions())[0].status).toBe('pending');
  });

  it('D-CFG-01: статус sandbox активує PLUS, коли LIQPAY_SANDBOX=1', async () => {
    vi.stubEnv('LIQPAY_SANDBOX', '1');
    const transaction = await pendingTransaction();
    const res = await postLiqpay(app, WEBHOOK_URL, paid(transaction, { status: 'sandbox' }), platformKey());
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).plan).toBe('PLUS');
    expect((await getTransactions())[0]).toMatchObject({ status: 'success', provider_id: '777' });
  });

  it('статус failure тариф не змінює', async () => {
    const transaction = await pendingTransaction();
    const res = await postLiqpay(app, WEBHOOK_URL, paid(transaction, { status: 'failure' }), platformKey());
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).plan).toBe('FREE');
    expect((await getTransactions())[0].status).toBe('pending');
  });

  it.each([
    ['сумою', { amount: 1 }],
    ['валютою', { currency: 'USD' }],
    ['сумою й валютою', { amount: 1, currency: 'USD' }],
    ['без суми', { amount: undefined }],
    ['без валюти', { currency: undefined }],
  ])('D-SEC-07: підписаний callback %s відхиляється — 400, тариф не змінюється', async (_title, overrides) => {
    const transaction = await pendingTransaction();
    const res = await postLiqpay(app, WEBHOOK_URL, paid(transaction, overrides), platformKey());
    expect(res.status).toBe(400);
    expect(res.text).toBe('Amount or currency mismatch');
    expect((await getUser(user.id)).plan).toBe('FREE');
    expect((await getTransactions())[0]).toMatchObject({ status: 'pending', provider_id: null });
  });

  it('повторний callback нічого не змінює', async () => {
    const transaction = await pendingTransaction();
    await postLiqpay(app, WEBHOOK_URL, paid(transaction), platformKey());
    const again = await postLiqpay(app, WEBHOOK_URL, paid(transaction, { payment_id: 888 }), platformKey());
    expect(again.status).toBe(200);
    expect((await getTransactions())[0]).toMatchObject({ status: 'success', provider_id: '777' });
  });

  it('callback для невідомої транзакції — 200, нічого не змінюється', async () => {
    const res = await postLiqpay(app, WEBHOOK_URL, paid({ id: 'unknown-transaction' }), platformKey());
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).plan).toBe('FREE');
  });

  it('пошкоджені дані — 400', async () => {
    const data = Buffer.from('не json').toString('base64');
    const res = await request(app).post(WEBHOOK_URL).type('form').send({ data, signature: signLiqpay(data, platformKey()) });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid payload');
  });
});

describe('POST /api/transactions/upgrade/gpay', () => {
  const gpayUpgrade = (u, body = {}) => request(app).post('/api/transactions/upgrade/gpay').set(authHeader(u)).send(body);
  const UNAVAILABLE = 'Оплата через Google Pay тимчасово недоступна: платіж не можна підтвердити на сервері.';

  it('без токена — 401', async () => {
    const res = await request(app).post('/api/transactions/upgrade/gpay').send({});
    expect(res.status).toBe(401);
  });

  it('D-SEC-01: порожній paymentData — 501, тариф не змінюється, транзакцій немає', async () => {
    const res = await gpayUpgrade(user, {});
    expect(res.status).toBe(501);
    expect(res.body.message).toBe(UNAVAILABLE);
    expect((await getUser(user.id)).plan).toBe('FREE');
    expect(await getTransactions()).toHaveLength(0);
  });

  it('D-SEC-01: довільний рядок замість токена Google Pay не приймається', async () => {
    const token = 'forged-token-forged-token-forged';
    const res = await gpayUpgrade(user, { paymentData: { paymentMethodData: { tokenizationData: { token } } } });
    expect(res.status).toBe(501);
    expect((await getUser(user.id)).plan).toBe('FREE');
    expect(await getTransactions()).toHaveLength(0);
  });

  it('для користувача з тарифом PLUS — 400, платіж не перевіряється', async () => {
    const verify = vi.spyOn(paymentService, 'verifyGooglePay');
    const plus = await createUser({ plan: 'PLUS' });
    const res = await gpayUpgrade(plus, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('У вас вже активовано преміум тариф.');
    expect(verify).not.toHaveBeenCalled();
  });

  describe('коли сервер підтвердив платіж', () => {
    let verify;
    const paymentData = { paymentMethodData: { tokenizationData: { token: 'token-from-gateway' } } };

    beforeEach(() => {
      verify = vi.spyOn(paymentService, 'verifyGooglePay').mockResolvedValue({ providerId: 'gpay_verified_1' });
    });

    it('користувач отримує PLUS, транзакція записується з ідентифікатором постачальника', async () => {
      const res = await gpayUpgrade(user, { paymentData });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Тариф Kendr PLUS успішно активовано!' });
      expect((await getUser(user.id)).plan).toBe('PLUS');

      expect(verify).toHaveBeenCalledWith(paymentData, { amount: 299, currency: 'UAH', reference: `plan:${user.id}` });
      const [transaction] = await getTransactions();
      expect(transaction).toMatchObject({ user_id: user.id, status: 'success', currency: 'UAH', provider_id: 'gpay_verified_1' });
      expect(Number(transaction.amount)).toBe(299);
    });

    it('повторний виклик — 400, нова транзакція не створюється', async () => {
      await gpayUpgrade(user, { paymentData });
      const res = await gpayUpgrade(user, { paymentData });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('У вас вже активовано преміум тариф.');
      expect(await getTransactions()).toHaveLength(1);
      expect(verify).toHaveBeenCalledTimes(1);
    });

    it('відмова перевірки лишає тариф без змін', async () => {
      verify.mockRejectedValue(new ServiceError(402, 'Платіж відхилено шлюзом'));
      const res = await gpayUpgrade(user, { paymentData });
      expect(res.status).toBe(402);
      expect(res.body.message).toBe('Платіж відхилено шлюзом');
      expect((await getUser(user.id)).plan).toBe('FREE');
      expect(await getTransactions()).toHaveLength(0);
    });
  });
});

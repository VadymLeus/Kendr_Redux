// Тариф PLUS: transactionController (POST /api/transactions/upgrade, /upgrade/gpay, /liqpay-callback).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
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
    expect(payment).toMatchObject({ order_id: transaction.id, amount: 299, currency: 'UAH', sandbox: 1 });
    expect((await getUser(user.id)).plan).toBe('FREE');
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
    const res = await postLiqpay(app, WEBHOOK_URL, { order_id: transaction.id, status: 'success' }, 'wrong-key');
    expect(res.status).toBe(403);
    expect((await getUser(user.id)).plan).toBe('FREE');
  });

  // KNOWN-DEFECT D-CFG-01: статус sandbox приймається як успішна оплата.
  it('підписаний callback зі статусом sandbox активує PLUS і закриває транзакцію', async () => {
    const transaction = await pendingTransaction();
    const res = await postLiqpay(app, WEBHOOK_URL, { order_id: transaction.id, status: 'sandbox', payment_id: 777 }, platformKey());
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).plan).toBe('PLUS');
    const [updated] = await getTransactions();
    expect(updated).toMatchObject({ status: 'success', provider_id: '777' });
  });

  it('статус failure тариф не змінює', async () => {
    const transaction = await pendingTransaction();
    const res = await postLiqpay(app, WEBHOOK_URL, { order_id: transaction.id, status: 'failure' }, platformKey());
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).plan).toBe('FREE');
    expect((await getTransactions())[0].status).toBe('pending');
  });

  // KNOWN-DEFECT D-SEC-07: сума й валюта з callback не порівнюються з тарифом (299 UAH).
  it('KNOWN-DEFECT D-SEC-07: підписаний callback з іншою сумою теж активує PLUS', async () => {
    const transaction = await pendingTransaction();
    const res = await postLiqpay(
      app, WEBHOOK_URL,
      { order_id: transaction.id, status: 'success', amount: 1, currency: 'USD', payment_id: 1 },
      platformKey()
    );
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).plan).toBe('PLUS');
  });
});

describe('POST /api/transactions/upgrade/gpay', () => {
  const gpayUpgrade = (u, body = {}) => request(app).post('/api/transactions/upgrade/gpay').set(authHeader(u)).send(body);

  it('без токена — 401', async () => {
    const res = await request(app).post('/api/transactions/upgrade/gpay').send({});
    expect(res.status).toBe(401);
  });

  // KNOWN-DEFECT D-SEC-01: paymentData не перевіряється, платіжний шлюз не викликається.
  it('KNOWN-DEFECT D-SEC-01: користувач отримує PLUS без оплати (порожній paymentData)', async () => {
    const res = await gpayUpgrade(user, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Тариф Kendr PLUS успішно активовано!' });
    expect((await getUser(user.id)).plan).toBe('PLUS');

    const [transaction] = await getTransactions();
    expect(transaction).toMatchObject({ user_id: user.id, status: 'success', currency: 'UAH' });
    expect(Number(transaction.amount)).toBe(299);
    expect(transaction.provider_id.startsWith('gpay_test_')).toBe(true);
  });

  it('KNOWN-DEFECT D-SEC-01: довільний рядок замість токена Google Pay приймається', async () => {
    const token = 'forged-token-forged-token-forged';
    const res = await gpayUpgrade(user, { paymentData: { paymentMethodData: { tokenizationData: { token } } } });
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).plan).toBe('PLUS');
    const [transaction] = await getTransactions();
    expect(transaction.provider_id).toBe(`gpay_${token.substring(0, 20)}`);
  });

  it('повторний виклик — 400, нова транзакція не створюється', async () => {
    await gpayUpgrade(user, {});
    const res = await gpayUpgrade(user, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('У вас вже активовано преміум тариф.');
    expect(await getTransactions()).toHaveLength(1);
  });
});

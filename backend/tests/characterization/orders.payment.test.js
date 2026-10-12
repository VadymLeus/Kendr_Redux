// Підтвердження оплати замовлення: liqpayCallback (POST /api/orders/liqpay-callback)
// і processGooglePay (POST /api/orders/:orderId/pay/gpay). Платіжний шлюз емулюється підписом LiqPay;
// листи цифрових товарів перехоплюються (emailService.sendDigitalGoodsEmail).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app, emailService } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { postLiqpay, liqpayOrderId } from '../helpers/liqpay.js';
import {
  createUser, createSite, createProduct, createOrder, getOrder, getTransactions,
} from '../helpers/factories.js';

useTestDatabase();

const LIQPAY = { publicKey: 'sandbox_i1234567890', privateKey: 'site-private-secret' };
const FILE_URL = 'https://files.test/book.pdf';
const CALLBACK_URL = '/api/orders/liqpay-callback';

let seller, buyer, site, physical, digital, emailSpy;

beforeEach(async () => {
  emailSpy = vi.spyOn(emailService, 'sendDigitalGoodsEmail').mockResolvedValue(undefined);
  seller = await createUser({ plan: 'PLUS' });
  buyer = await createUser();
  site = await createSite(seller, { liqpay: LIQPAY });
  physical = await createProduct(site, { price: 100, stock_quantity: 10 });
  digital = await createProduct(site, { type: 'digital', price: 50, digital_file_url: FILE_URL });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const physicalOrder = (overrides) => createOrder(site, buyer, { items: [{ product: physical, quantity: 1 }], ...overrides });
const digitalOrder = (overrides) => createOrder(site, buyer, { items: [{ product: digital, quantity: 1 }], delivery_address: 'Цифрова доставка', ...overrides });

describe('POST /api/orders/liqpay-callback', () => {
  it('без data або signature — 400', async () => {
    const res = await request(app).post(CALLBACK_URL).send({});
    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing data or signature');
  });

  it('для невідомого замовлення — 404 (підпис ще не перевіряється)', async () => {
    const res = await postLiqpay(app, CALLBACK_URL, { order_id: 'unknown_1', status: 'success' }, 'any-key');
    expect(res.status).toBe(404);
    expect(res.text).toBe('Order not found');
  });

  it('якщо в магазину немає ключа LiqPay — 400', async () => {
    const noKeys = await createSite(seller);
    const item = await createProduct(noKeys);
    const order = await createOrder(noKeys, buyer, { items: [{ product: item, quantity: 1 }] });
    const res = await postLiqpay(app, CALLBACK_URL, { order_id: liqpayOrderId(order.id), status: 'success' }, 'any-key');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Private key missing for site');
  });

  it('із невірним підписом — 403, статус замовлення не змінюється', async () => {
    const order = await physicalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, { order_id: liqpayOrderId(order.id), status: 'success' }, 'wrong-key');
    expect(res.status).toBe(403);
    expect(res.text).toBe('Invalid signature');
    expect((await getOrder(order.id)).status).toBe('pending');
  });

  // KNOWN-DEFECT D-CFG-01: статус sandbox (тестовий режим шлюзу) приймається як успішна оплата.
  it.each(['success', 'wait_accept', 'sandbox'])('статус шлюзу "%s" переводить замовлення в paid', async (status) => {
    const order = await physicalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, { order_id: liqpayOrderId(order.id), status }, LIQPAY.privateKey);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect((await getOrder(order.id)).status).toBe('paid');
    expect(emailSpy).not.toHaveBeenCalled();
  });

  it.each(['failure', 'error', 'reversed'])('статус шлюзу "%s" лишає замовлення в pending', async (status) => {
    const order = await physicalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, { order_id: liqpayOrderId(order.id), status }, LIQPAY.privateKey);
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('pending');
  });

  it('замовлення лише з цифрових товарів стає completed, посилання надсилається на пошту покупця', async () => {
    const order = await digitalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, { order_id: liqpayOrderId(order.id), status: 'success' }, LIQPAY.privateKey);
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('completed');
    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(emailSpy).toHaveBeenCalledWith(
      buyer.email,
      buyer.username,
      [expect.objectContaining({ product_name: digital.name, digital_file_url: FILE_URL })],
      'orange'
    );
  });

  it('повторний callback не змінює статус і не надсилає лист удруге', async () => {
    const order = await digitalOrder();
    const payload = { order_id: liqpayOrderId(order.id), status: 'success' };
    await postLiqpay(app, CALLBACK_URL, payload, LIQPAY.privateKey);
    const again = await postLiqpay(app, CALLBACK_URL, payload, LIQPAY.privateKey);
    expect(again.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('completed');
    expect(emailSpy).toHaveBeenCalledTimes(1);
  });

  // KNOWN-DEFECT D-SEC-07: сума й валюта з callback не порівнюються із замовленням.
  it('KNOWN-DEFECT D-SEC-07: підписаний callback з іншою сумою й валютою теж позначає замовлення оплаченим', async () => {
    const order = await physicalOrder(); // сума замовлення — 100 UAH
    const res = await postLiqpay(
      app, CALLBACK_URL,
      { order_id: liqpayOrderId(order.id), status: 'success', amount: 0.01, currency: 'USD' },
      LIQPAY.privateKey
    );
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('paid');
  });
});

describe('POST /api/orders/:orderId/pay/gpay', () => {
  const gpay = (user, orderId, body = {}) =>
    request(app).post(`/api/orders/${orderId}/pay/gpay`).set(authHeader(user)).send(body);

  it('без токена — 401', async () => {
    const order = await physicalOrder();
    const res = await request(app).post(`/api/orders/${order.id}/pay/gpay`).send({});
    expect(res.status).toBe(401);
  });

  it('для неіснуючого замовлення — 404', async () => {
    const res = await gpay(buyer, 'no-such-order');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Замовлення не знайдено');
  });

  it('чуже замовлення — 403', async () => {
    const stranger = await createUser();
    const order = await physicalOrder();
    const res = await gpay(stranger, order.id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено');
    expect((await getOrder(order.id)).status).toBe('pending');
  });

  it.each(['paid', 'completed'])('замовлення зі статусом "%s" вдруге не оплачується — 400', async (status) => {
    const order = await physicalOrder({ status });
    const res = await gpay(buyer, order.id);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Замовлення вже оплачено');
  });

  // KNOWN-DEFECT D-SEC-02: paymentData не перевіряється, звернення до платіжного шлюзу немає.
  it('KNOWN-DEFECT D-SEC-02: покупець позначає замовлення оплаченим з порожнім paymentData', async () => {
    const order = await physicalOrder();
    const res = await gpay(buyer, order.id, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Оплату успішно проведено' });
    expect((await getOrder(order.id)).status).toBe('paid');
  });

  it('KNOWN-DEFECT D-SEC-02: власнику сайту записується «успішна» транзакція, провайдер — gpay_test_', async () => {
    const order = await physicalOrder();
    await gpay(buyer, order.id, {});
    const transactions = await getTransactions();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      user_id: seller.id, currency: 'UAH', status: 'success', description: `Оплата замовлення #${order.id} через Google Pay`,
    });
    expect(Number(transactions[0].amount)).toBe(100);
    expect(transactions[0].provider_id.startsWith('gpay_test_')).toBe(true);
  });

  it('KNOWN-DEFECT D-SEC-02: довільний рядок замість токена Google Pay приймається', async () => {
    const token = 'forged-token-forged-token-forged';
    const order = await physicalOrder();
    const res = await gpay(buyer, order.id, { paymentData: { paymentMethodData: { tokenizationData: { token } } } });
    expect(res.status).toBe(200);
    const [transaction] = await getTransactions();
    expect(transaction.provider_id).toBe(`gpay_${token.substring(0, 20)}`);
  });

  it('KNOWN-DEFECT D-SEC-02: цифровий товар видається без оплати — замовлення completed, посилання йде на пошту', async () => {
    const order = await digitalOrder();
    const res = await gpay(buyer, order.id, {});
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('completed');
    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(emailSpy).toHaveBeenCalledWith(
      buyer.email,
      buyer.username,
      [expect.objectContaining({ digital_file_url: FILE_URL })],
      'orange'
    );
  });

  // KNOWN-DEFECT D-BIZ-08: блокуються лише статуси paid і completed; тип оплати не перевіряється.
  it.each([
    ['скасоване замовлення', { status: 'cancelled' }],
    ['відправлене замовлення', { status: 'shipped' }],
    ['замовлення з післяплатою', { payment_method: 'cod' }],
  ])('KNOWN-DEFECT D-BIZ-08: %s теж можна «оплатити»', async (_title, overrides) => {
    const order = await physicalOrder(overrides);
    const res = await gpay(buyer, order.id, {});
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('paid');
  });
});

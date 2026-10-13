// Підтвердження оплати замовлення: liqpayCallback (POST /api/orders/liqpay-callback)
// і processGooglePay (POST /api/orders/:orderId/pay/gpay). Платіжний шлюз емулюється підписом LiqPay;
// листи цифрових товарів перехоплюються (emailService.sendDigitalGoodsEmail).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app, emailService, paymentService, ServiceError } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { postLiqpay, liqpayOrderId, paidCallback } from '../helpers/liqpay.js';
import {
  createUser, createSite, createProduct, createOrder, getOrder, getProduct, getTransactions,
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
  vi.unstubAllEnvs();
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

  it.each(['success', 'wait_accept'])('статус шлюзу "%s" переводить замовлення в paid', async (status) => {
    const order = await physicalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, paidCallback(order, { status }), LIQPAY.privateKey);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect((await getOrder(order.id)).status).toBe('paid');
    expect(emailSpy).not.toHaveBeenCalled();
  });

  it('D-CFG-01: статус sandbox при вимкненому тестовому режимі не оплачує замовлення', async () => {
    const order = await physicalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, paidCallback(order, { status: 'sandbox' }), LIQPAY.privateKey);
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('pending');
    expect((await getProduct(physical.id)).stock_quantity).toBe(10);
  });

  it('D-CFG-01: статус sandbox приймається, коли LIQPAY_SANDBOX=1', async () => {
    vi.stubEnv('LIQPAY_SANDBOX', '1');
    const order = await physicalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, paidCallback(order, { status: 'sandbox' }), LIQPAY.privateKey);
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('paid');
  });

  it.each(['failure', 'error', 'reversed'])('статус шлюзу "%s" лишає замовлення в pending', async (status) => {
    const order = await physicalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, { order_id: liqpayOrderId(order.id), status }, LIQPAY.privateKey);
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('pending');
  });

  it('замовлення лише з цифрових товарів стає completed, посилання надсилається на пошту покупця', async () => {
    const order = await digitalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, paidCallback(order), LIQPAY.privateKey);
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
    const payload = paidCallback(order);
    await postLiqpay(app, CALLBACK_URL, payload, LIQPAY.privateKey);
    const again = await postLiqpay(app, CALLBACK_URL, payload, LIQPAY.privateKey);
    expect(again.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('completed');
    expect(emailSpy).toHaveBeenCalledTimes(1);
  });

  it('повторний callback не списує залишок удруге', async () => {
    const order = await physicalOrder();
    await postLiqpay(app, CALLBACK_URL, paidCallback(order), LIQPAY.privateKey);
    await postLiqpay(app, CALLBACK_URL, paidCallback(order), LIQPAY.privateKey);
    expect((await getProduct(physical.id)).stock_quantity).toBe(9);
  });

  it('два одночасні callback обробляються один раз: залишок і лист не дублюються', async () => {
    const order = await createOrder(site, buyer, {
      items: [{ product: physical, quantity: 1 }, { product: digital, quantity: 1 }],
    });
    const responses = await Promise.all([
      postLiqpay(app, CALLBACK_URL, paidCallback(order), LIQPAY.privateKey),
      postLiqpay(app, CALLBACK_URL, paidCallback(order), LIQPAY.privateKey),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await getOrder(order.id)).status).toBe('paid');
    expect((await getProduct(physical.id)).stock_quantity).toBe(9);
    expect(emailSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['сумою', { amount: 0.01 }],
    ['валютою', { currency: 'USD' }],
    ['сумою й валютою', { amount: 0.01, currency: 'USD' }],
    ['без суми', { amount: undefined }],
    ['без валюти', { currency: undefined }],
  ])('D-SEC-07: підписаний callback %s відхиляється — 400, замовлення лишається pending', async (_title, overrides) => {
    const order = await physicalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, paidCallback(order, overrides), LIQPAY.privateKey);
    expect(res.status).toBe(400);
    expect(res.text).toBe('Amount or currency mismatch');
    expect((await getOrder(order.id)).status).toBe('pending');
    expect((await getProduct(physical.id)).stock_quantity).toBe(10);
    expect(emailSpy).not.toHaveBeenCalled();
  });

  it('D-SEC-07: сума рядком "100.00" і валюта в нижньому регістрі збігаються із замовленням', async () => {
    const order = await physicalOrder();
    const res = await postLiqpay(app, CALLBACK_URL, paidCallback(order, { amount: '100.00', currency: 'uah' }), LIQPAY.privateKey);
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('paid');
  });

  it('D-SEC-07: пошкоджені дані — 400, замовлення не змінюється', async () => {
    const order = await physicalOrder();
    const data = Buffer.from('не json').toString('base64');
    const res = await request(app).post(CALLBACK_URL).type('form').send({ data, signature: 'x' });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid payload');
    expect((await getOrder(order.id)).status).toBe('pending');
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

  it.each([
    ['скасоване замовлення', { status: 'cancelled' }, 'Це замовлення вже оплачено або скасовано.'],
    ['відправлене замовлення', { status: 'shipped' }, 'Це замовлення вже оплачено або скасовано.'],
    ['замовлення з післяплатою', { payment_method: 'cod' }, 'Це замовлення оформлено з оплатою при отриманні. Онлайн оплата недоступна.'],
  ])('D-BIZ-08: %s не оплачується — 400', async (_title, overrides, message) => {
    const verify = vi.spyOn(paymentService, 'verifyGooglePay');
    const order = await physicalOrder(overrides);
    const res = await gpay(buyer, order.id, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    expect((await getOrder(order.id)).status).toBe(overrides.status ?? 'pending');
    expect(verify).not.toHaveBeenCalled();
  });

  it('D-SEC-02: порожній paymentData — 501, замовлення лишається pending, транзакцій немає', async () => {
    const order = await physicalOrder();
    const res = await gpay(buyer, order.id, {});
    expect(res.status).toBe(501);
    expect(res.body.message).toBe('Оплата через Google Pay тимчасово недоступна: платіж не можна підтвердити на сервері.');
    expect((await getOrder(order.id)).status).toBe('pending');
    expect(await getTransactions()).toHaveLength(0);
    expect((await getProduct(physical.id)).stock_quantity).toBe(10);
  });

  it('D-SEC-02: довільний рядок замість токена Google Pay не приймається', async () => {
    const order = await physicalOrder();
    const token = 'forged-token-forged-token-forged';
    const res = await gpay(buyer, order.id, { paymentData: { paymentMethodData: { tokenizationData: { token } } } });
    expect(res.status).toBe(501);
    expect((await getOrder(order.id)).status).toBe('pending');
    expect(await getTransactions()).toHaveLength(0);
  });

  it('D-SEC-02: цифровий товар без підтвердженої оплати не видається', async () => {
    const order = await digitalOrder();
    const res = await gpay(buyer, order.id, {});
    expect(res.status).toBe(501);
    expect((await getOrder(order.id)).status).toBe('pending');
    expect(emailSpy).not.toHaveBeenCalled();
  });

  describe('коли сервер підтвердив платіж', () => {
    let verify;
    const paymentData = { paymentMethodData: { tokenizationData: { token: 'token-from-gateway' } } };

    beforeEach(() => {
      verify = vi.spyOn(paymentService, 'verifyGooglePay').mockResolvedValue({ providerId: 'gpay_verified_1' });
    });

    it('замовлення стає paid, залишок списується, власнику сайту записується транзакція', async () => {
      const order = await physicalOrder();
      const res = await gpay(buyer, order.id, { paymentData });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Оплату успішно проведено' });
      expect((await getOrder(order.id)).status).toBe('paid');
      expect((await getProduct(physical.id)).stock_quantity).toBe(9);

      const [call] = verify.mock.calls;
      expect(call[0]).toEqual(paymentData);
      expect(call[1]).toMatchObject({ currency: 'UAH', reference: order.id });
      expect(Number(call[1].amount)).toBe(100);

      const transactions = await getTransactions();
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        user_id: seller.id, currency: 'UAH', status: 'success', provider_id: 'gpay_verified_1',
        description: `Оплата замовлення #${order.id} через Google Pay`,
      });
      expect(Number(transactions[0].amount)).toBe(100);
    });

    it('цифровий товар: замовлення completed, посилання надсилається на пошту покупця', async () => {
      const order = await digitalOrder();
      const res = await gpay(buyer, order.id, { paymentData });
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

    it('повторна оплата — 400, платіж вдруге не перевіряється, залишок не списується', async () => {
      const order = await physicalOrder();
      await gpay(buyer, order.id, { paymentData });
      const again = await gpay(buyer, order.id, { paymentData });
      expect(again.status).toBe(400);
      expect(again.body.message).toBe('Замовлення вже оплачено');
      expect(verify).toHaveBeenCalledTimes(1);
      expect((await getProduct(physical.id)).stock_quantity).toBe(9);
      expect(await getTransactions()).toHaveLength(1);
    });

    it('відмова перевірки лишає замовлення без змін', async () => {
      verify.mockRejectedValue(new ServiceError(402, 'Платіж відхилено шлюзом'));
      const order = await physicalOrder();
      const res = await gpay(buyer, order.id, { paymentData });
      expect(res.status).toBe(402);
      expect(res.body.message).toBe('Платіж відхилено шлюзом');
      expect((await getOrder(order.id)).status).toBe('pending');
      expect(await getTransactions()).toHaveLength(0);
    });
  });
});

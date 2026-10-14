// Залишки товару: коли саме змінюється stock_quantity (OrderService: checkout, handleLiqPayCallback, payWithGooglePay, updateStatus).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app, paymentService } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { postLiqpay, paidCallback } from '../helpers/liqpay.js';
import { createUser, createSite, createProduct, createOrder, getProduct, getOrder, countOrders } from '../helpers/factories.js';

useTestDatabase();

const LIQPAY = { publicKey: 'sandbox_i1234567890', privateKey: 'site-private-secret' };
const ADDRESS = 'Київ, вул. Хрещатик, 1';

let seller, buyer, site, product;

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  seller = await createUser({ plan: 'PLUS' });
  buyer = await createUser();
  site = await createSite(seller, { liqpay: LIQPAY });
  product = await createProduct(site, { price: 100, stock_quantity: 5 });
});

const checkout = (user, items, paymentMethod) =>
  request(app)
    .post('/api/orders/checkout')
    .set(authHeader(user))
    .send({ siteId: site.id, items, paymentMethod, customerData: { address: ADDRESS } });

const stockOf = async (p) => (await getProduct(p.id)).stock_quantity;

describe('списання залишку при оформленні замовлення', () => {
  it('D-BIZ-02: замовлення з післяплатою одразу зменшує залишок', async () => {
    const res = await checkout(buyer, [{ id: product.id, quantity: 2 }], 'cod');
    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(3);
  });

  it('D-BIZ-02: онлайн-замовлення не зменшує залишок до оплати', async () => {
    const res = await checkout(buyer, [{ id: product.id, quantity: 2 }], 'online');
    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(5);
  });

  it('D-BIZ-02: друге замовлення з післяплатою на весь залишок відхиляється (перепродаж неможливий)', async () => {
    const other = await createUser();
    const first = await checkout(buyer, [{ id: product.id, quantity: 5 }], 'cod');
    const second = await checkout(other, [{ id: product.id, quantity: 5 }], 'cod');
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(second.body.message).toBe(`Недостатньо товару "${product.name}" на складі.`);
    expect(await stockOf(product)).toBe(0);
    expect(await countOrders()).toBe(1);
  });

  it('D-BIZ-02: відхилене замовлення залишок не змінює', async () => {
    const res = await checkout(buyer, [{ id: product.id, quantity: 6 }], 'cod');
    expect(res.status).toBe(400);
    expect(await stockOf(product)).toBe(5);
  });

  it('D-BIZ-02: одночасні замовлення на останні одиниці: приймаються лише ті, що вміщуються в залишок', async () => {
    const buyers = [buyer, await createUser(), await createUser()];
    const results = await Promise.all(buyers.map((user) => checkout(user, [{ id: product.id, quantity: 2 }], 'cod')));
    expect(results.map((res) => res.status).sort()).toEqual([200, 200, 400]);
    expect(await stockOf(product)).toBe(1);
    expect(await countOrders()).toBe(2);
  });

  it('D-BIZ-02: залишок рахується за товаром, інший товар сайту не зачіпається', async () => {
    const other = await createProduct(site, { price: 10, stock_quantity: 7 });
    await checkout(buyer, [{ id: product.id, quantity: 2 }, { id: other.id, quantity: 3 }], 'cod');
    expect(await stockOf(product)).toBe(3);
    expect(await stockOf(other)).toBe(4);
  });

  it('товар без обліку залишку (NULL) при післяплаті лишається без обліку', async () => {
    const unlimited = await createProduct(site, { stock_quantity: null });
    const res = await checkout(buyer, [{ id: unlimited.id, quantity: 3 }], 'cod');
    expect(res.status).toBe(200);
    expect(await stockOf(unlimited)).toBeNull();
  });

  it('D-BIZ-10: товар із нульовим залишком не продається', async () => {
    const soldOut = await createProduct(site, { stock_quantity: 0 });
    const res = await checkout(buyer, [{ id: soldOut.id, quantity: 1 }], 'cod');
    expect(res.status).toBe(400);
    expect(await countOrders()).toBe(0);
  });
});

describe('списання залишку при оплаті', () => {
  const callback = (order) =>
    postLiqpay(app, '/api/orders/liqpay-callback', paidCallback(order), LIQPAY.privateKey);

  it('callback LiqPay зменшує залишок на кількість у замовленні', async () => {
    const order = await createOrder(site, buyer, { items: [{ product, quantity: 2 }] });
    const res = await callback(order);
    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(3);
  });

  it('повторний callback залишок вдруге не зменшує', async () => {
    const order = await createOrder(site, buyer, { items: [{ product, quantity: 2 }] });
    await callback(order);
    await callback(order);
    expect(await stockOf(product)).toBe(3);
  });

  it('залишок не стає від\'ємним (GREATEST(…, 0))', async () => {
    const order = await createOrder(site, buyer, { items: [{ product, quantity: 8 }] });
    await callback(order);
    expect(await stockOf(product)).toBe(0);
  });

  it('товар без обліку залишків (NULL) лишається без обліку', async () => {
    const unlimited = await createProduct(site, { stock_quantity: null });
    const order = await createOrder(site, buyer, { items: [{ product: unlimited, quantity: 3 }] });
    await callback(order);
    expect(await stockOf(unlimited)).toBeNull();
  });

  it('Google Pay після підтвердження платежу зменшує залишок', async () => {
    vi.spyOn(paymentService, 'verifyGooglePay').mockResolvedValue({ providerId: 'gpay_verified' });
    const order = await createOrder(site, buyer, { items: [{ product, quantity: 2 }] });
    const res = await request(app).post(`/api/orders/${order.id}/pay/gpay`).set(authHeader(buyer)).send({});
    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(3);
  });

  it('callback LiqPay для замовлення з оплатою при отриманні залишок вдруге не зменшує', async () => {
    const res = await checkout(buyer, [{ id: product.id, quantity: 2 }], 'cod');
    const order = await getOrder(res.body.orderId);
    await callback({ ...order, total_amount: order.total_amount });
    expect(await stockOf(product)).toBe(3);
  });
});

describe('залишок при зміні статусу замовлення', () => {
  const setStatus = (order, status) =>
    request(app).put(`/api/orders/${order.id}/status`).set(authHeader(seller)).send({ status });
  const codOrder = async (quantity = 2) => {
    const res = await checkout(buyer, [{ id: product.id, quantity }], 'cod');
    return getOrder(res.body.orderId);
  };

  it('D-BIZ-02: перехід між статусами, що тримають залишок, його не чіпає', async () => {
    const order = await codOrder();
    expect(await stockOf(product)).toBe(3);
    for (const status of ['paid', 'shipped', 'completed']) {
      const res = await setStatus(order, status);
      expect(res.status).toBe(200);
      expect(await stockOf(product)).toBe(3);
    }
  });

  it('D-BIZ-02: скасування замовлення з післяплатою повертає залишок', async () => {
    const order = await codOrder();
    const res = await setStatus(order, 'cancelled');
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('cancelled');
    expect(await stockOf(product)).toBe(5);
  });

  it('D-BIZ-02: повторне скасування залишок вдруге не повертає', async () => {
    const order = await codOrder();
    await setStatus(order, 'cancelled');
    const again = await setStatus(order, 'cancelled');
    expect(again.status).toBe(200);
    expect(await stockOf(product)).toBe(5);
  });

  it('D-BIZ-02: скасоване замовлення не можна повернути в роботу', async () => {
    const order = await codOrder();
    await setStatus(order, 'cancelled');
    const res = await setStatus(order, 'shipped');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Скасоване замовлення змінити не можна.');
    expect((await getOrder(order.id)).status).toBe('cancelled');
    expect(await stockOf(product)).toBe(5);
  });

  it('D-BIZ-02: скасування оплаченого онлайн-замовлення повертає залишок, списаний при оплаті', async () => {
    const order = await createOrder(site, buyer, { items: [{ product, quantity: 2 }] });
    await postLiqpay(app, '/api/orders/liqpay-callback', paidCallback(order), LIQPAY.privateKey);
    expect(await stockOf(product)).toBe(3);
    const res = await setStatus(order, 'cancelled');
    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(5);
  });

  it('D-BIZ-02: скасування неоплаченого онлайн-замовлення залишок не змінює', async () => {
    const res = await checkout(buyer, [{ id: product.id, quantity: 2 }], 'online');
    const order = await getOrder(res.body.orderId);
    const cancelled = await setStatus(order, 'cancelled');
    expect(cancelled.status).toBe(200);
    expect(await stockOf(product)).toBe(5);
  });

  it('D-BIZ-02: цифрові товари й товари без обліку при скасуванні залишку не набувають', async () => {
    const unlimited = await createProduct(site, { stock_quantity: null });
    const res = await checkout(buyer, [{ id: unlimited.id, quantity: 4 }], 'cod');
    await setStatus(await getOrder(res.body.orderId), 'cancelled');
    expect(await stockOf(unlimited)).toBeNull();
  });
});

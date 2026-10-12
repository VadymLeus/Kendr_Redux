// Залишки товару: коли саме зменшується stock_quantity (orderController: processCheckout, liqpayCallback, processGooglePay, updateOrderStatus).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { postLiqpay, liqpayOrderId } from '../helpers/liqpay.js';
import { createUser, createSite, createProduct, createOrder, getProduct } from '../helpers/factories.js';

useTestDatabase();

const LIQPAY = { publicKey: 'sandbox_i1234567890', privateKey: 'site-private-secret' };
const ADDRESS = 'Київ, вул. Хрещатик, 1';

let seller, buyer, site, product;

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
  // KNOWN-DEFECT D-BIZ-02: залишок перевіряється, але при оформленні не резервується.
  it('KNOWN-DEFECT D-BIZ-02: замовлення з післяплатою не зменшує залишок', async () => {
    const res = await checkout(buyer, [{ id: product.id, quantity: 2 }], 'cod');
    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(5);
  });

  it('KNOWN-DEFECT D-BIZ-02: онлайн-замовлення не зменшує залишок до оплати', async () => {
    const res = await checkout(buyer, [{ id: product.id, quantity: 2 }], 'online');
    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(5);
  });

  it('KNOWN-DEFECT D-BIZ-02: два замовлення на весь залишок приймаються обидва (перепродаж)', async () => {
    const other = await createUser();
    const first = await checkout(buyer, [{ id: product.id, quantity: 5 }], 'cod');
    const second = await checkout(other, [{ id: product.id, quantity: 5 }], 'cod');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await stockOf(product)).toBe(5); // замовлено 10 одиниць при залишку 5
  });
});

describe('списання залишку при оплаті', () => {
  const callback = (order) =>
    postLiqpay(app, '/api/orders/liqpay-callback', { order_id: liqpayOrderId(order.id), status: 'success' }, LIQPAY.privateKey);

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

  it('Google Pay зменшує залишок', async () => {
    const order = await createOrder(site, buyer, { items: [{ product, quantity: 2 }] });
    const res = await request(app).post(`/api/orders/${order.id}/pay/gpay`).set(authHeader(buyer)).send({});
    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(3);
  });

  // KNOWN-DEFECT D-BIZ-02: зміна статусу не пов'язана із залишками.
  it('KNOWN-DEFECT D-BIZ-02: updateOrderStatus не чіпає залишок', async () => {
    const order = await createOrder(site, buyer, { items: [{ product, quantity: 2 }] });
    const res = await request(app).put(`/api/orders/${order.id}/status`).set(authHeader(seller)).send({ status: 'paid' });
    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(5);
  });
});

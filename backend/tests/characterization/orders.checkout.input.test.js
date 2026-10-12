// Вхідні дані чекаута: кількість у позиціях замовлення (orderController.processCheckout).
// Усі тести цього файлу фіксують дефекти: кількість не валідується.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { createUser, createSite, createProduct, getOrder, getOrderItems, countOrders } from '../helpers/factories.js';

useTestDatabase();

let seller, buyer, site, product;

beforeEach(async () => {
  seller = await createUser({ plan: 'PLUS' });
  buyer = await createUser();
  site = await createSite(seller);
  product = await createProduct(site, { price: 100, stock_quantity: 10 });
});

const checkoutCod = (items) =>
  request(app)
    .post('/api/orders/checkout')
    .set(authHeader(buyer))
    .send({ siteId: site.id, items, paymentMethod: 'cod', customerData: { address: 'Київ, вул. Хрещатик, 1' } });

describe('кількість у позиціях замовлення', () => {
  // KNOWN-DEFECT D-BIZ-09: кількість не перевіряється, перевірка залишку пропускає від'ємні значення.
  it("KNOWN-DEFECT D-BIZ-09: від'ємна кількість приймається, сума замовлення від'ємна", async () => {
    const res = await checkoutCod([{ id: product.id, quantity: -1 }]);
    expect(res.status).toBe(200);
    const order = await getOrder(res.body.orderId);
    expect(Number(order.total_amount)).toBe(-100);
    const [item] = await getOrderItems(order.id);
    expect(item.quantity).toBe(-1);
  });

  it("KNOWN-DEFECT D-BIZ-09: від'ємна кількість дешевого товару зменшує суму дорогого", async () => {
    const cheap = await createProduct(site, { price: 1, stock_quantity: null });
    const res = await checkoutCod([
      { id: product.id, quantity: 1 },  // 100
      { id: cheap.id, quantity: -50 },  // -50
    ]);
    expect(res.status).toBe(200);
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(50);
  });

  it('KNOWN-DEFECT D-BIZ-09: нульова кількість приймається, сума дорівнює нулю', async () => {
    const res = await checkoutCod([{ id: product.id, quantity: 0 }]);
    expect(res.status).toBe(200);
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(0);
  });
});

describe('залишок при кількох позиціях одного товару', () => {
  // KNOWN-DEFECT D-BIZ-02: залишок перевіряється для кожної позиції окремо, а не для суми.
  it('KNOWN-DEFECT D-BIZ-02: товар у двох позиціях перевищує залишок, але замовлення приймається', async () => {
    const res = await checkoutCod([
      { id: product.id, quantity: 6 },
      { id: product.id, quantity: 6 },
    ]); // разом 12 при залишку 10
    expect(res.status).toBe(200);
    expect(await getOrderItems(res.body.orderId)).toHaveLength(2);
  });
});

describe('помилки без статусу в processCheckout', () => {
  // KNOWN-DEFECT D-ARC-10: збій SQL не має status, тож клієнт отримує 400 із текстом помилки БД.
  it('KNOWN-DEFECT D-ARC-10: нечислова кількість — 400 із текстом помилки БД замість 500', async () => {
    const res = await checkoutCod([{ id: product.id, quantity: 'abc' }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/NaN/); // «Unknown column 'NaN' in 'field list'»
    expect(await countOrders()).toBe(0);
  });
});

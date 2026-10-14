// Вхідні дані чекаута: кількість і ідентифікатори товарів у позиціях замовлення (orderController.processCheckout).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { createUser, createSite, createProduct, getOrder, getOrderItems, getProduct, countOrders } from '../helpers/factories.js';

useTestDatabase();

const QUANTITY_ERROR = 'Кількість товару має бути цілим числом не менше 1.';

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
  it("D-BIZ-09: від'ємна кількість відхиляється, замовлення не створюється", async () => {
    const res = await checkoutCod([{ id: product.id, quantity: -1 }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(QUANTITY_ERROR);
    expect(await countOrders()).toBe(0);
  });

  it("D-BIZ-09: від'ємна кількість дешевого товару не зменшує суму дорогого", async () => {
    const cheap = await createProduct(site, { price: 1, stock_quantity: null });
    const res = await checkoutCod([
      { id: product.id, quantity: 1 },
      { id: cheap.id, quantity: -50 },
    ]);
    expect(res.status).toBe(400);
    expect(await countOrders()).toBe(0);
    expect((await getProduct(product.id)).stock_quantity).toBe(10);
  });

  it('D-BIZ-09: нульова кількість відхиляється', async () => {
    const res = await checkoutCod([{ id: product.id, quantity: 0 }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(QUANTITY_ERROR);
    expect(await countOrders()).toBe(0);
  });

  it.each([[1.5], ['abc'], [''], [null], [true], [[]]])('D-BIZ-09: кількість %j відхиляється з 400', async (quantity) => {
    const res = await checkoutCod([{ id: product.id, quantity }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(QUANTITY_ERROR);
    expect(await countOrders()).toBe(0);
  });

  it('D-BIZ-09: відсутня кількість відхиляється', async () => {
    const res = await checkoutCod([{ id: product.id }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(QUANTITY_ERROR);
  });

  it('D-BIZ-09: кількість-рядок із цілим числом приймається як число', async () => {
    const res = await checkoutCod([{ id: product.id, quantity: '2' }]);
    expect(res.status).toBe(200);
    const [item] = await getOrderItems(res.body.orderId);
    expect(item.quantity).toBe(2);
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(200);
  });

  it.each([[undefined], [null], [0], [-1], ['abc'], [1.5]])('ідентифікатор товару %j відхиляється з 400', async (id) => {
    const res = await checkoutCod([{ id, quantity: 1 }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Некоректний товар у замовленні.');
    expect(await countOrders()).toBe(0);
  });

  it.each([['рядок'], [{}], [5]])('items у вигляді %j (не масив) відхиляється з 400', async (items) => {
    const res = await checkoutCod(items);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Список товарів порожній.');
  });

  it('елемент списку null відхиляється з 400', async () => {
    const res = await checkoutCod([null]);
    expect(res.status).toBe(400);
    expect(await countOrders()).toBe(0);
  });
});

describe('залишок при кількох позиціях одного товару', () => {
  it('D-BIZ-02: товар у двох позиціях перевіряється на залишок сумарно', async () => {
    const res = await checkoutCod([
      { id: product.id, quantity: 6 },
      { id: product.id, quantity: 6 },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`Недостатньо товару "${product.name}" на складі.`);
    expect(await countOrders()).toBe(0);
    expect((await getProduct(product.id)).stock_quantity).toBe(10);
  });

  it('D-BIZ-02: дві позиції, що разом дорівнюють залишку, приймаються, залишок стає 0', async () => {
    const res = await checkoutCod([
      { id: product.id, quantity: 4 },
      { id: product.id, quantity: 6 },
    ]);
    expect(res.status).toBe(200);
    expect(await getOrderItems(res.body.orderId)).toHaveLength(2);
    expect((await getProduct(product.id)).stock_quantity).toBe(0);
  });

  it('ідентифікатор товару у вигляді рядка та числа вважається одним товаром', async () => {
    const res = await checkoutCod([
      { id: String(product.id), quantity: 6 },
      { id: product.id, quantity: 6 },
    ]);
    expect(res.status).toBe(400);
    expect(await countOrders()).toBe(0);
  });
});

describe('помилки валідації в processCheckout', () => {
  it('нечислова кількість більше не доходить до БД: 400 з повідомленням про кількість, а не текст SQL', async () => {
    const res = await checkoutCod([{ id: product.id, quantity: 'abc' }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(QUANTITY_ERROR);
    expect(res.body.message).not.toMatch(/NaN/);
    expect(await countOrders()).toBe(0);
  });
});

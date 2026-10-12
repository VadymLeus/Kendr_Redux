// Доступ до замовлень: getSiteOrders, updateOrderStatus (D-SEC-03) і getMyOrders (базова поведінка).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { query } from '../helpers/testDb.js';
import { createUser, createSite, createProduct, createOrder, getOrder } from '../helpers/factories.js';

useTestDatabase();

const FILE_URL = 'https://files.test/book.pdf';

let seller, buyer, stranger, site, product, order;

beforeEach(async () => {
  seller = await createUser({ plan: 'PLUS' });
  buyer = await createUser();
  stranger = await createUser();
  site = await createSite(seller);
  product = await createProduct(site, { price: 100, stock_quantity: 10 });
  order = await createOrder(site, buyer, {
    items: [{ product, quantity: 2 }],
    customer_name: 'Олена Коваль',
    customer_phone: '+380671234567',
    delivery_address: 'Львів, вул. Личаківська, 5',
  });
});

describe('GET /api/orders/site/:siteId', () => {
  it('без токена — 401', async () => {
    const res = await request(app).get(`/api/orders/site/${site.id}`);
    expect(res.status).toBe(401);
  });

  it('власник сайту бачить замовлення з позиціями', async () => {
    const res = await request(app).get(`/api/orders/site/${site.id}`).set(authHeader(seller));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(order.id);
    expect(res.body[0].items).toHaveLength(1);
    expect(res.body[0].items[0]).toMatchObject({ product_id: product.id, quantity: 2 });
  });

  // KNOWN-DEFECT D-SEC-03: маршрут захищений лише verifyToken, власник сайту не перевіряється.
  it('KNOWN-DEFECT D-SEC-03: стороннього користувача пускає до замовлень чужого сайту з персональними даними', async () => {
    const res = await request(app).get(`/api/orders/site/${site.id}`).set(authHeader(stranger));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: order.id,
      customer_name: 'Олена Коваль',
      customer_email: buyer.email,
      customer_phone: '+380671234567',
      delivery_address: 'Львів, вул. Личаківська, 5',
    });
    expect(res.body[0].items).toHaveLength(1);
  });

  it('для неіснуючого сайту повертає порожній масив', async () => {
    const res = await request(app).get('/api/orders/site/999999').set(authHeader(stranger));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PUT /api/orders/:id/status', () => {
  const setStatus = (user, id, status) =>
    request(app).put(`/api/orders/${id}/status`).set(authHeader(user)).send({ status });

  it('без токена — 401', async () => {
    const res = await request(app).put(`/api/orders/${order.id}/status`).send({ status: 'shipped' });
    expect(res.status).toBe(401);
  });

  it('власник сайту змінює статус', async () => {
    const res = await setStatus(seller, order.id, 'shipped');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Статус оновлено' });
    expect((await getOrder(order.id)).status).toBe('shipped');
  });

  // KNOWN-DEFECT D-SEC-03: власник сайту не перевіряється, оплата не потрібна.
  it('KNOWN-DEFECT D-SEC-03: сторонній користувач ставить чужому замовленню статус paid без оплати', async () => {
    const res = await setStatus(stranger, order.id, 'paid');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Статус оновлено' });
    expect((await getOrder(order.id)).status).toBe('paid');
  });

  it('KNOWN-DEFECT D-SEC-03: сторонній користувач скасовує чуже замовлення', async () => {
    const res = await setStatus(stranger, order.id, 'cancelled');
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('cancelled');
  });

  // Білого списку статусів у коді немає: значення поза ENUM відхиляє лише БД (суворий режим MySQL), клієнт отримує 500.
  it('KNOWN-DEFECT D-SEC-03: значення поза ENUM відхиляє лише БД — відповідь 500', async () => {
    const res = await setStatus(stranger, order.id, 'delivered-to-mars');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Помилка оновлення статусу' });
    expect((await getOrder(order.id)).status).toBe('pending');
  });

  it('для неіснуючого замовлення все одно повертає 200', async () => {
    const res = await setStatus(seller, 'no-such-order', 'shipped');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Статус оновлено' });
  });
});

describe('GET /api/orders/my', () => {
  it('повертає лише замовлення поточного користувача', async () => {
    const mine = await request(app).get('/api/orders/my').set(authHeader(buyer));
    expect(mine.status).toBe(200);
    expect(mine.body.map((o) => o.id)).toEqual([order.id]);

    const others = await request(app).get('/api/orders/my').set(authHeader(stranger));
    expect(others.body).toEqual([]);
  });

  it('посилання на цифровий товар приховане, поки замовлення не оплачено', async () => {
    const digital = await createProduct(site, { type: 'digital', digital_file_url: FILE_URL });
    const digitalOrder = await createOrder(site, buyer, {
      items: [{ product: digital, quantity: 1 }], delivery_address: 'Цифрова доставка',
    });

    const before = await request(app).get('/api/orders/my').set(authHeader(buyer));
    const pendingOrder = before.body.find((o) => o.id === digitalOrder.id);
    expect(pendingOrder.items[0].digital_file_url).toBeNull();

    await query(`UPDATE orders SET status = 'paid' WHERE id = ?`, [digitalOrder.id]);
    const after = await request(app).get('/api/orders/my').set(authHeader(buyer));
    const paidOrder = after.body.find((o) => o.id === digitalOrder.id);
    expect(paidOrder.items[0].digital_file_url).toBe(FILE_URL);
  });
});

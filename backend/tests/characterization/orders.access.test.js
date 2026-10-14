// backend/tests/characterization/orders.access.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { query } from '../helpers/testDb.js';
import { createUser, createSite, createProduct, createOrder, getOrder, addCollaborator } from '../helpers/factories.js';

useTestDatabase();

const FILE_URL = 'https://files.test/book.pdf';

let seller, buyer, stranger, site, product, order;
const SECTIONS = ['editor', 'theme', 'commerce', 'overview', 'settings'];

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

  it('D-SEC-03: сторонній користувач отримує 403 і жодних персональних даних', async () => {
    const res = await request(app).get(`/api/orders/site/${site.id}`).set(authHeader(stranger));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'У вас немає прав переглядати замовлення цього сайту.' });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('Олена Коваль');
    expect(text).not.toContain(buyer.email);
    expect(text).not.toContain('+380671234567');
  });

  it('D-SEC-03: покупець замовлення не бачить список замовлень сайту', async () => {
    const res = await request(app).get(`/api/orders/site/${site.id}`).set(authHeader(buyer));
    expect(res.status).toBe(403);
  });

  it.each([['editor'], ['viewer']])('D-SEC-03: співавтор %s із секцією commerce бачить замовлення', async (role) => {
    const member = await createUser();
    await addCollaborator(site, member, role, ['commerce']);
    const res = await request(app).get(`/api/orders/site/${site.id}`).set(authHeader(member));
    expect(res.status).toBe(200);
    expect(res.body.map((o) => o.id)).toEqual([order.id]);
  });

  it.each([['editor'], ['viewer']])('D-SEC-03: співавтор %s без секції commerce отримує 403', async (role) => {
    const member = await createUser();
    await addCollaborator(site, member, role, SECTIONS.filter((section) => section !== 'commerce'));
    const res = await request(app).get(`/api/orders/site/${site.id}`).set(authHeader(member));
    expect(res.status).toBe(403);
  });

  it('D-SEC-03: співавтор без жодних дозволів отримує 403', async () => {
    const member = await createUser();
    await addCollaborator(site, member, 'editor', []);
    const res = await request(app).get(`/api/orders/site/${site.id}`).set(authHeader(member));
    expect(res.status).toBe(403);
  });

  it('D-SEC-03: співавтор іншого сайту не бачить замовлень цього', async () => {
    const otherSeller = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherSeller);
    const member = await createUser();
    await addCollaborator(otherSite, member, 'editor', ['commerce']);
    const res = await request(app).get(`/api/orders/site/${site.id}`).set(authHeader(member));
    expect(res.status).toBe(403);
  });

  it('неіснуючий сайт — 403, як і для чужого', async () => {
    const res = await request(app).get('/api/orders/site/999999').set(authHeader(stranger));
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/orders/:id/status', () => {
  const setStatus = (user, id, status) =>
    request(app).put(`/api/orders/${id}/status`).set(authHeader(user)).send({ status });

  const paidOrder = () => createOrder(site, buyer, { status: 'paid', items: [{ product, quantity: 1 }] });

  it('без токена — 401', async () => {
    const res = await request(app).put(`/api/orders/${order.id}/status`).send({ status: 'shipped' });
    expect(res.status).toBe(401);
  });

  it('власник сайту змінює статус оплаченого замовлення', async () => {
    const paid = await paidOrder();
    const res = await setStatus(seller, paid.id, 'shipped');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Статус оновлено' });
    expect((await getOrder(paid.id)).status).toBe('shipped');
  });

  it('D-SEC-03: сторонній користувач не може позначити чуже замовлення оплаченим', async () => {
    const res = await setStatus(stranger, order.id, 'paid');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'У вас немає прав змінювати замовлення цього сайту.' });
    expect((await getOrder(order.id)).status).toBe('pending');
  });

  it('D-SEC-03: сторонній користувач не може скасувати чуже замовлення', async () => {
    const res = await setStatus(stranger, order.id, 'cancelled');
    expect(res.status).toBe(403);
    expect((await getOrder(order.id)).status).toBe('pending');
  });

  it('D-SEC-03: покупець не змінює статус власного замовлення', async () => {
    const res = await setStatus(buyer, order.id, 'paid');
    expect(res.status).toBe(403);
    expect((await getOrder(order.id)).status).toBe('pending');
  });

  it('D-SEC-03: власник не може позначити оплаченим неоплачене онлайн-замовлення', async () => {
    for (const status of ['paid', 'shipped', 'completed']) {
      const res = await setStatus(seller, order.id, status);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Замовлення з онлайн-оплатою можна позначити оплаченим лише після підтвердження платежу.' });
    }
    expect((await getOrder(order.id)).status).toBe('pending');
  });

  it('D-SEC-03: власник може скасувати неоплачене онлайн-замовлення', async () => {
    const res = await setStatus(seller, order.id, 'cancelled');
    expect(res.status).toBe(200);
    expect((await getOrder(order.id)).status).toBe('cancelled');
  });

  it('замовлення з оплатою при отриманні власник веде по всіх статусах без онлайн-оплати', async () => {
    const cod = await createOrder(site, buyer, { payment_method: 'cod', items: [{ product, quantity: 1 }] });
    for (const status of ['paid', 'shipped', 'completed']) {
      const res = await setStatus(seller, cod.id, status);
      expect(res.status).toBe(200);
      expect((await getOrder(cod.id)).status).toBe(status);
    }
  });

  it.each([['delivered-to-mars'], ['pending'], [''], ['PAID']])('D-SEC-03: недопустимий статус %j — 400, замовлення не змінюється', async (status) => {
    const paid = await paidOrder();
    const res = await setStatus(seller, paid.id, status);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Недопустимий статус замовлення.' });
    expect((await getOrder(paid.id)).status).toBe('paid');
  });

  it('D-SEC-03: відсутній статус у тілі — 400', async () => {
    const paid = await paidOrder();
    const res = await request(app).put(`/api/orders/${paid.id}/status`).set(authHeader(seller)).send({});
    expect(res.status).toBe(400);
    expect((await getOrder(paid.id)).status).toBe('paid');
  });

  it('D-SEC-03: редактор із секцією commerce змінює статус', async () => {
    const member = await createUser();
    await addCollaborator(site, member, 'editor', ['commerce']);
    const paid = await paidOrder();
    const res = await setStatus(member, paid.id, 'shipped');
    expect(res.status).toBe(200);
    expect((await getOrder(paid.id)).status).toBe('shipped');
  });

  it('D-SEC-03: глядач із секцією commerce не змінює статус', async () => {
    const member = await createUser();
    await addCollaborator(site, member, 'viewer', ['commerce']);
    const paid = await paidOrder();
    const res = await setStatus(member, paid.id, 'shipped');
    expect(res.status).toBe(403);
    expect((await getOrder(paid.id)).status).toBe('paid');
  });

  it('D-SEC-03: редактор без секції commerce не змінює статус', async () => {
    const member = await createUser();
    await addCollaborator(site, member, 'editor', SECTIONS.filter((section) => section !== 'commerce'));
    const paid = await paidOrder();
    const res = await setStatus(member, paid.id, 'shipped');
    expect(res.status).toBe(403);
    expect((await getOrder(paid.id)).status).toBe('paid');
  });

  it('неіснуюче замовлення — 404', async () => {
    const res = await setStatus(seller, 'no-such-order', 'shipped');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Замовлення не знайдено' });
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

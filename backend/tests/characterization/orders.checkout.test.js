// Оформлення замовлення: POST /api/orders/checkout (orderController.processCheckout).
// Тести фіксують поточну поведінку v0. Тести з маркером KNOWN-DEFECT фіксують помилкову поведінку
// з реєстру дефектів (docs/02-analysis/defects.md): у v2.0 їх очікування змінюються разом із виправленням.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { decodeLiqpay, signLiqpay } from '../helpers/liqpay.js';
import {
  createUser, createSite, createProduct, createCategory, linkProductToCategory, createOrder, addCollaborator, setGlobalSetting,
  getOrder, getOrderItems, countOrders,
} from '../helpers/factories.js';

useTestDatabase();

const LIQPAY = { publicKey: 'sandbox_i1234567890', privateKey: 'site-private-secret' };
const ADDRESS = 'Київ, вул. Хрещатик, 1';

const checkout = (user, body) => {
  const req = request(app).post('/api/orders/checkout');
  return (user ? req.set(authHeader(user)) : req).send(body);
};

let seller, buyer, site, product;

beforeEach(async () => {
  seller = await createUser({ plan: 'PLUS' });
  buyer = await createUser();
  site = await createSite(seller);
  product = await createProduct(site, { price: 100, stock_quantity: 10 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const codBody = (items, extra = {}) => ({
  siteId: site.id,
  items,
  paymentMethod: 'cod',
  customerData: { name: 'Іван Петренко', phone: '+380501112233', address: ADDRESS },
  ...extra,
});

describe('checkout: доступ і вхідні дані', () => {
  it('без токена — 401', async () => {
    const res = await checkout(null, codBody([{ id: product.id, quantity: 1 }]));
    expect(res.status).toBe(401);
  });

  it('якщо оплата платформою вимкнена (billing_enabled = 0) — 403', async () => {
    await setGlobalSetting('billing_enabled', 0);
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }]));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Прийом платежів тимчасово призупинено адміністрацією платформи.');
  });

  it('без siteId — 400', async () => {
    const res = await checkout(buyer, { items: [{ id: product.id, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Не вказано магазин для оформлення.');
  });

  it('з порожнім списком товарів — 400', async () => {
    const res = await checkout(buyer, { siteId: site.id, items: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Список товарів порожній.');
  });

  it('для неіснуючого магазину — 404', async () => {
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }], { siteId: 999999 }));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Магазин не знайдено.');
  });

  it('власник не купує у власному магазині — 403', async () => {
    const res = await checkout(seller, codBody([{ id: product.id, quantity: 1 }]));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Ви не можете купувати товари у власному магазині.');
    expect(await countOrders()).toBe(0);
  });

  it('співавтор сайту не оформлює замовлення — 403', async () => {
    await addCollaborator(site, buyer);
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }]));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Співавтори не можуть оформлювати замовлення на цьому сайті.');
  });

  it('якщо продавець вимкнув онлайн-оплату — 400', async () => {
    const closed = await createSite(seller, { is_online_payment_enabled: 0 });
    const item = await createProduct(closed);
    const res = await checkout(buyer, { siteId: closed.id, items: [{ id: item.id, quantity: 1 }], paymentMethod: 'online', customerData: { address: ADDRESS } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Продавець тимчасово не приймає онлайн оплату.');
  });

  it('якщо продавець вимкнув післяплату — 400', async () => {
    const closed = await createSite(seller, { is_cod_enabled: 0 });
    const item = await createProduct(closed);
    const res = await checkout(buyer, { siteId: closed.id, items: [{ id: item.id, quantity: 1 }], paymentMethod: 'cod', customerData: { address: ADDRESS } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Продавець не відправляє товари післяплатою.');
  });

  it('невідомий paymentMethod трактується як online', async () => {
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }], { paymentMethod: 'bitcoin' }));
    expect(res.status).toBe(200);
    expect(res.body.paymentMethod).toBe('online');
    expect((await getOrder(res.body.orderId)).payment_method).toBe('online');
  });
});

describe('checkout: перевірка товарів', () => {
  it('товар недоступний (is_available = 0) — 400, замовлення не створюється', async () => {
    const hidden = await createProduct(site, { is_available: 0 });
    const res = await checkout(buyer, codBody([{ id: hidden.id, quantity: 1 }]));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Деякі товари недоступні або не належать цьому магазину.');
    expect(await countOrders()).toBe(0);
  });

  it('товар іншого магазину — 400', async () => {
    const otherSite = await createSite(seller);
    const foreign = await createProduct(otherSite);
    const res = await checkout(buyer, codBody([{ id: foreign.id, quantity: 1 }]));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Деякі товари недоступні або не належать цьому магазину.');
  });

  it('кількість більша за залишок — 400, замовлення не створюється', async () => {
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 11 }]));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`Недостатньо товару "${product.name}" на складі.`);
    expect(await countOrders()).toBe(0);
  });

  it('товар без обліку залишків (stock_quantity = NULL) не обмежується', async () => {
    const unlimited = await createProduct(site, { stock_quantity: null });
    const res = await checkout(buyer, codBody([{ id: unlimited.id, quantity: 1000 }]));
    expect(res.status).toBe(200);
  });

  it('фізичний товар без адреси доставки — 400', async () => {
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }], { customerData: { name: 'Іван' } }));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Адреса доставки обов'язкова для фізичних товарів.");
    expect(await countOrders()).toBe(0);
  });

  it('цифровий товар не можна замовити післяплатою — 400', async () => {
    const digital = await createProduct(site, { type: 'digital', digital_file_url: 'https://files.test/book.pdf' });
    const res = await checkout(buyer, codBody([{ id: digital.id, quantity: 1 }]));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Цифрові товари не можна замовити післяплатою.');
  });
});

describe('checkout: ліміт неоплачених замовлень', () => {
  it('п\'яте неоплачене замовлення ще приймається', async () => {
    for (let i = 0; i < 4; i++) await createOrder(site, buyer, { status: 'pending' });
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }]));
    expect(res.status).toBe(200);
  });

  it('шосте неоплачене замовлення — 429', async () => {
    for (let i = 0; i < 5; i++) await createOrder(site, buyer, { status: 'pending' });
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }]));
    expect(res.status).toBe(429);
    expect(res.body.message).toContain('ліміту неоплачених замовлень (5)');
  });

  it('оплачені замовлення в ліміт не входять', async () => {
    for (let i = 0; i < 5; i++) await createOrder(site, buyer, { status: 'paid' });
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }]));
    expect(res.status).toBe(200);
  });
});

describe('checkout: створення замовлення', () => {
  it('післяплата: створює замовлення зі статусом pending і позиціями', async () => {
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 2 }]));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ orderId: expect.any(String), paymentMethod: 'cod' });
    expect(res.body.orderId).toHaveLength(12);

    const order = await getOrder(res.body.orderId);
    expect(order).toMatchObject({
      site_id: site.id,
      customer_id: buyer.id,
      customer_name: 'Іван Петренко',
      customer_email: buyer.email,
      customer_phone: '+380501112233',
      delivery_address: ADDRESS,
      status: 'pending',
      payment_method: 'cod',
    });
    expect(Number(order.total_amount)).toBe(200);

    const items = await getOrderItems(order.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ product_id: product.id, product_name: product.name, quantity: 2, type: 'physical' });
    expect(Number(items[0].price)).toBe(100);
  });

  it('без customerData ім\'я береться з профілю користувача, цифровий товар — без адреси', async () => {
    const digital = await createProduct(site, { type: 'digital', digital_file_url: 'https://files.test/book.pdf' });
    const res = await checkout(buyer, { siteId: site.id, items: [{ id: digital.id, quantity: 1 }], paymentMethod: 'online' });
    expect(res.status).toBe(200);
    const order = await getOrder(res.body.orderId);
    expect(order.customer_name).toBe(buyer.username);
    expect(order.customer_phone).toBe('');
    expect(order.delivery_address).toBe('Цифрова доставка');
  });

  it('кілька позицій: сума — сума цін позицій на кількість', async () => {
    const second = await createProduct(site, { price: 49, stock_quantity: 10 });
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }, { id: second.id, quantity: 2 }]));
    expect(res.status).toBe(200);
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(198);
    expect(await getOrderItems(res.body.orderId)).toHaveLength(2);
  });

  it('D-BIZ-01: ціна позиції округлюється до цілої грошової одиниці, як на вітрині', async () => {
    const fractional = await createProduct(site, { price: 49.5, stock_quantity: 10 });
    const res = await checkout(buyer, codBody([{ id: fractional.id, quantity: 2 }]));
    expect(res.status).toBe(200);
    const order = await getOrder(res.body.orderId);
    expect(Number(order.total_amount)).toBe(100);
    expect(Number((await getOrderItems(order.id))[0].price)).toBe(50);
  });

  it('онлайн без ключів LiqPay у магазину: повертає лише orderId', async () => {
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1 }], { paymentMethod: 'online' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ orderId: expect.any(String), paymentMethod: 'online' });
  });

  it('онлайн із ключами LiqPay: повертає підписані дані платежу', async () => {
    const shop = await createSite(seller, { liqpay: LIQPAY });
    const item = await createProduct(shop, { price: 100, stock_quantity: 10 });
    const res = await checkout(buyer, {
      siteId: shop.id, items: [{ id: item.id, quantity: 2 }], paymentMethod: 'online', customerData: { address: ADDRESS },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ orderId: expect.any(String), paymentMethod: 'online' });

    const payment = decodeLiqpay(res.body.liqpayData);
    expect(payment).toMatchObject({
      public_key: LIQPAY.publicKey, version: '3', action: 'pay', currency: 'UAH', amount: 200,
    });
    expect(payment).not.toHaveProperty('sandbox');
    expect(payment.order_id.startsWith(`${res.body.orderId}_`)).toBe(true);
    expect(payment.server_url.endsWith('/api/orders/liqpay-callback')).toBe(true);
    expect(res.body.liqpaySignature).toBe(signLiqpay(res.body.liqpayData, LIQPAY.privateKey));
  });

  it('D-CFG-01: параметр sandbox додається, лише коли LIQPAY_SANDBOX=1', async () => {
    vi.stubEnv('LIQPAY_SANDBOX', '1');
    const shop = await createSite(seller, { liqpay: LIQPAY });
    const item = await createProduct(shop, { price: 100, stock_quantity: 10 });
    const res = await checkout(buyer, {
      siteId: shop.id, items: [{ id: item.id, quantity: 1 }], paymentMethod: 'online', customerData: { address: ADDRESS },
    });
    expect(res.status).toBe(200);
    expect(decodeLiqpay(res.body.liqpayData).sandbox).toBe(1);
  });
});

describe('checkout: ціна замовлення', () => {
  const SIZE = {
    name: 'Розмір',
    values: [
      { label: 'S', priceModifier: 0, salePercentage: 0 },
      { label: 'XL', priceModifier: 50, salePercentage: 0 },
      { label: 'Акція', priceModifier: 20, salePercentage: 25 },
    ],
  };

  it('D-BIZ-01: знижка товару (sale_percentage) входить у ціну позиції й суму замовлення', async () => {
    const onSale = await createProduct(site, { price: 100, sale_percentage: 20, stock_quantity: 10 });
    const res = await checkout(buyer, codBody([{ id: onSale.id, quantity: 2 }]));
    expect(res.status).toBe(200);
    const order = await getOrder(res.body.orderId);
    expect(Number(order.total_amount)).toBe(160);
    const [item] = await getOrderItems(order.id);
    expect(Number(item.price)).toBe(80);
    expect(item.quantity).toBe(2);
  });

  it('D-BIZ-01: надбавка вибраного варіанта додається до ціни, вибір зберігається в позиції', async () => {
    const shirt = await createProduct(site, { price: 100, stock_quantity: 10, variants: [SIZE] });
    const res = await checkout(buyer, codBody([{ id: shirt.id, quantity: 1, options: { 'Розмір': 'XL' } }]));
    expect(res.status).toBe(200);
    const order = await getOrder(res.body.orderId);
    expect(Number(order.total_amount)).toBe(150);
    const [item] = await getOrderItems(order.id);
    expect(Number(item.price)).toBe(150);
    expect(item.options).toEqual({ 'Розмір': 'XL' });
  });

  it('D-BIZ-01: знижка вибраного варіанта має пріоритет над знижкою товару', async () => {
    const shirt = await createProduct(site, { price: 100, sale_percentage: 50, stock_quantity: 10, variants: [SIZE] });
    const res = await checkout(buyer, codBody([{ id: shirt.id, quantity: 1, options: { 'Розмір': 'Акція' } }]));
    expect(res.status).toBe(200);
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(90);
  });

  it('D-BIZ-01: знижка категорії діє, якщо знижки товару й варіанта немає', async () => {
    const category = await createCategory(site, { discount_percentage: 30 });
    const tea = await createProduct(site, { price: 100, stock_quantity: 10 });
    await linkProductToCategory(tea, category);
    const res = await checkout(buyer, codBody([{ id: tea.id, quantity: 1 }]));
    expect(res.status).toBe(200);
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(70);
  });

  it('D-BIZ-01: знижка товару має пріоритет над знижкою категорії, знижки не складаються', async () => {
    const category = await createCategory(site, { discount_percentage: 50 });
    const tea = await createProduct(site, { price: 100, sale_percentage: 10, stock_quantity: 10 });
    await linkProductToCategory(tea, category);
    const res = await checkout(buyer, codBody([{ id: tea.id, quantity: 1 }]));
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(90);
  });

  it('D-BIZ-01: з кількох категорій береться найбільша знижка', async () => {
    const small = await createCategory(site, { discount_percentage: 10 });
    const big = await createCategory(site, { discount_percentage: 40 });
    const tea = await createProduct(site, { price: 100, stock_quantity: 10 });
    await linkProductToCategory(tea, small);
    await linkProductToCategory(tea, big);
    const res = await checkout(buyer, codBody([{ id: tea.id, quantity: 1 }]));
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(60);
  });

  it('D-BIZ-01: ціна, надіслана клієнтом, ігнорується', async () => {
    const shirt = await createProduct(site, { price: 100, stock_quantity: 10, variants: [SIZE] });
    const res = await checkout(buyer, codBody([
      { id: shirt.id, quantity: 1, price: 1, finalPrice: 1, options: { 'Розмір': 'XL' } },
    ]));
    expect(res.status).toBe(200);
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(150);
  });

  it('D-BIZ-01: товар без вибраних варіантів рахується за базовою ціною', async () => {
    const shirt = await createProduct(site, { price: 100, stock_quantity: 10, variants: [SIZE] });
    const res = await checkout(buyer, codBody([{ id: shirt.id, quantity: 3 }]));
    expect(res.status).toBe(200);
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(300);
  });

  it.each([
    [{ size: 'XL' }],
    [{ 'Розмір': 'XXL' }],
    [{ priceModifier: 50 }],
  ])('D-BIZ-01: невідомий варіант %j — 400, замовлення не створюється', async (options) => {
    const shirt = await createProduct(site, { price: 100, stock_quantity: 10, variants: [SIZE] });
    const res = await checkout(buyer, codBody([{ id: shirt.id, quantity: 1, options }]));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('недоступний');
    expect(await countOrders()).toBe(0);
  });

  it('D-BIZ-01: товар без варіантів відхиляє довільні опції', async () => {
    const res = await checkout(buyer, codBody([{ id: product.id, quantity: 1, options: { size: 'XL', priceModifier: 50 } }]));
    expect(res.status).toBe(400);
    expect(await countOrders()).toBe(0);
  });

  it('D-BIZ-01: сума кількох позицій — сума цін позицій із їхніми знижками', async () => {
    const onSale = await createProduct(site, { price: 100, sale_percentage: 10, stock_quantity: 10 });
    const shirt = await createProduct(site, { price: 200, stock_quantity: 10, variants: [SIZE] });
    const res = await checkout(buyer, codBody([
      { id: onSale.id, quantity: 2 },
      { id: shirt.id, quantity: 1, options: { 'Розмір': 'XL' } },
    ]));
    expect(Number((await getOrder(res.body.orderId)).total_amount)).toBe(430);
  });

  it('D-BIZ-01: сума платежу LiqPay дорівнює ціні зі знижкою', async () => {
    const shop = await createSite(seller, { liqpay: LIQPAY });
    const onSale = await createProduct(shop, { price: 100, sale_percentage: 50, stock_quantity: 10 });
    const res = await checkout(buyer, {
      siteId: shop.id, items: [{ id: onSale.id, quantity: 1 }], paymentMethod: 'online', customerData: { address: ADDRESS },
    });
    expect(res.status).toBe(200);
    expect(decodeLiqpay(res.body.liqpayData).amount).toBe(50);
  });
});

// backend/tests/characterization/products.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { query } from '../helpers/testDb.js';
import {
  createUser, createSite, createProduct, createPage, createCategory, createOrder, addCollaborator,
  getProduct, getCategory, getReview, getOrderItems, countRows,
} from '../helpers/factories.js';

useTestDatabase();

const FILE_URL = 'https://files.test/secret-book.pdf';

let owner, editor, viewer, themeOnly, bare, stranger, buyer, site, product;

beforeEach(async () => {
  owner = await createUser();
  editor = await createUser();
  viewer = await createUser();
  themeOnly = await createUser();
  bare = await createUser();
  stranger = await createUser();
  buyer = await createUser();
  site = await createSite(owner, { site_path: 'acme-shop' });
  await addCollaborator(site, editor, 'editor', ['commerce']);
  await addCollaborator(site, viewer, 'viewer', ['commerce']);
  await addCollaborator(site, themeOnly, 'editor', ['theme']);
  await addCollaborator(site, bare, 'editor', []);
  product = await createProduct(site, { name: 'Кава', price: 150, stock_quantity: 10 });
});

const actor = (name) => ({ anon: null, stranger, bare, themeOnly, viewer, editor, owner })[name];
const DENIED_WRITERS = ['viewer', 'themeOnly', 'bare'];
const withAuth = (req, user) => (user ? req.set(authHeader(user)) : req);

const addProduct = (user, body) => withAuth(request(app).post('/api/products'), user).send(body);
const updateProduct = (user, id, body) => withAuth(request(app).put(`/api/products/${id}`), user).send(body);
const deleteProduct = (user, id) => withAuth(request(app).delete(`/api/products/${id}`), user);

describe('публічні маршрути товарів', () => {
  it('GET /api/products/:id повертає товар із даними сайту, категоріями й рейтингом', async () => {
    const res = await request(app).get(`/api/products/${product.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: product.id,
      site_id: site.id,
      name: 'Кава',
      type: 'physical',
      stock_quantity: 10,
      site_path: 'acme-shop',
      user_id: owner.id,
      categories: [],
      average_rating: 0,
      review_count: 0,
      image_gallery: [],
      variants: null,
    });
    expect(Number(res.body.price)).toBe(150);
  });

  it('неіснуючий товар — 404', async () => {
    const res = await request(app).get('/api/products/999999');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Товар не знайдено.');
  });

  it('GET /api/products/site/:siteId повертає товари сайту з категоріями', async () => {
    const category = await createCategory(site, { name: 'Напої', discount_percentage: 5, icon: 'cup' });
    await query('INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)', [product.id, category.id]);
    await createProduct(await createSite(stranger), { name: 'Чужий товар' });
    const res = await request(app).get(`/api/products/site/${site.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].categories).toEqual([{ id: category.id, name: 'Напої', discount_percentage: 5, icon: 'cup' }]);
  });

  describe('GET /api/products з фільтрами', () => {
    let tea, juice, category;

    beforeEach(async () => {
      tea = await createProduct(site, { name: 'Чай' });
      juice = await createProduct(site, { name: 'Сік' });
      category = await createCategory(site, { name: 'Напої' });
      await query('INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)', [juice.id, category.id]);
    });

    const names = (res) => res.body.map((p) => p.name).sort();

    it('за списком ідентифікаторів', async () => {
      const res = await request(app).get(`/api/products?ids=${tea.id},${juice.id}`);
      expect(names(res)).toEqual(['Сік', 'Чай']);
    });

    it('за сайтом', async () => {
      const res = await request(app).get(`/api/products?siteId=${site.id}`);
      expect(names(res)).toEqual(['Кава', 'Сік', 'Чай']);
    });

    it('за категорією', async () => {
      const res = await request(app).get(`/api/products?category=${category.id}`);
      expect(names(res)).toEqual(['Сік']);
    });

    it('з обмеженням кількості', async () => {
      const res = await request(app).get(`/api/products?siteId=${site.id}&limit=2`);
      expect(res.body).toHaveLength(2);
    });
  });
});

describe('цифрові товари: посилання на файл у публічній видачі', () => {
  let digital;

  beforeEach(async () => {
    digital = await createProduct(site, { name: 'Електронна книга', type: 'digital', price: 500, digital_file_url: FILE_URL });
    await createPage(site, { slug: 'home', is_homepage: 1 });
  });

  // KNOWN-DEFECT D-SEC-14: digital_file_url входить у відповіді публічних маршрутів, тож файл доступний без покупки.
  it('KNOWN-DEFECT D-SEC-14: GET /api/products/:id віддає digital_file_url без токена', async () => {
    const res = await request(app).get(`/api/products/${digital.id}`);
    expect(res.body.digital_file_url).toBe(FILE_URL);
  });

  it('KNOWN-DEFECT D-SEC-14: GET /api/products/site/:siteId віддає digital_file_url без токена', async () => {
    const res = await request(app).get(`/api/products/site/${site.id}`);
    expect(res.body.find((p) => p.id === digital.id).digital_file_url).toBe(FILE_URL);
  });

  it('KNOWN-DEFECT D-SEC-14: GET /api/products?siteId= віддає digital_file_url без токена', async () => {
    const res = await request(app).get(`/api/products?siteId=${site.id}`);
    expect(res.body.find((p) => p.id === digital.id).digital_file_url).toBe(FILE_URL);
  });

  it('KNOWN-DEFECT D-SEC-14: GET /api/sites/:site_path віддає digital_file_url у списку товарів', async () => {
    const res = await request(app).get('/api/sites/acme-shop');
    expect(res.body.products.find((p) => p.id === digital.id).digital_file_url).toBe(FILE_URL);
  });
});

describe('POST /api/products', () => {
  const BODY = () => ({ site_id: site.id, name: 'Чай', description: 'Зелений чай', price: 99.5, stock_quantity: 3, sale_percentage: 10 });

  it('без токена — 401', async () => {
    expect((await addProduct(null, BODY())).status).toBe(401);
  });

  it('власник створює товар; у відповіді повний запис товару', async () => {
    const res = await addProduct(owner, BODY());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      site_id: site.id, name: 'Чай', description: 'Зелений чай', type: 'physical', stock_quantity: 3, sale_percentage: 10, categories: [],
    });
    expect(Number(res.body.price)).toBe(99.5);
    expect(await getProduct(res.body.id)).toMatchObject({ name: 'Чай', stock_quantity: 3 });
  });

  it('D-ARC-14: галерея зберігається повністю й одним шаром JSON (раніше — лише перше зображення в подвійному кодуванні)', async () => {
    const res = await addProduct(owner, { ...BODY(), image_gallery: ['/uploads/a.png', '/uploads/b.png'] });
    expect(res.status).toBe(201);
    expect((await getProduct(res.body.id)).image_gallery).toEqual(['/uploads/a.png', '/uploads/b.png']);
  });

  it('прив\'язує товар до категорій', async () => {
    const category = await createCategory(site, { name: 'Напої' });
    const res = await addProduct(owner, { ...BODY(), category_ids: [category.id] });
    expect(res.status).toBe(201);
    expect(res.body.categories.map((c) => c.name)).toEqual(['Напої']);
  });

  it('цифровий товар зберігає посилання на файл', async () => {
    const res = await addProduct(owner, { ...BODY(), type: 'digital', digital_file_url: FILE_URL });
    expect(res.status).toBe(201);
    expect(await getProduct(res.body.id)).toMatchObject({ type: 'digital', digital_file_url: FILE_URL });
  });

  it('числа у вигляді рядків розбираються, порожній залишок означає «без обмежень»', async () => {
    const res = await addProduct(owner, { ...BODY(), price: '150', stock_quantity: '' });
    expect(res.status).toBe(201);
    const row = await getProduct(res.body.id);
    expect(Number(row.price)).toBe(150);
    expect(row.stock_quantity).toBeNull();
  });

  it('D-BIZ-10: залишок 0 при створенні зберігається як 0, товар не стає необмеженим', async () => {
    const res = await addProduct(owner, { ...BODY(), stock_quantity: 0 });
    expect(res.status).toBe(201);
    expect((await getProduct(res.body.id)).stock_quantity).toBe(0);
  });

  it.each([['abc'], [-1], ['1.5']])('D-BIZ-10: залишок %j відхиляється, а не стає «без обмежень»', async (stock) => {
    const res = await addProduct(owner, { ...BODY(), stock_quantity: stock });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Залишок товару має бути цілим числом не менше 0.');
    expect(await countRows('products', 'site_id = ?', [site.id])).toBe(1);
  });

  it('D-BIZ-11: від\'ємна ціна відхиляється', async () => {
    const res = await addProduct(owner, { ...BODY(), price: -50 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Ціна товару має бути числом від 0 до 99999999.99.');
    expect(await countRows('products', 'site_id = ?', [site.id])).toBe(1);
  });

  it.each([[150], [-1], ['abc']])('D-BIZ-11: знижка %j відхиляється', async (sale) => {
    const res = await addProduct(owner, { ...BODY(), sale_percentage: sale });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Знижка товару має бути від 0 до 100 %.');
    expect(await countRows('products', 'site_id = ?', [site.id])).toBe(1);
  });

  it('D-BIZ-11: знижка 100 % і ціна 0 допустимі', async () => {
    const res = await addProduct(owner, { ...BODY(), price: 0, sale_percentage: 100 });
    expect(res.status).toBe(201);
    expect(res.body.sale_percentage).toBe(100);
  });

  it('D-BIZ-11: невідомий тип товару відхиляється', async () => {
    const res = await addProduct(owner, { ...BODY(), type: 'gift' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Недопустимий тип товару.');
  });

  it('KNOWN-DEFECT D-ARC-10: без назви — 500 із текстом помилки БД', async () => {
    const res = await addProduct(owner, { site_id: site.id, price: 10 });
    expect(res.status).toBe(500);
    expect(res.body.message).toContain('cannot be null');
  });

  it('D-BIZ-03: 50-й товар на тарифі FREE створюється, 51-й — 403', async () => {
    for (let i = 0; i < 48; i++) await createProduct(site);
    const fiftieth = await addProduct(owner, BODY());
    expect(fiftieth.status).toBe(201);
    expect(await countRows('products', 'site_id = ?', [site.id])).toBe(50);
    const res = await addProduct(owner, BODY());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Досягнуто ліміту товарів (50) на тарифі власника сайту.');
    expect(await countRows('products', 'site_id = ?', [site.id])).toBe(50);
  });

  it('D-BIZ-03: співавтор не обходить ліміт власника', async () => {
    for (let i = 0; i < 49; i++) await createProduct(site);
    const res = await addProduct(editor, BODY());
    expect(res.status).toBe(403);
    expect(await countRows('products', 'site_id = ?', [site.id])).toBe(50);
  });

  it('D-BIZ-03: ліміт рахується за сайтом, товари іншого сайту не враховуються', async () => {
    const other = await createSite(owner);
    for (let i = 0; i < 50; i++) await createProduct(other);
    const res = await addProduct(owner, BODY());
    expect(res.status).toBe(201);
  });

  it('D-BIZ-03: на тарифі PLUS дозволено 200 товарів, ліміт береться з тарифу власника', async () => {
    const plusOwner = await createUser({ plan: 'PLUS' });
    const plusSite = await createSite(plusOwner);
    for (let i = 0; i < 60; i++) await createProduct(plusSite);
    const res = await addProduct(plusOwner, { ...BODY(), site_id: plusSite.id });
    expect(res.status).toBe(201);
  });

  it('D-BIZ-03: тариф ADMIN без обмежень', async () => {
    const admin = await createUser({ plan: 'ADMIN' });
    const adminSite = await createSite(admin);
    for (let i = 0; i < 205; i++) await createProduct(adminSite);
    const res = await addProduct(admin, { ...BODY(), site_id: adminSite.id });
    expect(res.status).toBe(201);
  });

  it('сторонній користувач — 403', async () => {
    const res = await addProduct(stranger, BODY());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав для додавання товарів на цей сайт.');
  });

  it('неіснуючий сайт — 403', async () => {
    const res = await addProduct(owner, { ...BODY(), site_id: 999999 });
    expect(res.status).toBe(403);
  });

  it('D-SEC-06: редактор із секцією commerce додає товар', async () => {
    const res = await addProduct(editor, BODY());
    expect(res.status).toBe(201);
  });

  it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не додає товар', async (who) => {
    const res = await addProduct(actor(who), BODY());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав для додавання товарів на цей сайт.');
    expect(await countRows('products', 'site_id = ?', [site.id])).toBe(1);
  });
});

describe('PUT /api/products/:productId', () => {
  const BODY = { name: 'Кава преміум', description: 'Нова', price: 200, stock_quantity: 5, sale_percentage: 15, type: 'physical' };

  it('власник змінює товар', async () => {
    const res = await updateProduct(owner, product.id, BODY);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Товар успішно оновлено.');
    const row = await getProduct(product.id);
    expect(row).toMatchObject({ name: 'Кава преміум', description: 'Нова', stock_quantity: 5, sale_percentage: 15 });
    expect(Number(row.price)).toBe(200);
  });

  it('D-ARC-14: галерея при оновленні записується одним шаром JSON', async () => {
    const res = await updateProduct(owner, product.id, { ...BODY, image_gallery: ['/uploads/x.png', '/uploads/y.png'] });
    expect(res.status).toBe(200);
    expect((await getProduct(product.id)).image_gallery).toEqual(['/uploads/x.png', '/uploads/y.png']);
  });

  it('при оновленні залишок 0 зберігається як 0 (на відміну від створення, D-BIZ-10)', async () => {
    await updateProduct(owner, product.id, { ...BODY, stock_quantity: 0 });
    expect((await getProduct(product.id)).stock_quantity).toBe(0);
  });

  it('категорії: без category_ids зберігаються, зі списком замінюються, з порожнім списком знімаються', async () => {
    const first = await createCategory(site, { name: 'Перша' });
    const second = await createCategory(site, { name: 'Друга' });
    await query('INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)', [product.id, first.id]);
    const linked = async () => (await query('SELECT category_id FROM product_categories WHERE product_id = ?', [product.id])).map((r) => r.category_id);

    await updateProduct(owner, product.id, BODY);
    expect(await linked()).toEqual([first.id]);
    await updateProduct(owner, product.id, { ...BODY, category_ids: [second.id] });
    expect(await linked()).toEqual([second.id]);
    await updateProduct(owner, product.id, { ...BODY, category_ids: [] });
    expect(await linked()).toEqual([]);
  });

  it('D-BIZ-11: запит лише з name змінює назву, решта полів зберігається', async () => {
    const digital = await createProduct(site, {
      name: 'Книга', type: 'digital', price: 500, stock_quantity: 7, digital_file_url: FILE_URL, sale_percentage: 10,
    });
    await query("UPDATE products SET description = 'Опис книги', variants = ? WHERE id = ?", [JSON.stringify([{ name: 'Формат', values: [{ label: 'PDF' }] }]), digital.id]);
    const res = await updateProduct(owner, digital.id, { name: 'Книга (нова назва)' });
    expect(res.status).toBe(200);
    const row = await getProduct(digital.id);
    expect(row.name).toBe('Книга (нова назва)');
    expect(Number(row.price)).toBe(500);
    expect(row).toMatchObject({
      description: 'Опис книги', type: 'digital', digital_file_url: FILE_URL, stock_quantity: 7, sale_percentage: 10,
      variants: [{ name: 'Формат', values: [{ label: 'PDF' }] }],
    });
  });

  it('D-BIZ-11: явний null у залишку знімає облік, null у variants очищає варіанти', async () => {
    await query("UPDATE products SET variants = ? WHERE id = ?", [JSON.stringify([{ name: 'Розмір', values: [] }]), product.id]);
    const res = await updateProduct(owner, product.id, { stock_quantity: null, variants: null });
    expect(res.status).toBe(200);
    const row = await getProduct(product.id);
    expect(row.stock_quantity).toBeNull();
    expect(row.variants).toBeNull();
    expect(row.name).toBe('Кава');
  });

  it.each([
    [{ price: -1 }, 'Ціна товару має бути числом від 0 до 99999999.99.'],
    [{ sale_percentage: 101 }, 'Знижка товару має бути від 0 до 100 %.'],
    [{ stock_quantity: -3 }, 'Залишок товару має бути цілим числом не менше 0.'],
    [{ type: 'gift' }, 'Недопустимий тип товару.'],
  ])('D-BIZ-11: %j відхиляється, товар не змінюється', async (change, message) => {
    const res = await updateProduct(owner, product.id, { name: 'Інша назва', ...change });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    const row = await getProduct(product.id);
    expect(row.name).toBe('Кава');
    expect(Number(row.price)).toBe(150);
  });

  it('неіснуючий товар — 404', async () => {
    const res = await updateProduct(owner, 999999, BODY);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Товар не знайдено.');
  });

  it('сторонній користувач — 403', async () => {
    const res = await updateProduct(stranger, product.id, BODY);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав для зміни цього товару.');
    expect((await getProduct(product.id)).name).toBe('Кава');
  });

  it('без токена — 401', async () => {
    expect((await updateProduct(null, product.id, BODY)).status).toBe(401);
  });

  it('D-SEC-06: редактор із секцією commerce змінює товар', async () => {
    const res = await updateProduct(editor, product.id, BODY);
    expect(res.status).toBe(200);
    expect((await getProduct(product.id)).name).toBe('Кава преміум');
  });

  it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не змінює товар', async (who) => {
    const res = await updateProduct(actor(who), product.id, BODY);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав для зміни цього товару.');
    expect((await getProduct(product.id)).name).toBe('Кава');
  });
});

describe('DELETE /api/products/:productId', () => {
  it('власник видаляє товар; позиція в замовленні лишається без посилання на товар', async () => {
    const order = await createOrder(site, buyer, { status: 'paid', items: [{ product, quantity: 2 }] });
    const res = await deleteProduct(owner, product.id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Товар успішно видалено.');
    expect(await getProduct(product.id)).toBeUndefined();
    const items = await getOrderItems(order.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ product_id: null, product_name: product.name, quantity: 2 });
  });

  it('неіснуючий товар — 404', async () => {
    const res = await deleteProduct(owner, 999999);
    expect(res.status).toBe(404);
  });

  it('сторонній користувач — 403, товар лишається', async () => {
    const res = await deleteProduct(stranger, product.id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав для видалення товарів на цьому сайті.');
    expect(await getProduct(product.id)).toBeDefined();
  });

  it('без токена — 401', async () => {
    expect((await deleteProduct(null, product.id)).status).toBe(401);
  });

  it('D-SEC-06: редактор із секцією commerce видаляє товар', async () => {
    const res = await deleteProduct(editor, product.id);
    expect(res.status).toBe(200);
    expect(await getProduct(product.id)).toBeUndefined();
  });

  it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не видаляє товар', async (who) => {
    const res = await deleteProduct(actor(who), product.id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав для видалення товарів на цьому сайті.');
    expect(await getProduct(product.id)).toBeDefined();
  });
});

describe('DELETE /api/products/:productId/gallery', () => {
  const removeImage = (user, id, body) => withAuth(request(app).delete(`/api/products/${id}/gallery`), user).send(body);

  it('без imagePath — 400', async () => {
    const res = await removeImage(owner, product.id, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Шлях до зображення не вказано.');
  });

  it('неіснуючий товар — 404', async () => {
    const res = await removeImage(owner, 999999, { imagePath: '/uploads/a.png' });
    expect(res.status).toBe(404);
  });

  it('сторонній користувач — 403', async () => {
    const res = await removeImage(stranger, product.id, { imagePath: '/uploads/a.png' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав для зміни цього товару.');
  });

  it('D-DEAD-08: видалення зображення з галереї змінює лише галерею, решта полів товару зберігається', async () => {
    await query('UPDATE products SET image_gallery = ? WHERE id = ?', [JSON.stringify(['/uploads/a.png', '/uploads/b.png']), product.id]);
    const res = await removeImage(owner, product.id, { imagePath: '/uploads/a.png' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Зображення видалено з галереї.', image_gallery: ['/uploads/b.png'] });
    const row = await getProduct(product.id);
    expect(row.name).toBe('Кава');
    expect(Number(row.price)).toBe(150);
    expect(row.stock_quantity).toBe(10);
    expect(row.image_gallery).toEqual(['/uploads/b.png']);
  });
});

describe('категорії', () => {
  const addCategory = (user, body) => withAuth(request(app).post('/api/categories'), user).send(body);
  const updateCategory = (user, id, body) => withAuth(request(app).put(`/api/categories/${id}`), user).send(body);
  const deleteCategory = (user, id) => withAuth(request(app).delete(`/api/categories/${id}`), user);

  describe('GET /api/categories/site/:siteId', () => {
    it('публічно віддає категорії сайту за назвою', async () => {
      await createCategory(site, { name: 'Б-категорія' });
      await createCategory(site, { name: 'А-категорія' });
      await createCategory(await createSite(stranger), { name: 'Чужа' });
      const res = await request(app).get(`/api/categories/site/${site.id}`);
      expect(res.status).toBe(200);
      expect(res.body.map((c) => c.name)).toEqual(['А-категорія', 'Б-категорія']);
    });
  });

  describe('POST /api/categories', () => {
    it('власник створює категорію; назва обрізається', async () => {
      const res = await addCategory(owner, { siteId: site.id, name: ' Напої ', discount_percentage: 10, icon: 'cup' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: expect.any(Number), site_id: site.id, name: 'Напої', discount_percentage: 10, icon: 'cup' });
      expect((await getCategory(res.body.id)).name).toBe('Напої');
    });

    it('знижка й іконка за замовчуванням', async () => {
      const res = await addCategory(owner, { siteId: site.id, name: 'Їжа' });
      expect(res.body).toMatchObject({ discount_percentage: 0, icon: 'folder' });
    });

    // KNOWN-DEFECT D-ARC-10: помилки валідації з моделі повертаються як 500.
    it('KNOWN-DEFECT D-ARC-10: повторна назва — 500', async () => {
      await createCategory(site, { name: 'Напої' });
      const res = await addCategory(owner, { siteId: site.id, name: 'Напої' });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Категорія з такою назвою вже існує для цього сайту.');
    });

    it('KNOWN-DEFECT D-ARC-10: порожня назва — 500', async () => {
      const res = await addCategory(owner, { siteId: site.id, name: '  ' });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Помилка під час створення категорії: Назва категорії не може бути порожньою.');
    });

    it('D-BIZ-03: 20-та категорія на тарифі FREE створюється, 21-ша — 403', async () => {
      for (let i = 0; i < 19; i++) await createCategory(site);
      const twentieth = await addCategory(owner, { siteId: site.id, name: 'Двадцята' });
      expect(twentieth.status).toBe(201);
      const res = await addCategory(owner, { siteId: site.id, name: 'Двадцять перша' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Досягнуто ліміту категорій (20) на тарифі власника сайту.');
      expect(await countRows('categories', 'site_id = ?', [site.id])).toBe(20);
    });

    it('D-BIZ-03: співавтор не обходить ліміт власника', async () => {
      for (let i = 0; i < 20; i++) await createCategory(site);
      const res = await addCategory(editor, { siteId: site.id, name: 'Двадцять перша' });
      expect(res.status).toBe(403);
    });

    it('D-BIZ-03: на тарифі PLUS дозволено 100 категорій', async () => {
      const plusOwner = await createUser({ plan: 'PLUS' });
      const plusSite = await createSite(plusOwner);
      for (let i = 0; i < 25; i++) await createCategory(plusSite);
      const res = await addCategory(plusOwner, { siteId: plusSite.id, name: 'Ще одна' });
      expect(res.status).toBe(201);
    });

    it.each([[150], [-5], [10.5], ['abc']])('D-BIZ-11: знижка категорії %j відхиляється', async (discount) => {
      const res = await addCategory(owner, { siteId: site.id, name: 'Напої', discount_percentage: discount });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Знижка категорії має бути цілим числом від 0 до 100 %.');
      expect(await countRows('categories', 'site_id = ?', [site.id])).toBe(0);
    });

    it('сторонній користувач — 403', async () => {
      const res = await addCategory(stranger, { siteId: site.id, name: 'Напої' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('У вас немає прав для додавання категорій на цей сайт.');
    });

    it('без токена — 401', async () => {
      expect((await addCategory(null, { siteId: site.id, name: 'Напої' })).status).toBe(401);
    });

    it('D-SEC-06: редактор із секцією commerce створює категорію', async () => {
      const res = await addCategory(editor, { siteId: site.id, name: 'Напої' });
      expect(res.status).toBe(201);
    });

    it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не створює категорію', async (who) => {
      const res = await addCategory(actor(who), { siteId: site.id, name: 'Напої' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('У вас немає прав для додавання категорій на цей сайт.');
      expect(await countRows('categories', 'site_id = ?', [site.id])).toBe(0);
    });
  });

  describe('PUT /api/categories/:categoryId', () => {
    let category;
    beforeEach(async () => {
      category = await createCategory(site, { name: 'Напої' });
    });

    it('власник змінює категорію', async () => {
      const res = await updateCategory(owner, category.id, { name: 'Гарячі напої', discount_percentage: 5, icon: 'star' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Категорію оновлено.');
      expect(await getCategory(category.id)).toMatchObject({ name: 'Гарячі напої', discount_percentage: 5, icon: 'star' });
    });

    it.each([[101], [-1], [2.5]])('D-BIZ-11: знижка категорії %j відхиляється, категорія не змінюється', async (discount) => {
      const res = await updateCategory(owner, category.id, { name: 'Гарячі напої', discount_percentage: discount });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Знижка категорії має бути цілим числом від 0 до 100 %.');
      expect((await getCategory(category.id)).name).toBe('Напої');
    });

    it('порожня назва — 400 (перевіряється раніше за існування категорії)', async () => {
      const res = await updateCategory(owner, 999999, { name: ' ' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Назва категорії не може бути порожньою.');
    });

    it('неіснуюча категорія — 404', async () => {
      const res = await updateCategory(owner, 999999, { name: 'Нова' });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Категорію не знайдено.');
    });

    it('KNOWN-DEFECT D-ARC-10: назва, що вже є на сайті, — 500', async () => {
      await createCategory(site, { name: 'Їжа' });
      const res = await updateCategory(owner, category.id, { name: 'Їжа' });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Категорія з такою назвою вже існує для цього сайту.');
    });

    it('сторонній користувач — 403', async () => {
      const res = await updateCategory(stranger, category.id, { name: 'Нова' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('У вас немає прав на редагування цієї категорії.');
    });

    it('D-SEC-06: редактор із секцією commerce змінює категорію — ті самі правила, що й для створення', async () => {
      const res = await updateCategory(editor, category.id, { name: 'Нова' });
      expect(res.status).toBe(200);
      expect((await getCategory(category.id)).name).toBe('Нова');
    });

    it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не змінює категорію', async (who) => {
      const res = await updateCategory(actor(who), category.id, { name: 'Нова' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('У вас немає прав на редагування цієї категорії.');
      expect((await getCategory(category.id)).name).toBe('Напої');
    });
  });

  describe('DELETE /api/categories/:categoryId', () => {
    let category;
    beforeEach(async () => {
      category = await createCategory(site, { name: 'Напої' });
    });

    it('власник видаляє категорію; товар лишається без зв\'язку з нею', async () => {
      await query('INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)', [product.id, category.id]);
      const res = await deleteCategory(owner, category.id);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Категорію успішно видалено.');
      expect(await getCategory(category.id)).toBeUndefined();
      expect(await countRows('product_categories')).toBe(0);
      expect(await getProduct(product.id)).toBeDefined();
    });

    it('неіснуюча категорія — 404', async () => {
      const res = await deleteCategory(owner, 999999);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Категорію не знайдено.');
    });

    it('сторонній користувач — 403', async () => {
      const res = await deleteCategory(stranger, category.id);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('У вас немає прав на видалення цієї категорії.');
      expect(await getCategory(category.id)).toBeDefined();
    });

    it('D-SEC-06: редактор із секцією commerce видаляє категорію', async () => {
      const res = await deleteCategory(editor, category.id);
      expect(res.status).toBe(200);
      expect(await getCategory(category.id)).toBeUndefined();
    });

    it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не видаляє категорію', async (who) => {
      const res = await deleteCategory(actor(who), category.id);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('У вас немає прав на видалення цієї категорії.');
      expect(await getCategory(category.id)).toBeDefined();
    });
  });
});

describe('відгуки на товари', () => {
  const reviewVia = (user, productId, body) => withAuth(request(app).post(`/api/products/${productId}/reviews`), user).send(body);
  const replyVia = (user, productId, reviewId, body) =>
    withAuth(request(app).put(`/api/products/${productId}/reviews/${reviewId}/reply`), user).send(body);
  const removeVia = (user, productId, reviewId) =>
    withAuth(request(app).delete(`/api/products/${productId}/reviews/${reviewId}`), user);

  const insertReview = async (forProduct, user, rating = 5, comment = 'Чудово') => {
    const result = await query(
      'INSERT INTO product_reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
      [forProduct.id, user.id, rating, comment]
    );
    return result.insertId;
  };
  const purchase = (user, status) => createOrder(site, user, { status, items: [{ product, quantity: 1 }] });

  describe('POST /api/products/:productId/reviews', () => {
    it.each(['paid', 'shipped', 'completed'])('покупець із замовленням у статусі %s залишає відгук', async (status) => {
      await purchase(buyer, status);
      const res = await reviewVia(buyer, product.id, { rating: 5, comment: 'Чудова кава' });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Відгук успішно додано.');
      expect(await countRows('product_reviews')).toBe(1);
    });

    it.each(['pending', 'cancelled'])('замовлення у статусі %s не дає права на відгук — 403', async (status) => {
      await purchase(buyer, status);
      const res = await reviewVia(buyer, product.id, { rating: 5, comment: 'Чудова кава' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Ви можете залишити відгук лише на товар, який ви придбали.');
    });

    it('без покупки — 403', async () => {
      const res = await reviewVia(stranger, product.id, { rating: 5, comment: 'Чудова кава' });
      expect(res.status).toBe(403);
    });

    it('повторний відгук оновлює попередній, а не додає новий', async () => {
      await purchase(buyer, 'paid');
      await reviewVia(buyer, product.id, { rating: 5, comment: 'Чудово' });
      await reviewVia(buyer, product.id, { rating: 2, comment: 'Не сподобалось' });
      const rows = await query('SELECT * FROM product_reviews');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ rating: 2, comment: 'Не сподобалось' });
    });

    it.each([
      ['без оцінки', { comment: 'Текст' }, 'Рейтинг має бути від 1 до 5.'],
      ['оцінка 0', { rating: 0, comment: 'Текст' }, 'Рейтинг має бути від 1 до 5.'],
      ['оцінка 6', { rating: 6, comment: 'Текст' }, 'Рейтинг має бути від 1 до 5.'],
      ['порожній коментар', { rating: 5, comment: '   ' }, 'Коментар не може бути порожнім.'],
      ['без коментаря', { rating: 5 }, 'Коментар не може бути порожнім.'],
    ])('%s — 400', async (_label, body, message) => {
      await purchase(buyer, 'paid');
      const res = await reviewVia(buyer, product.id, body);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(message);
    });

    it('неіснуючий товар — 404', async () => {
      const res = await reviewVia(buyer, 999999, { rating: 5, comment: 'Текст' });
      expect(res.status).toBe(404);
    });

    it('без токена — 401', async () => {
      expect((await reviewVia(null, product.id, { rating: 5, comment: 'Текст' })).status).toBe(401);
    });
  });

  describe('читання відгуків', () => {
    it('GET /api/products/:id/reviews публічно віддає відгуки з іменем автора', async () => {
      const id = await insertReview(product, buyer, 4, 'Добре');
      const res = await request(app).get(`/api/products/${product.id}/reviews`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id, product_id: product.id, user_id: buyer.id, rating: 4, comment: 'Добре', owner_reply: null, username: buyer.username });
    });

    it('середня оцінка й кількість відгуків входять до відповіді про товар', async () => {
      await insertReview(product, buyer, 5);
      await insertReview(product, stranger, 3);
      const res = await request(app).get(`/api/products/${product.id}`);
      expect(res.body).toMatchObject({ average_rating: 4, review_count: 2 });
    });

    it('purchase-status: покупка є, відгуку ще немає', async () => {
      await purchase(buyer, 'paid');
      const res = await withAuth(request(app).get(`/api/products/${product.id}/purchase-status`), buyer);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hasPurchased: true, hasReviewed: false, existingReview: null });
    });

    it('purchase-status: відгук уже залишено', async () => {
      await purchase(buyer, 'paid');
      await insertReview(product, buyer, 4, 'Добре');
      const res = await withAuth(request(app).get(`/api/products/${product.id}/purchase-status`), buyer);
      expect(res.body.hasPurchased).toBe(true);
      expect(res.body.hasReviewed).toBe(true);
      expect(res.body.existingReview).toMatchObject({ rating: 4, comment: 'Добре' });
    });

    it('purchase-status: без покупки', async () => {
      const res = await withAuth(request(app).get(`/api/products/${product.id}/purchase-status`), stranger);
      expect(res.body).toEqual({ hasPurchased: false, hasReviewed: false, existingReview: null });
    });

    it('purchase-status без токена — 401', async () => {
      expect((await request(app).get(`/api/products/${product.id}/purchase-status`)).status).toBe(401);
    });
  });

  describe('PUT /api/products/:productId/reviews/:reviewId/reply', () => {
    let reviewId;
    beforeEach(async () => {
      reviewId = await insertReview(product, buyer);
    });

    it('власник відповідає на відгук; порожня відповідь її видаляє', async () => {
      const res = await replyVia(owner, product.id, reviewId, { owner_reply: 'Дякуємо!' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Відповідь збережено.');
      expect((await getReview(reviewId)).owner_reply).toBe('Дякуємо!');
      await replyVia(owner, product.id, reviewId, { owner_reply: '' });
      expect((await getReview(reviewId)).owner_reply).toBeNull();
    });

    it('неіснуючий товар — 404', async () => {
      const res = await replyVia(owner, 999999, reviewId, { owner_reply: 'Дякуємо!' });
      expect(res.status).toBe(404);
    });

    it('сторонній користувач — 403', async () => {
      const res = await replyVia(stranger, product.id, reviewId, { owner_reply: 'Дякуємо!' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('У вас немає прав відповідати на відгуки цього магазину.');
      expect((await getReview(reviewId)).owner_reply).toBeNull();
    });

    it('D-SEC-06: редактор із секцією commerce відповідає від імені магазину', async () => {
      const res = await replyVia(editor, product.id, reviewId, { owner_reply: 'Відповідь співавтора' });
      expect(res.status).toBe(200);
      expect((await getReview(reviewId)).owner_reply).toBe('Відповідь співавтора');
    });

    it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не відповідає від імені магазину', async (who) => {
      const res = await replyVia(actor(who), product.id, reviewId, { owner_reply: 'Відповідь співавтора' });
      expect(res.status).toBe(403);
      expect((await getReview(reviewId)).owner_reply).toBeNull();
    });

    it('D-SEC-18: власник іншого сайту не може відповісти на відгук чужого товару, підставивши власний productId', async () => {
      const seller = await createUser();
      const ownProduct = await createProduct(await createSite(seller));
      const res = await replyVia(seller, ownProduct.id, reviewId, { owner_reply: 'Підроблена відповідь' });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Відгук не знайдено.');
      expect((await getReview(reviewId)).owner_reply).toBeNull();
    });

    it('D-SEC-18: власник сайту не відповідає на відгук іншого товару свого ж сайту через чужий productId', async () => {
      const second = await createProduct(site, { name: 'Чай' });
      const res = await replyVia(owner, second.id, reviewId, { owner_reply: 'Не той товар' });
      expect(res.status).toBe(404);
      expect((await getReview(reviewId)).owner_reply).toBeNull();
    });

    it('D-SEC-18: неіснуючий відгук — 404', async () => {
      const res = await replyVia(owner, product.id, 999999, { owner_reply: 'Дякуємо!' });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Відгук не знайдено.');
    });
  });

  describe('DELETE /api/products/:productId/reviews/:reviewId', () => {
    let reviewId;
    beforeEach(async () => {
      reviewId = await insertReview(product, buyer);
    });

    it.each([
      ['автор відгуку', () => buyer],
      ['власник сайту', () => owner],
      ['адміністратор платформи', () => ({ ...stranger, role: 'admin' })],
      ['модератор платформи', () => ({ ...stranger, role: 'moderator' })],
    ])('%s видаляє відгук', async (_label, who) => {
      const res = await removeVia(who(), product.id, reviewId);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Відгук видалено.');
      expect(await getReview(reviewId)).toBeUndefined();
    });

    it('сторонній користувач — 403', async () => {
      const res = await removeVia(stranger, product.id, reviewId);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('У вас немає прав для видалення цього відгуку.');
      expect(await getReview(reviewId)).toBeDefined();
    });

    it('неіснуючий відгук — 404', async () => {
      const res = await removeVia(owner, product.id, 999999);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Відгук не знайдено.');
    });

    it('D-SEC-06: редактор із секцією commerce видаляє відгук', async () => {
      const res = await removeVia(editor, product.id, reviewId);
      expect(res.status).toBe(200);
      expect(await getReview(reviewId)).toBeUndefined();
    });

    it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не видаляє відгук', async (who) => {
      const res = await removeVia(actor(who), product.id, reviewId);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('У вас немає прав для видалення цього відгуку.');
      expect(await getReview(reviewId)).toBeDefined();
    });

    it('D-SEC-18: власник іншого сайту не видаляє відгук чужого товару, підставивши власний productId', async () => {
      const seller = await createUser();
      const ownProduct = await createProduct(await createSite(seller));
      const res = await removeVia(seller, ownProduct.id, reviewId);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Відгук не знайдено.');
      expect(await getReview(reviewId)).toBeDefined();
    });

    it('D-SEC-18: автор відгуку не видаляє його через productId іншого товару', async () => {
      const second = await createProduct(site, { name: 'Чай' });
      const res = await removeVia(buyer, second.id, reviewId);
      expect(res.status).toBe(404);
      expect(await getReview(reviewId)).toBeDefined();
    });
  });
});

// Глобальні перемикачі платформи (middleware checkMaintenance): режим обслуговування й блокування редактора.
// Значення беруться з global_settings і кешуються на 30 с, тому тест після кожної зміни скидає кеш.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app, clearSettingsCache } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { createUser, createSite, createPage, setGlobalSetting, getPage } from '../helpers/factories.js';

useTestDatabase();

beforeEach(() => clearSettingsCache());
afterEach(() => clearSettingsCache());

const setting = async (name, value) => {
  await setGlobalSetting(name, value);
  clearSettingsCache();
};

describe('режим обслуговування (maintenance_mode)', () => {
  const MESSAGE = 'Платформа на технічному обслуговуванні. Ми скоро повернемося.';

  it('звичайний користувач отримує 503 на будь-якому маршруті, крім auth і admin', async () => {
    await setting('maintenance_mode', 1);
    const api = await request(app).get('/api/sites/default-logos');
    expect(api.status).toBe(503);
    expect(api.body).toEqual({ message: MESSAGE, maintenance_mode: true, retry_after: 3600 });
    expect(api.headers['x-maintenance-mode']).toBe('true');
    const root = await request(app).get('/');
    expect(root.status).toBe(503);
  });

  it('маршрути /api/auth і /api/admin обслуговуються й у режимі обслуговування', async () => {
    await setting('maintenance_mode', 1);
    const auth = await request(app).get('/api/auth/me');
    expect(auth.status).not.toBe(503);
    const admin = await request(app).get('/api/admin/dashboard-stats');
    expect(admin.status).not.toBe(503);
  });

  it('адміністратор (роль у токені) працює як зазвичай', async () => {
    await setting('maintenance_mode', 1);
    const admin = await createUser({ role: 'admin' });
    const res = await request(app).get('/api/sites/default-logos').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.headers['x-maintenance-mode']).toBe('false');
  });

  it('оголошення віддається в заголовку X-Global-Announcement у форматі base64', async () => {
    await setting('maintenance_message', 'Технічні роботи о 22:00');
    const res = await request(app).get('/api/sites/default-logos');
    expect(res.status).toBe(200);
    expect(Buffer.from(res.headers['x-global-announcement'], 'base64').toString('utf8')).toBe('Технічні роботи о 22:00');
  });
});

describe('блокування редактора (editor_locked)', () => {
  const LOCKED = 'Редактор тимчасово заблоковано для оновлення.';
  let owner, site, page;

  beforeEach(async () => {
    owner = await createUser({ plan: 'PLUS' });
    site = await createSite(owner, { site_path: 'acme-shop' });
    page = await createPage(site, { slug: 'home', is_homepage: 1, block_content: [{ block_id: 'b1', type: 'text', data: {} }] });
    await setting('editor_locked', 1);
  });

  it.each([
    ['PUT /api/pages/:id/content', (p) => request(app).put(`/api/pages/${p.id}/content`).send({ block_content: [] })],
    ['PUT /api/sites/:site_path/settings', () => request(app).put('/api/sites/acme-shop/settings').send({ title: 'Нова назва' })],
    ['POST /api/sites/create', () => request(app).post('/api/sites/create').send({ title: 'Магазин', sitePath: 'my-shop', isBlank: true })],
    ['DELETE /api/sites/:site_path', () => request(app).delete('/api/sites/acme-shop')],
  ])('%s для звичайного користувача — 503', async (_label, send) => {
    const res = await send(page).set(authHeader(owner));
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: LOCKED, editor_locked: true });
    expect(res.headers['x-editor-locked']).toBe('true');
    expect((await getPage(page.id)).block_content).toEqual([{ block_id: 'b1', type: 'text', data: {} }]);
  });

  it('читання не блокується', async () => {
    const res = await request(app).get('/api/sites/acme-shop').set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.page_id).toBe(page.id);
    expect(res.headers['x-editor-locked']).toBe('true');
  });

  it('адміністратор зберігає зміни як зазвичай', async () => {
    const admin = await createUser({ role: 'admin' });
    const adminSite = await createSite(admin, { site_path: 'admin-shop' });
    const adminPage = await createPage(adminSite, { slug: 'home', is_homepage: 1 });
    const res = await request(app)
      .put(`/api/pages/${adminPage.id}/content`)
      .set(authHeader(admin))
      .send({ block_content: [{ block_id: 'a1', type: 'text', data: {} }] });
    expect(res.status).toBe(200);
  });

  it('блокування охоплює лише /api/sites, /api/pages, /api/media й /api/upload: товари й категорії змінювати можна', async () => {
    const product = await request(app)
      .post('/api/products')
      .set(authHeader(owner))
      .send({ site_id: site.id, name: 'Кава', price: 100 });
    expect(product.status).toBe(201);
    const category = await request(app)
      .post('/api/categories')
      .set(authHeader(owner))
      .send({ siteId: site.id, name: 'Напої' });
    expect(category.status).toBe(201);
  });
});

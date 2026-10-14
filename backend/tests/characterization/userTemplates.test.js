// backend/tests/characterization/userTemplates.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import {
  createUser, createSite, createPage, createTemplate, addCollaborator, getTemplates, countRows,
} from '../helpers/factories.js';

useTestDatabase();

const SAVE_DENIED = { message: 'Сайт не знайдено або у вас немає прав.' };
const UPDATE_DENIED = { message: 'Сайт для оновлення шаблону не знайдено.' };

let owner, fullEditor, viewer, stranger, site;

beforeEach(async () => {
  owner = await createUser({ plan: 'PLUS' });
  fullEditor = await createUser();
  viewer = await createUser();
  stranger = await createUser();
  site = await createSite(owner, { site_path: 'acme-shop' });
  await createPage(site, { name: 'Головна', slug: 'home', is_homepage: 1, block_content: [{ id: 'b1', type: 'text' }] });
  await createPage(site, { name: 'Контакти', slug: 'contacts' });
  await addCollaborator(site, fullEditor, 'editor', ['editor', 'theme', 'commerce', 'overview', 'settings']);
  await addCollaborator(site, viewer, 'viewer', ['editor', 'overview']);
});

const actor = (name) => ({ stranger, viewer, fullEditor, owner })[name];
const templates = (method, url, user, body) => {
  const req = request(app)[method](`/api/user-templates${url}`);
  if (user) req.set(authHeader(user));
  return body === undefined ? req : req.send(body);
};
const personal = (user, overrides = {}) => createTemplate(user, {
  type: 'personal', is_ready: 0, access_level: 'private', content: { pages: [] }, ...overrides,
});

describe('POST /api/user-templates', () => {
  const save = (user, body) => templates('post', '', user, { siteId: site.id, templateName: 'Мій магазин', ...body });

  it('без токена — 401', async () => {
    expect((await save(null)).status).toBe(401);
  });

  it('без siteId або назви — 400', async () => {
    expect((await templates('post', '', owner, { templateName: 'Мій магазин' })).status).toBe(400);
    expect((await templates('post', '', owner, { siteId: site.id })).status).toBe(400);
    expect(await countRows('templates', 'user_id = ?', [owner.id])).toBe(0);
  });

  it('власник зберігає знімок сайту як особистий шаблон', async () => {
    const res = await save(owner, { description: 'Для друзів', icon: 'Store', category: 'Shop' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Шаблон успішно створено!' });
    const [row] = await getTemplates(owner.id);
    expect(row).toMatchObject({
      name: 'Мій магазин', description: 'Для друзів', icon: 'Store', category: 'Shop',
      type: 'personal', access_level: 'private', is_ready: 0,
    });
    expect(row.default_block_content.pages.map((p) => p.slug).sort()).toEqual(['contacts', 'home']);
    expect(row.default_block_content.pages.find((p) => p.slug === 'home').blocks).toEqual([{ id: 'b1', type: 'text' }]);
  });

  it.each(['fullEditor', 'viewer'])('D-SEC-06: співавтор %s не копіює весь сайт у власні шаблони', async (who) => {
    const user = actor(who);
    const res = await save(user);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(SAVE_DENIED);
    expect(await countRows('templates', 'user_id = ?', [user.id])).toBe(0);
  });

  it('D-SEC-06: сторонній користувач не зберігає чужий сайт', async () => {
    const res = await save(stranger);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(SAVE_DENIED);
    expect(await countRows('templates', 'user_id = ?', [stranger.id])).toBe(0);
  });

  it('неіснуючий сайт — 403', async () => {
    const res = await templates('post', '', owner, { siteId: 999999, templateName: 'Мій магазин' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(SAVE_DENIED);
  });
});

describe('PUT /api/user-templates/:id', () => {
  let template;

  beforeEach(async () => {
    template = await personal(owner, { name: 'Старий шаблон' });
  });

  const update = (user, id, body) => templates('put', `/${id}`, user, body);

  it('власник оновлює шаблон знімком сайту', async () => {
    const res = await update(owner, template.id, { siteId: site.id, templateName: 'Новий шаблон', description: 'Опис' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Шаблон та його структуру успішно оновлено!' });
    const [row] = await getTemplates(owner.id);
    expect(row).toMatchObject({ name: 'Новий шаблон', description: 'Опис' });
    expect(row.default_block_content.pages.map((p) => p.slug).sort()).toEqual(['contacts', 'home']);
  });

  it.each(['fullEditor', 'viewer'])('D-SEC-06: співавтор %s не підміняє шаблон знімком чужого сайту', async (who) => {
    const user = actor(who);
    const own = await personal(user, { name: 'Власний шаблон' });
    const res = await update(user, own.id, { siteId: site.id, templateName: 'Підміна' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(UPDATE_DENIED);
    const [row] = await getTemplates(user.id);
    expect(row.name).toBe('Власний шаблон');
    expect(row.default_block_content).toEqual({ pages: [] });
  });

  it('D-SEC-06: сторонній користувач не отримує знімок чужого сайту', async () => {
    const own = await personal(stranger, { name: 'Власний шаблон' });
    const res = await update(stranger, own.id, { siteId: site.id, templateName: 'Підміна' });
    expect(res.status).toBe(403);
    expect((await getTemplates(stranger.id))[0].default_block_content).toEqual({ pages: [] });
  });

  it('власник сайту не змінює шаблон іншого користувача — 404', async () => {
    const foreign = await personal(stranger, { name: 'Чужий шаблон' });
    const res = await update(owner, foreign.id, { siteId: site.id, templateName: 'Захоплення' });
    expect(res.status).toBe(404);
    const [row] = await getTemplates(stranger.id);
    expect(row.name).toBe('Чужий шаблон');
    expect(row.default_block_content).toEqual({ pages: [] });
  });

  it('без siteId оновлюється лише опис шаблону, структура не змінюється', async () => {
    const res = await update(owner, template.id, { templateName: 'Перейменований', description: 'Опис', icon: 'Star' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Інформацію про шаблон оновлено!' });
    const [row] = await getTemplates(owner.id);
    expect(row).toMatchObject({ name: 'Перейменований', description: 'Опис', icon: 'Star' });
    expect(row.default_block_content).toEqual({ pages: [] });
  });

  it('без siteId чужий шаблон — 404', async () => {
    const foreign = await personal(stranger, { name: 'Чужий шаблон' });
    const res = await update(owner, foreign.id, { templateName: 'Захоплення', description: '' });
    expect(res.status).toBe(404);
    expect((await getTemplates(stranger.id))[0].name).toBe('Чужий шаблон');
  });

  it('без токена — 401', async () => {
    expect((await update(null, template.id, { templateName: 'X' })).status).toBe(401);
  });
});

describe('GET і DELETE /api/user-templates', () => {
  it('список містить лише шаблони користувача', async () => {
    const mine = await personal(owner, { name: 'Мій' });
    await personal(stranger, { name: 'Чужий' });
    const res = await templates('get', '', owner);
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.id)).toEqual([mine.id]);
    expect(res.body[0].full_site_snapshot).toEqual({ pages: [] });
  });

  it('користувач видаляє власний шаблон', async () => {
    const mine = await personal(owner);
    const res = await templates('delete', `/${mine.id}`, owner);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Шаблон успішно видалено.' });
    expect(await getTemplates(owner.id)).toHaveLength(0);
  });

  it('чужий шаблон не видаляється — 404', async () => {
    const foreign = await personal(stranger);
    const res = await templates('delete', `/${foreign.id}`, owner);
    expect(res.status).toBe(404);
    expect(await getTemplates(stranger.id)).toHaveLength(1);
  });

  it('без токена — 401', async () => {
    expect((await templates('get', '', null)).status).toBe(401);
  });
});

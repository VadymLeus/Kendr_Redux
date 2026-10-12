// Сторінки сайту: список, створення, читання, збереження блоків, налаштування, видалення, головна сторінка.
// Фіксує D-BLK-05 (block_content зберігається без перевірки), D-SEC-06 (права співавторів не перевіряються),
// D-BIZ-12 (slug і назва сторінки не валідуються), D-ARC-10.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import {
  createUser, createSite, createPage, addCollaborator, getPage, getPages, countRows,
} from '../helpers/factories.js';

useTestDatabase();

const BLOCKS = [{ block_id: 'b1', type: 'text', data: { text: 'Привіт' } }];
const FORBIDDEN_EDIT = 'У вас немає прав на редагування цієї сторінки.';

let owner, editor, viewer, stranger, site, home, about;

beforeEach(async () => {
  owner = await createUser({ plan: 'PLUS' });
  editor = await createUser();
  viewer = await createUser();
  stranger = await createUser();
  site = await createSite(owner, { site_path: 'acme-shop', title: 'Акме' });
  await addCollaborator(site, editor, 'editor', []);
  await addCollaborator(site, viewer, 'viewer', []);
  home = await createPage(site, { name: 'Головна', slug: 'home', is_homepage: 1, block_content: BLOCKS });
  about = await createPage(site, { name: 'Про нас', slug: 'about', seo_title: 'Старий заголовок' });
});

const actor = (name) => ({ anon: null, stranger, viewer, editor, owner })[name];
const withAuth = (req, user) => (user ? req.set(authHeader(user)) : req);

const listPages = (user, siteId = site.id) => withAuth(request(app).get(`/api/sites/${siteId}/pages`), user);
const createPageVia = (user, body, siteId = site.id) => withAuth(request(app).post(`/api/sites/${siteId}/pages`), user).send(body);
const readPage = (user, pageId) => withAuth(request(app).get(`/api/pages/${pageId}`), user);
const saveContent = (user, pageId, body) => withAuth(request(app).put(`/api/pages/${pageId}/content`), user).send(body);
const saveSettings = (user, pageId, body) => withAuth(request(app).put(`/api/pages/${pageId}/settings`), user).send(body);
const removePage = (user, pageId) => withAuth(request(app).delete(`/api/pages/${pageId}`), user);
const setHome = (user, pageId) => withAuth(request(app).post(`/api/pages/${pageId}/set-home`), user);

describe('GET /api/sites/:siteId/pages', () => {
  it('без токена — 401', async () => {
    expect((await listPages(null)).status).toBe(401);
  });

  it('власник отримує список сторінок без вмісту блоків', async () => {
    const res = await listPages(owner);
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.slug).sort()).toEqual(['about', 'home']);
    expect(Object.keys(res.body[0]).sort()).toEqual(['created_at', 'id', 'is_homepage', 'name', 'slug']);
  });

  it.each(['editor', 'viewer'])('співавтор %s отримує список', async (who) => {
    expect((await listPages(actor(who))).status).toBe(200);
  });

  it('сторонній користувач — 403', async () => {
    const res = await listPages(stranger);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
  });
});

describe('POST /api/sites/:siteId/pages', () => {
  it('власник створює порожню сторінку', async () => {
    const res = await createPageVia(owner, { name: 'Контакти', slug: 'contacts' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(Number), name: 'Контакти', slug: 'contacts', block_content: [], is_homepage: 0 });
    expect(await getPage(res.body.id)).toMatchObject({ site_id: site.id, name: 'Контакти', slug: 'contacts', is_homepage: 0, block_content: [] });
  });

  it('без name або slug — 400', async () => {
    for (const body of [{ slug: 'contacts' }, { name: 'Контакти' }, {}]) {
      const res = await createPageVia(owner, body);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Назва (name) та шлях (slug) є обов'язковими.");
    }
  });

  it('поля перевіряються раніше за права: сторонній користувач із порожнім тілом отримує 400, а не 403', async () => {
    const res = await createPageVia(stranger, {});
    expect(res.status).toBe(400);
  });

  it('повторний slug на тому ж сайті — 400', async () => {
    const res = await createPageVia(owner, { name: 'Дубль', slug: 'about' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Сторінка з таким slug вже існує на цьому сайті.');
  });

  it('той самий slug на іншому сайті дозволений', async () => {
    const other = await createSite(owner);
    const res = await createPageVia(owner, { name: 'Про нас', slug: 'about' }, other.id);
    expect(res.status).toBe(201);
  });

  it('сторонній користувач — 403', async () => {
    const res = await createPageVia(stranger, { name: 'Контакти', slug: 'contacts' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
    expect(await countRows('pages', 'site_id = ?', [site.id])).toBe(2);
  });

  // KNOWN-DEFECT D-SEC-06: роль viewer не дає права змінювати вміст, але сервер її не перевіряє.
  it.each(['viewer', 'editor'])('KNOWN-DEFECT D-SEC-06: співавтор %s без прав створює сторінку', async (who) => {
    const res = await createPageVia(actor(who), { name: 'Контакти', slug: 'contacts' });
    expect(res.status).toBe(201);
  });

  // KNOWN-DEFECT D-BIZ-12: формат slug і довжина назви на сервері не перевіряються.
  it('KNOWN-DEFECT D-BIZ-12: slug довільного вигляду (кирилиця, пробіли, скісні риски, регістр) приймається', async () => {
    const res = await createPageVia(owner, { name: 'Про нас', slug: 'Про нас / 2' });
    expect(res.status).toBe(201);
    expect((await getPage(res.body.id)).slug).toBe('Про нас / 2');
  });

  // KNOWN-DEFECT D-BIZ-12, D-ARC-10: надто довга назва доходить до БД, помилка SQL повертається клієнту як 500.
  it('KNOWN-DEFECT D-BIZ-12: назва довша за 255 символів — 500 з текстом помилки БД', async () => {
    const res = await createPageVia(owner, { name: 'а'.repeat(256), slug: 'long-name' });
    expect(res.status).toBe(500);
    expect(res.body.message).toContain('Data too long');
  });
});

describe('GET /api/pages/:pageId', () => {
  it('без токена — 401', async () => {
    expect((await readPage(null, home.id)).status).toBe(401);
  });

  it('власник отримує сторінку з блоками', async () => {
    const res = await readPage(owner, home.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: home.id, site_id: site.id, slug: 'home', is_homepage: 1 });
    expect(res.body.block_content).toEqual(BLOCKS);
  });

  it.each(['editor', 'viewer'])('співавтор %s отримує сторінку', async (who) => {
    expect((await readPage(actor(who), home.id)).status).toBe(200);
  });

  it('сторонній користувач — 403', async () => {
    const res = await readPage(stranger, home.id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN_EDIT);
  });

  it('неіснуюча сторінка — теж 403, а не 404', async () => {
    const res = await readPage(owner, 999999);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN_EDIT);
  });
});

describe('PUT /api/pages/:pageId/content', () => {
  const NEW_BLOCKS = [
    { block_id: 'n1', type: 'heading', data: { text: 'Заголовок' } },
    { block_id: 'n2', type: 'text', data: { text: 'Текст' } },
  ];

  it('власник зберігає блоки', async () => {
    const res = await saveContent(owner, home.id, { block_content: NEW_BLOCKS });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Контент сторінки успішно оновлено.');
    expect((await getPage(home.id)).block_content).toEqual(NEW_BLOCKS);
  });

  it('без токена — 401', async () => {
    expect((await saveContent(null, home.id, { block_content: NEW_BLOCKS })).status).toBe(401);
  });

  it('сторонній користувач — 403, вміст не змінюється', async () => {
    const res = await saveContent(stranger, home.id, { block_content: NEW_BLOCKS });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN_EDIT);
    expect((await getPage(home.id)).block_content).toEqual(BLOCKS);
  });

  // KNOWN-DEFECT D-SEC-06
  it.each(['viewer', 'editor'])('KNOWN-DEFECT D-SEC-06: співавтор %s без прав змінює вміст сторінки', async (who) => {
    const res = await saveContent(actor(who), home.id, { block_content: NEW_BLOCKS });
    expect(res.status).toBe(200);
    expect((await getPage(home.id)).block_content).toEqual(NEW_BLOCKS);
  });

  // KNOWN-DEFECT D-BLK-05: block_content зберігається як є, без перевірки типу значення, переліку type і форми data.
  describe('KNOWN-DEFECT D-BLK-05: вміст без перевірки', () => {
    it('замість масиву блоків приймається об\'єкт', async () => {
      const res = await saveContent(owner, home.id, { block_content: { foo: 'bar' } });
      expect(res.status).toBe(200);
      expect((await getPage(home.id)).block_content).toEqual({ foo: 'bar' });
      const read = await readPage(owner, home.id);
      expect(read.body.block_content).toEqual({ foo: 'bar' });
    });

    it('невідомі типи блоків і довільні елементи масиву приймаються', async () => {
      const junk = [{ type: 'no-such-block', data: 'not-an-object' }, 42, null, 'текст'];
      const res = await saveContent(owner, home.id, { block_content: junk });
      expect(res.status).toBe(200);
      expect((await getPage(home.id)).block_content).toEqual(junk);
    });

    it('розмітка в полях блока зберігається без обробки', async () => {
      const blocks = [{ block_id: 'x1', type: 'text', data: { text: '<script>alert(1)</script>' } }];
      const res = await saveContent(owner, home.id, { block_content: blocks });
      expect(res.status).toBe(200);
      expect((await getPage(home.id)).block_content).toEqual(blocks);
    });

    it('запит без block_content стирає вміст сторінки (замінює порожнім масивом)', async () => {
      const res = await saveContent(owner, home.id, {});
      expect(res.status).toBe(200);
      expect((await getPage(home.id)).block_content).toEqual([]);
    });

    it('рядок, що не є JSON, зберігається й ламає читання сторінки в редакторі та на публічному сайті', async () => {
      const res = await saveContent(owner, home.id, { block_content: 'це не JSON' });
      expect(res.status).toBe(200);
      expect((await readPage(owner, home.id)).status).toBe(500);
      const publicRes = await request(app).get('/api/sites/acme-shop');
      expect(publicRes.status).toBe(500);
    });
  });

  it('неіснуюча сторінка — 403', async () => {
    const res = await saveContent(owner, 999999, { block_content: NEW_BLOCKS });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/pages/:pageId/settings', () => {
  const SETTINGS = { name: 'Контакти', slug: 'contacts', seo_title: 'SEO', seo_description: 'Опис', seo_keywords: 'a,b' };

  it('власник змінює назву, адресу й SEO-поля', async () => {
    const res = await saveSettings(owner, about.id, SETTINGS);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Налаштування сторінки оновлено.');
    expect(await getPage(about.id)).toMatchObject({
      name: 'Контакти', slug: 'contacts', seo_title: 'SEO', seo_description: 'Опис', seo_keywords: 'a,b',
    });
  });

  it('PUT заміщає SEO-поля: пропущені поля стають NULL', async () => {
    await saveSettings(owner, about.id, { name: 'Про нас', slug: 'about' });
    expect((await getPage(about.id)).seo_title).toBeNull();
  });

  it('без name або slug — 400', async () => {
    const res = await saveSettings(owner, about.id, { name: 'Контакти' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Назва (name) та шлях (slug) є обов'язковими.");
  });

  it('slug, що вже є на сайті — 400', async () => {
    const res = await saveSettings(owner, about.id, { name: 'Про нас', slug: 'home' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Сторінка з таким slug вже існує на цьому сайті.');
  });

  it('сторонній користувач — 403', async () => {
    const res = await saveSettings(stranger, about.id, SETTINGS);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
    expect((await getPage(about.id)).slug).toBe('about');
  });

  // KNOWN-DEFECT D-SEC-06
  it.each(['viewer', 'editor'])('KNOWN-DEFECT D-SEC-06: співавтор %s без прав змінює адресу сторінки', async (who) => {
    const res = await saveSettings(actor(who), about.id, SETTINGS);
    expect(res.status).toBe(200);
    expect((await getPage(about.id)).slug).toBe('contacts');
  });
});

describe('DELETE /api/pages/:pageId', () => {
  it('власник видаляє неголовну сторінку', async () => {
    const res = await removePage(owner, about.id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Сторінку успішно видалено.');
    expect(await getPage(about.id)).toBeUndefined();
  });

  it('головну сторінку видалити не можна — 400', async () => {
    const res = await removePage(owner, home.id);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Неможливо видалити головну сторінку.');
    expect(await getPage(home.id)).toBeDefined();
  });

  it('останню сторінку сайту видалити не можна — 400', async () => {
    const single = await createSite(owner);
    const only = await createPage(single, { slug: 'only', is_homepage: 0 });
    const res = await removePage(owner, only.id);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Неможливо видалити останню сторінку сайту.');
  });

  it('сторонній користувач — 403', async () => {
    const res = await removePage(stranger, about.id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
    expect(await getPage(about.id)).toBeDefined();
  });

  // KNOWN-DEFECT D-SEC-06
  it.each(['viewer', 'editor'])('KNOWN-DEFECT D-SEC-06: співавтор %s без прав видаляє сторінку', async (who) => {
    const res = await removePage(actor(who), about.id);
    expect(res.status).toBe(200);
    expect(await getPage(about.id)).toBeUndefined();
  });
});

describe('POST /api/pages/:pageId/set-home', () => {
  it('власник призначає головну сторінку: прапорець лишається лише на одній', async () => {
    const res = await setHome(owner, about.id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Головну сторінку оновлено.');
    const pages = await getPages(site.id);
    expect(pages.filter((p) => p.is_homepage === 1).map((p) => p.slug)).toEqual(['about']);
    const publicRes = await request(app).get('/api/sites/acme-shop');
    expect(publicRes.body.page_id).toBe(about.id);
  });

  it('сторонній користувач — 403', async () => {
    const res = await setHome(stranger, about.id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
    expect((await getPage(home.id)).is_homepage).toBe(1);
  });

  // KNOWN-DEFECT D-SEC-06
  it.each(['viewer', 'editor'])('KNOWN-DEFECT D-SEC-06: співавтор %s без прав змінює головну сторінку', async (who) => {
    const res = await setHome(actor(who), about.id);
    expect(res.status).toBe(200);
    expect((await getPage(about.id)).is_homepage).toBe(1);
  });
});

// backend/tests/characterization/pages.test.js
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

let owner, editor, viewer, themeOnly, bare, stranger, site, home, about;

beforeEach(async () => {
  owner = await createUser({ plan: 'PLUS' });
  editor = await createUser();
  viewer = await createUser();
  themeOnly = await createUser();
  bare = await createUser();
  stranger = await createUser();
  site = await createSite(owner, { site_path: 'acme-shop', title: 'Акме' });
  await addCollaborator(site, editor, 'editor', ['editor']);
  await addCollaborator(site, viewer, 'viewer', ['editor']);
  await addCollaborator(site, themeOnly, 'editor', ['theme']);
  await addCollaborator(site, bare, 'editor', []);
  home = await createPage(site, { name: 'Головна', slug: 'home', is_homepage: 1, block_content: BLOCKS });
  about = await createPage(site, { name: 'Про нас', slug: 'about', seo_title: 'Старий заголовок' });
});

const actor = (name) => ({ anon: null, stranger, bare, themeOnly, viewer, editor, owner })[name];
const DENIED_WRITERS = ['viewer', 'themeOnly', 'bare'];
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

  it.each(['editor', 'viewer', 'themeOnly'])('співавтор %s отримує список', async (who) => {
    expect((await listPages(actor(who))).status).toBe(200);
  });

  it('D-SEC-06: співавтор без жодних дозволів — 403', async () => {
    const res = await listPages(bare);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
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

  it('D-SEC-06: редактор із секцією editor створює сторінку', async () => {
    const res = await createPageVia(editor, { name: 'Контакти', slug: 'contacts' });
    expect(res.status).toBe(201);
    expect(await getPage(res.body.id)).toMatchObject({ site_id: site.id, slug: 'contacts' });
  });

  it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не створює сторінку', async (who) => {
    const res = await createPageVia(actor(who), { name: 'Контакти', slug: 'contacts' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
    expect(await countRows('pages', 'site_id = ?', [site.id])).toBe(2);
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

  it.each(['editor', 'viewer', 'themeOnly'])('співавтор %s отримує сторінку', async (who) => {
    expect((await readPage(actor(who), home.id)).status).toBe(200);
  });

  it('D-SEC-06: співавтор без жодних дозволів — 403', async () => {
    const res = await readPage(bare, home.id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN_EDIT);
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
    { block_id: 'n1', type: 'hero', data: { title: 'Заголовок' } },
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

  it('D-SEC-06: редактор із секцією editor змінює вміст сторінки', async () => {
    const res = await saveContent(editor, home.id, { block_content: NEW_BLOCKS });
    expect(res.status).toBe(200);
    expect((await getPage(home.id)).block_content).toEqual(NEW_BLOCKS);
  });

  it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не змінює вміст сторінки', async (who) => {
    const res = await saveContent(actor(who), home.id, { block_content: NEW_BLOCKS });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN_EDIT);
    expect((await getPage(home.id)).block_content).toEqual(BLOCKS);
  });

  it('D-SEC-06: співавтор іншого сайту не змінює вміст цієї сторінки', async () => {
    const otherOwner = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherOwner);
    const member = await createUser();
    await addCollaborator(otherSite, member, 'editor', ['editor']);
    const res = await saveContent(member, home.id, { block_content: NEW_BLOCKS });
    expect(res.status).toBe(403);
    expect((await getPage(home.id)).block_content).toEqual(BLOCKS);
  });

  // D-BLK-05: сервер перевіряє block_content (масив; block_id, type з blockTypes.js, data-об'єкт; layout рекурсивно).
  describe('D-BLK-05: перевірка вмісту', () => {
    const NOT_ARRAY = 'Вміст сторінки (block_content) має бути масивом блоків.';
    const unchanged = async () => expect((await getPage(home.id)).block_content).toEqual(BLOCKS);

    it('замість масиву блоків об\'єкт — 400, вміст не змінюється', async () => {
      const res = await saveContent(owner, home.id, { block_content: { foo: 'bar' } });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(NOT_ARRAY);
      await unchanged();
      expect((await readPage(owner, home.id)).body.block_content).toEqual(BLOCKS);
    });

    it.each([
      ['невідомий type', [{ block_id: 'x1', type: 'no-such-block', data: {} }]],
      ['type heading, якого немає в реєстрі', [{ block_id: 'x1', type: 'heading', data: { text: 'Т' } }]],
      ['data не об\'єкт', [{ block_id: 'x1', type: 'text', data: 'not-an-object' }]],
      ['немає block_id', [{ type: 'text', data: {} }]],
      ['довільні елементи масиву', [42, null, 'текст']],
    ])('%s — 400, вміст не змінюється', async (_name, junk) => {
      const res = await saveContent(owner, home.id, { block_content: junk });
      expect(res.status).toBe(400);
      await unchanged();
    });

    it('невідомий тип у колонці макета — 400', async () => {
      const blocks = [{ block_id: 'l1', type: 'layout', data: { columns: [[{ block_id: 'c1', type: 'evil', data: {} }]] } }];
      const res = await saveContent(owner, home.id, { block_content: blocks });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Блок [0].data.columns[0][0] має невідомий тип.');
      await unchanged();
    });

    it('макет із вкладеними блоками, шапка й підвал із порожнім data та старі імена типів зберігаються', async () => {
      const blocks = [
        { block_id: 'h', type: 'global-header', data: {} },
        { block_id: 'l1', type: 'layout', data: { columns: [[{ block_id: 'c1', type: 'text', data: { content: 'А' } }], []] } },
        { block_id: 'f', type: 'footer', data: {} },
      ];
      const res = await saveContent(owner, home.id, { block_content: blocks });
      expect(res.status).toBe(200);
      expect((await getPage(home.id)).block_content).toEqual(blocks);
    });

    it('вміст понад 2 МБ — 400', async () => {
      const blocks = [{ block_id: 'big', type: 'text', data: { content: 'x'.repeat(2 * 1024 * 1024) } }];
      const res = await saveContent(owner, home.id, { block_content: blocks });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Вміст сторінки перевищує 2 МБ.');
      await unchanged();
    });

    it('розмітка в полях блока зберігається як є: екранування виконується під час виведення (D-SEC-27)', async () => {
      const blocks = [{ block_id: 'x1', type: 'text', data: { text: '<script>alert(1)</script>' } }];
      const res = await saveContent(owner, home.id, { block_content: blocks });
      expect(res.status).toBe(200);
      expect((await getPage(home.id)).block_content).toEqual(blocks);
    });

    it('запит без block_content — 400, вміст сторінки не стирається', async () => {
      const res = await saveContent(owner, home.id, {});
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(NOT_ARRAY);
      await unchanged();
    });

    it('рядок, що не є JSON, — 400, сторінка лишається читабельною', async () => {
      const res = await saveContent(owner, home.id, { block_content: 'це не JSON' });
      expect(res.status).toBe(400);
      expect((await readPage(owner, home.id)).status).toBe(200);
      expect((await request(app).get('/api/sites/acme-shop')).status).toBe(200);
    });

    it('порожній масив дозволено: сторінку можна очистити', async () => {
      const res = await saveContent(owner, home.id, { block_content: [] });
      expect(res.status).toBe(200);
      expect((await getPage(home.id)).block_content).toEqual([]);
    });

    it('сторонній користувач із некоректним вмістом отримує 403, а не 400', async () => {
      const res = await saveContent(stranger, home.id, { block_content: 'це не JSON' });
      expect(res.status).toBe(403);
      await unchanged();
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

  it('D-SEC-06: редактор із секцією editor змінює адресу сторінки', async () => {
    const res = await saveSettings(editor, about.id, SETTINGS);
    expect(res.status).toBe(200);
    expect((await getPage(about.id)).slug).toBe('contacts');
  });

  it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не змінює адресу сторінки', async (who) => {
    const res = await saveSettings(actor(who), about.id, SETTINGS);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
    expect((await getPage(about.id)).slug).toBe('about');
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

  it('D-SEC-06: редактор із секцією editor видаляє сторінку', async () => {
    const res = await removePage(editor, about.id);
    expect(res.status).toBe(200);
    expect(await getPage(about.id)).toBeUndefined();
  });

  it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не видаляє сторінку', async (who) => {
    const res = await removePage(actor(who), about.id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
    expect(await getPage(about.id)).toBeDefined();
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

  it('D-SEC-06: редактор із секцією editor змінює головну сторінку', async () => {
    const res = await setHome(editor, about.id);
    expect(res.status).toBe(200);
    expect((await getPage(about.id)).is_homepage).toBe(1);
  });

  it.each(DENIED_WRITERS)('D-SEC-06: співавтор %s не змінює головну сторінку', async (who) => {
    const res = await setHome(actor(who), about.id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Доступ заборонено.');
    expect((await getPage(home.id)).is_homepage).toBe(1);
    expect((await getPage(about.id)).is_homepage).toBe(0);
  });
});

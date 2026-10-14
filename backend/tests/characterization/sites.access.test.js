// backend/tests/characterization/sites.access.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { query } from '../helpers/testDb.js';
import {
  createUser, createSite, createProduct, createPage, createCategory, createTemplate, createOrder,
  addCollaborator, setSiteLock, getSite, getPages, countRows, decryptKey,
} from '../helpers/factories.js';

useTestDatabase();

const BLOCKS = [{ block_id: 'b1', type: 'text', data: { text: 'Привіт' } }];
const TEMPLATE = {
  theme_settings: { mode: 'dark', accent: 'green' },
  header_content: [{ block_id: 'tpl-header', type: 'header', data: { site_title: 'Шаблон' } }],
  footer_content: [],
  pages: [
    { title: 'Головна', slug: 'home', blocks: [{ block_id: 'tpl-b1', type: 'text', data: {} }] },
    { title: 'Контакти', slug: 'contacts', blocks: [] },
  ],
};
const SECTIONS = ['editor', 'theme', 'commerce', 'overview', 'settings'];
const NOT_OWNER = 'Сайт не знайдено або у вас немає прав (тільки власник).';

let owner, editor, viewer, limited, bare, stranger, site, home, about;

beforeEach(async () => {
  owner = await createUser({ plan: 'PLUS' });
  editor = await createUser();
  viewer = await createUser();
  limited = await createUser();
  bare = await createUser();
  stranger = await createUser();
  site = await createSite(owner, { site_path: 'acme-shop', title: 'Акме' });
  await addCollaborator(site, editor, 'editor', SECTIONS);
  await addCollaborator(site, viewer, 'viewer', SECTIONS);
  await addCollaborator(site, limited, 'editor', ['theme']);
  await addCollaborator(site, bare, 'editor', []);
  home = await createPage(site, { name: 'Головна', slug: 'home', is_homepage: 1, block_content: BLOCKS });
  about = await createPage(site, { name: 'Про нас', slug: 'about' });
});

const actor = (name) => ({ anon: null, stranger, bare, limited, viewer, editor, owner })[name];
const withAuth = (req, user) => (user ? req.set(authHeader(user)) : req);
const putSettings = (user, body, sitePath = 'acme-shop') =>
  withAuth(request(app).put(`/api/sites/${sitePath}/settings`), user).send(body);

describe('PUT /api/sites/:site_path/settings: доступ', () => {
  it.each([
    ['без токена: 401', 'anon', 401],
    ['сторонній користувач: 403', 'stranger', 403],
    ['співавтор viewer: 403', 'viewer', 403],
    ['співавтор editor без секції settings: 403', 'limited', 403],
    ['співавтор editor без дозволів: 403', 'bare', 403],
    ['співавтор editor: 200', 'editor', 200],
    ['власник: 200', 'owner', 200],
  ])('%s', async (_label, who, status) => {
    const res = await putSettings(actor(who), { title: 'Нова назва' });
    expect(res.status).toBe(status);
    const row = await getSite(site.id);
    expect(row.title).toBe(status === 200 ? 'Нова назва' : 'Акме');
    if (status === 403) expect(res.body.message).toBe('У вас немає прав редагувати цей сайт.');
  });

  it('неіснуючий сайт — 404', async () => {
    const res = await putSettings(owner, { title: 'Нова назва' }, 'no-such-site');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Сайт не знайдено.');
  });
});

describe('PUT /api/sites/:site_path/settings: права за групами полів', () => {
  const memberWith = async (permissions, role = 'editor') => {
    const member = await createUser();
    await addCollaborator(site, member, role, permissions);
    return member;
  };

  it.each([
    ['settings', { title: 'Нова назва' }, { title: 'Нова назва' }],
    ['settings', { status: 'private' }, { status: 'private' }],
    ['theme', { site_theme_mode: 'dark', site_theme_accent: 'green' }, { site_theme_mode: 'dark', site_theme_accent: 'green' }],
    ['commerce', { currency: 'EUR', is_cod_enabled: 0 }, { currency: 'EUR', is_cod_enabled: 0 }],
    ['settings', { cookie_banner_enabled: 1, cookie_banner_text: 'Cookies' }, { cookie_banner_enabled: 1, cookie_banner_text: 'Cookies' }],
  ])('D-SEC-06: редактор із секцією %s зберігає %j', async (section, body, expected) => {
    const member = await memberWith([section]);
    const res = await putSettings(member, body);
    expect(res.status).toBe(200);
    expect(await getSite(site.id)).toMatchObject(expected);
  });

  it.each([
    ['theme', { title: 'Нова назва' }],
    ['theme', { currency: 'EUR' }],
    ['commerce', { title: 'Нова назва' }],
    ['commerce', { site_theme_mode: 'dark' }],
    ['settings', { currency: 'EUR' }],
    ['settings', { site_theme_accent: 'green' }],
    ['overview', { title: 'Нова назва' }],
    ['editor', { status: 'private' }],
  ])('D-SEC-06: редактор із секцією %s не зберігає %j', async (section, body) => {
    const member = await memberWith([section]);
    const before = await getSite(site.id);
    const res = await putSettings(member, body);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав редагувати цей сайт.');
    expect(await getSite(site.id)).toMatchObject({
      title: before.title, status: before.status, currency: before.currency, site_theme_mode: before.site_theme_mode,
    });
  });

  it('D-SEC-06: запит із полями двох груп потребує обох секцій', async () => {
    const onlySettings = await memberWith(['settings']);
    const denied = await putSettings(onlySettings, { title: 'Нова назва', currency: 'EUR' });
    expect(denied.status).toBe(403);
    expect((await getSite(site.id)).title).toBe('Акме');
    const both = await memberWith(['settings', 'commerce']);
    const allowed = await putSettings(both, { title: 'Нова назва', currency: 'EUR' });
    expect(allowed.status).toBe(200);
    expect(await getSite(site.id)).toMatchObject({ title: 'Нова назва', currency: 'EUR' });
  });

  it('D-SEC-06: теги змінює лише редактор із секцією settings', async () => {
    const themeEditor = await memberWith(['theme']);
    const denied = await putSettings(themeEditor, { tags: [] });
    expect(denied.status).toBe(403);
    const allowed = await putSettings(editor, { tags: [] });
    expect(allowed.status).toBe(200);
  });

  it('D-SEC-06: глядач з усіма секціями не змінює нічого', async () => {
    const res = await putSettings(viewer, { currency: 'EUR', site_theme_mode: 'dark' });
    expect(res.status).toBe(403);
    expect(await getSite(site.id)).toMatchObject({ currency: 'UAH', site_theme_mode: 'light' });
  });

  it('D-SEC-06: співавтор іншого сайту не змінює цей', async () => {
    const otherOwner = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherOwner);
    const member = await createUser();
    await addCollaborator(otherSite, member, 'editor', SECTIONS);
    const res = await putSettings(member, { title: 'Нова назва' });
    expect(res.status).toBe(403);
    expect((await getSite(site.id)).title).toBe('Акме');
  });
});

describe('PUT /api/sites/:site_path/settings: збереження', () => {
  it('власник змінює назву, статус і валюту, а блок header отримує нову назву', async () => {
    const res = await putSettings(owner, { title: 'Нова назва', status: 'maintenance', currency: 'USD' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Налаштування оновлено');
    expect(res.body.updated).toMatchObject({ title: 'Нова назва', status: 'maintenance', currency: 'USD' });
    const row = await getSite(site.id);
    expect(row).toMatchObject({ title: 'Нова назва', status: 'maintenance', currency: 'USD' });
    expect(row.header_content).toHaveLength(1);
    expect(row.header_content[0]).toMatchObject({ type: 'header', data: { site_title: 'Нова назва' } });
  });

  it.each([
    ['назва з одного символу', { title: 'A' }, 'Назва сайту має бути від 2 до 60 символів'],
    ['назва із 61 символу', { title: 'a'.repeat(61) }, 'Назва сайту має бути від 2 до 60 символів'],
    ['назва з <', { title: '<b>' }, 'Назва сайту містить недопустимі символи (<, >)'],
    ['назва в блоці header з <', { header_content: [{ block_id: 'h1', type: 'header', data: { site_title: '<x>' } }] }, 'Назва містить недопустимі символи'],
  ])('%s — 400', async (_label, body, message) => {
    const res = await putSettings(owner, body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    expect((await getSite(site.id)).title).toBe('Акме');
  });

  it('назва й логотип беруться з блока header, якщо він переданий', async () => {
    const header = { block_id: 'h1', type: 'header', data: { site_title: 'З хедера', logo_src: '/new-logo.png' } };
    const res = await putSettings(owner, { header_content: [header] });
    expect(res.status).toBe(200);
    expect(await getSite(site.id)).toMatchObject({ title: 'З хедера', logo_url: '/new-logo.png' });
  });

  it('назва з блока header не проходить перевірку довжини (перевіряються лише < і >)', async () => {
    const header = { block_id: 'h1', type: 'header', data: { site_title: 'X' } };
    const res = await putSettings(owner, { header_content: [header] });
    expect(res.status).toBe(200);
    expect((await getSite(site.id)).title).toBe('X');
  });

  it('оновлює теги сайту', async () => {
    const t1 = (await query("INSERT INTO tags (name) VALUES ('Блог')")).insertId;
    const t2 = (await query("INSERT INTO tags (name) VALUES ('Магазин')")).insertId;
    await putSettings(owner, { tags: [t1, t2] });
    expect(await countRows('site_tags', 'site_id = ?', [site.id])).toBe(2);
    await putSettings(owner, { tags: [] });
    expect(await countRows('site_tags', 'site_id = ?', [site.id])).toBe(0);
  });

  it.each(['suspended', 'probation'])('для сайту зі статусом %s зміну статусу заборонено, решта налаштувань зберігається', async (status) => {
    await query('UPDATE sites SET status = ? WHERE id = ?', [status, site.id]);
    const denied = await putSettings(owner, { status: 'published' });
    expect(denied.status).toBe(403);
    expect(denied.body.message).toBe('Ви не можете змінювати статус сайту, поки він заблокований або на модерації.');
    const allowed = await putSettings(owner, { title: 'Нова назва' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.updated.status).toBe(status);
    expect(await getSite(site.id)).toMatchObject({ title: 'Нова назва', status });
  });
});

describe('PUT /api/sites/:site_path/settings: ключі LiqPay', () => {
  const OLD_SECRET = 'old-secret-key';
  let paid;

  beforeEach(async () => {
    paid = await createSite(owner, { site_path: 'pay-shop', liqpay: { publicKey: 'pub-old', privateKey: OLD_SECRET } });
  });

  it('приватний ключ шифрується перед збереженням', async () => {
    const res = await putSettings(owner, { liqpay_public_key: 'pub-new', liqpay_private_key: 'new-secret' }, 'pay-shop');
    expect(res.status).toBe(200);
    const row = await getSite(paid.id);
    expect(row.liqpay_public_key).toBe('pub-new');
    expect(row.liqpay_private_key).not.toBe('new-secret');
    expect(row.liqpay_private_key.split(':')).toHaveLength(3);
    expect(decryptKey(row.liqpay_private_key)).toBe('new-secret');
  });

  it("значення '********' лишає попередній ключ без змін", async () => {
    const before = (await getSite(paid.id)).liqpay_private_key;
    await putSettings(owner, { liqpay_private_key: '********' }, 'pay-shop');
    expect((await getSite(paid.id)).liqpay_private_key).toBe(before);
    expect(decryptKey(before)).toBe(OLD_SECRET);
  });

  it('порожній рядок видаляє ключ', async () => {
    await putSettings(owner, { liqpay_private_key: '' }, 'pay-shop');
    expect((await getSite(paid.id)).liqpay_private_key).toBeNull();
  });

  it.each([[[]], [['theme']], [['editor', 'theme', 'overview', 'settings']]])(
    'D-SEC-06: співавтор editor з дозволами %j не змінює ключі LiqPay',
    async (permissions) => {
      const member = await createUser();
      await addCollaborator(paid, member, 'editor', permissions);
      const res = await putSettings(member, { liqpay_public_key: 'pub-hacked', liqpay_private_key: 'attacker-secret' }, 'pay-shop');
      expect(res.status).toBe(403);
      const row = await getSite(paid.id);
      expect(row.liqpay_public_key).toBe('pub-old');
      expect(decryptKey(row.liqpay_private_key)).toBe(OLD_SECRET);
    }
  );

  it('D-SEC-06: співавтор viewer із секцією commerce не змінює ключі LiqPay', async () => {
    const member = await createUser();
    await addCollaborator(paid, member, 'viewer', ['commerce']);
    const res = await putSettings(member, { liqpay_private_key: 'attacker-secret' }, 'pay-shop');
    expect(res.status).toBe(403);
    expect(decryptKey((await getSite(paid.id)).liqpay_private_key)).toBe(OLD_SECRET);
  });

  it('D-SEC-06: співавтор editor із секцією commerce змінює ключі LiqPay', async () => {
    const member = await createUser();
    await addCollaborator(paid, member, 'editor', ['commerce']);
    const res = await putSettings(member, { liqpay_public_key: 'pub-team', liqpay_private_key: 'team-secret' }, 'pay-shop');
    expect(res.status).toBe(200);
    const row = await getSite(paid.id);
    expect(row.liqpay_public_key).toBe('pub-team');
    expect(decryptKey(row.liqpay_private_key)).toBe('team-secret');
  });

  it('D-SEC-06: співавтор editor без дозволів не публікує й не знімає сайт з публікації', async () => {
    const res = await putSettings(bare, { status: 'maintenance' });
    expect(res.status).toBe(403);
    expect((await getSite(site.id)).status).toBe('published');
  });
});

describe('PUT /api/sites/:site_path/settings: блокування редагування', () => {
  it('сайт заблокований іншим користувачем — 423, зміни не зберігаються', async () => {
    await setSiteLock(site, editor, 60 * 1000);
    const res = await putSettings(owner, { title: 'Нова назва' });
    expect(res.status).toBe(423);
    expect(res.body.message).toContain('редагується іншим користувачем');
    expect((await getSite(site.id)).title).toBe('Акме');
  });

  it('блокування, що спливло, не заважає', async () => {
    await setSiteLock(site, editor, -60 * 1000);
    const res = await putSettings(owner, { title: 'Нова назва' });
    expect(res.status).toBe(200);
  });

  it('власне блокування не заважає', async () => {
    await setSiteLock(site, owner, 60 * 1000);
    const res = await putSettings(owner, { title: 'Нова назва' });
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/sites/:siteId/reset-template', () => {
  const reset = (user, body, siteId = site.id) =>
    withAuth(request(app).put(`/api/sites/${siteId}/reset-template`), user).send(body);

  it('без токена — 401', async () => {
    const res = await reset(null, { isBlank: true });
    expect(res.status).toBe(401);
  });

  it('порожній шаблон: усі сторінки замінюються однією порожньою головною, header і footer оновлюються', async () => {
    const res = await reset(owner, { templateId: 'blank' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Сайт успішно скинуто до шаблону.');
    const pages = await getPages(site.id);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ slug: 'home', is_homepage: 1, block_content: [] });
    expect([home.id, about.id]).not.toContain(pages[0].id);
    const row = await getSite(site.id);
    expect(row.header_content).toHaveLength(1);
    expect(row.header_content[0]).toMatchObject({ type: 'header', data: { site_title: 'Акме' } });
    expect(row.footer_content).toEqual([]);
    expect(row).toMatchObject({ site_theme_mode: 'light', site_theme_accent: 'blue' });
  });

  it('системний шаблон: сторінки, тема й header беруться з шаблону', async () => {
    const template = await createTemplate(null, { content: TEMPLATE });
    const res = await reset(owner, { templateId: template.id });
    expect(res.status).toBe(200);
    const pages = await getPages(site.id);
    expect(pages.map((p) => p.slug)).toEqual(['home', 'contacts']);
    expect(pages.map((p) => p.is_homepage)).toEqual([1, 0]);
    expect(pages[0].block_content[0].block_id).not.toBe('tpl-b1');
    const row = await getSite(site.id);
    expect(row).toMatchObject({ site_theme_mode: 'dark', site_theme_accent: 'green' });
    expect(row.header_content[0].block_id).not.toBe('tpl-header');
  });

  // KNOWN-DEFECT D-ARC-10: помилка клієнта (немає шаблону) повертається як 500.
  it('KNOWN-DEFECT D-ARC-10: неіснуючий шаблон — 500, сторінки зберігаються', async () => {
    const res = await reset(owner, { templateId: 999999 });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Шаблон не знайдено.');
    expect(await countRows('pages', 'site_id = ?', [site.id])).toBe(2);
  });

  it('особистий шаблон іншого користувача — відмова, сторінки зберігаються', async () => {
    const template = await createTemplate(stranger, { type: 'personal', access_level: 'private', content: TEMPLATE });
    const res = await reset(owner, { templateId: template.id });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('У вас немає доступу до цього шаблону.');
    expect(await countRows('pages', 'site_id = ?', [site.id])).toBe(2);
  });

  it('сторонній користувач — 403, сторінки зберігаються', async () => {
    const res = await reset(stranger, { isBlank: true });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(NOT_OWNER);
    expect(await countRows('pages', 'site_id = ?', [site.id])).toBe(2);
  });

  it.each(['viewer', 'editor', 'limited', 'bare'])('D-SEC-06: співавтор %s не стирає вміст сайту', async (who) => {
    const res = await reset(actor(who), { isBlank: true });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(NOT_OWNER);
    const pages = await getPages(site.id);
    expect(pages).toHaveLength(2);
    expect(pages.find((p) => p.slug === 'home').block_content).toEqual(BLOCKS);
  });
});

describe('PATCH /api/sites/:siteId/pin', () => {
  const pin = (user, siteId = site.id) => withAuth(request(app).patch(`/api/sites/${siteId}/pin`), user);

  it('власник закріплює й відкріплює сайт', async () => {
    const first = await pin(owner);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ message: 'Сайт закріплено', is_pinned: true });
    const second = await pin(owner);
    expect(second.body).toEqual({ message: 'Сайт відкріплено', is_pinned: false });
  });

  it('сторонній користувач — 404', async () => {
    const res = await pin(stranger);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(NOT_OWNER);
    expect((await getSite(site.id)).is_pinned).toBe(0);
  });

  it.each(['viewer', 'editor', 'limited', 'bare'])('D-SEC-06: співавтор %s не змінює закріплення сайту власника', async (who) => {
    const res = await pin(actor(who));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(NOT_OWNER);
    expect((await getSite(site.id)).is_pinned).toBe(0);
  });
});

describe('PUT /api/sites/:site_path/rename', () => {
  const rename = (user, newPath, sitePath = 'acme-shop') =>
    withAuth(request(app).put(`/api/sites/${sitePath}/rename`), user).send({ newPath });

  it('власник змінює адресу; стара адреса перестає працювати', async () => {
    const res = await rename(owner, 'new-acme');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Адресу сайту успішно змінено.', newPath: 'new-acme' });
    expect((await getSite(site.id)).site_path).toBe('new-acme');
    const oldAddress = await request(app).get('/api/sites/acme-shop');
    expect(oldAddress.body).toBeNull();
    const newAddress = await request(app).get('/api/sites/new-acme');
    expect(newAddress.body.id).toBe(site.id);
  });

  it('нормалізує адресу: нижній регістр і пробіли', async () => {
    const res = await rename(owner, ' New-Acme ');
    expect(res.status).toBe(200);
    expect(res.body.newPath).toBe('new-acme');
  });

  it('некоректна адреса — 400', async () => {
    const res = await rename(owner, 'ab');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('URL сайту має бути від 3 до 40 символів');
  });

  it('зайнята адреса — 409', async () => {
    await createSite(stranger, { site_path: 'taken-shop' });
    const res = await rename(owner, 'taken-shop');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Ця адреса вже зайнята. Спробуйте іншу.');
  });

  it.each(['editor', 'viewer', 'stranger'])('%s не може змінити адресу — 404', async (who) => {
    const res = await rename(actor(who), 'new-acme');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Сайт не знайдено або недостатньо прав (тільки власник).');
    expect((await getSite(site.id)).site_path).toBe('acme-shop');
  });

  it('без токена — 401', async () => {
    const res = await rename(null, 'new-acme');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/sites/:site_path', () => {
  const remove = (user, sitePath = 'acme-shop') => withAuth(request(app).delete(`/api/sites/${sitePath}`), user);

  it('без токена — 401', async () => {
    const res = await remove(null);
    expect(res.status).toBe(401);
  });

  it.each(['editor', 'viewer', 'stranger'])('%s не може видалити сайт — 404, сайт лишається', async (who) => {
    const res = await remove(actor(who));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Сайт не знайдено або у вас немає прав на його видалення.');
    expect(await getSite(site.id)).toBeDefined();
  });

  it('неіснуючий сайт — 404', async () => {
    const res = await remove(owner, 'no-such-site');
    expect(res.status).toBe(404);
  });

  it('власник видаляє сайт; сторінки, товари, категорії, співавтори й замовлення видаляються каскадом', async () => {
    const buyer = await createUser();
    const product = await createProduct(site);
    await createCategory(site);
    await createOrder(site, buyer, { items: [{ product, quantity: 1 }] });
    expect(await countRows('orders')).toBe(1);

    const res = await remove(owner);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Сайт успішно видалено.');
    expect(await getSite(site.id)).toBeUndefined();
    for (const table of ['pages', 'products', 'categories', 'site_collaborators', 'orders', 'order_items']) {
      expect(await countRows(table), table).toBe(0);
    }
  });
});

describe('GET /api/sites/:id/analytics', () => {
  const analytics = (user, siteId = site.id) => withAuth(request(app).get(`/api/sites/${siteId}/analytics`), user);

  it('без токена — 401', async () => {
    const res = await analytics(null);
    expect(res.status).toBe(401);
  });

  it('сайт без замовлень: нулі й порожній список', async () => {
    const res = await analytics(owner);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ views: 0, totalOrders: 0, completedOrders: 0, revenue: 0, currency: 'UAH', recentOrders: [] });
  });

  it('рахує перегляди, замовлення й виручку (paid, shipped, completed)', async () => {
    const buyer = await createUser();
    const product = await createProduct(site, { price: 100 });
    await query('UPDATE sites SET view_count = 7 WHERE id = ?', [site.id]);
    const orders = [['pending', 1], ['paid', 2], ['shipped', 1], ['completed', 1], ['cancelled', 1]];
    for (const [status, quantity] of orders) {
      await createOrder(site, buyer, { status, items: [{ product, quantity }] });
    }
    const res = await analytics(owner);
    expect(res.status).toBe(200);
    expect(res.body.views).toBe(7);
    expect(res.body.totalOrders).toBe(5);
    expect(Number(res.body.completedOrders)).toBe(3);
    expect(res.body.revenue).toBe(400);
    expect(res.body.recentOrders).toHaveLength(5);
    expect(Object.keys(res.body.recentOrders[0]).sort()).toEqual(['created_at', 'customer_name', 'id', 'status', 'total_amount']);
  });

  it.each(['editor', 'viewer'])('співавтор %s із секцією overview бачить аналітику', async (who) => {
    const res = await analytics(actor(who));
    expect(res.status).toBe(200);
  });

  it.each(['limited', 'bare'])('D-SEC-06: співавтор %s без секції overview — 403, замовлення не читаються', async (who) => {
    const res = await analytics(actor(who));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав доступу до аналітики цього сайту');
    expect(res.body.recentOrders).toBeUndefined();
  });

  it('D-SEC-06: співавтор іншого сайту не бачить аналітику цього', async () => {
    const otherOwner = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherOwner);
    const member = await createUser();
    await addCollaborator(otherSite, member, 'viewer', ['overview']);
    const res = await analytics(member);
    expect(res.status).toBe(403);
  });

  it('сторонній користувач — 403', async () => {
    const res = await analytics(stranger);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('У вас немає прав доступу до аналітики цього сайту');
  });

  it('неіснуючий сайт — 404', async () => {
    const res = await analytics(owner, 999999);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Сайт не знайдено');
  });
});

describe('GET /api/sites/my-suspended', () => {
  it('без токена — 401', async () => {
    const res = await request(app).get('/api/sites/my-suspended');
    expect(res.status).toBe(401);
  });

  it('повертає лише заблоковані сайти поточного користувача', async () => {
    const suspended = await createSite(owner, { site_path: 'blocked-shop', status: 'suspended' });
    await createSite(stranger, { site_path: 'other-blocked', status: 'suspended' });
    const res = await request(app).get('/api/sites/my-suspended').set(authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: suspended.id, site_path: 'blocked-shop' });
  });
});

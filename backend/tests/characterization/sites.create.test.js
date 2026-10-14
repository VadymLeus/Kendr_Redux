// Створення сайту (createSite) і перевірка адреси (checkSlug): валідація, шаблони, транзакція, ліміти тарифу.
// Фіксує D-BIZ-03 (ліміт сайтів), D-BIZ-05 (довжина адреси, виправлено), D-SEC-17 (рівень доступу шаблона),
// D-ARC-10 (код відповіді визначається за текстом помилки).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { setGlobalSetting, createUser, createSite, createTemplate, addCollaborator, getSite, getPages, countRows } from '../helpers/factories.js';

useTestDatabase();

let user;

beforeEach(async () => {
  user = await createUser({ plan: 'FREE' });
});

const create = (who, body) => request(app).post('/api/sites/create').set(authHeader(who)).send(body);

const TEMPLATE = {
  theme_settings: { mode: 'dark', accent: 'green' },
  header_content: [{ block_id: 'tpl-header', type: 'header', data: { site_title: 'Шаблон', nav_items: [{ id: 'nav-1', label: 'Головна', link: '/' }] } }],
  footer_content: [{ block_id: 'tpl-footer', type: 'footer', data: { text: '© шаблон' } }],
  pages: [
    { title: 'Головна', slug: 'home', blocks: [{ block_id: 'tpl-b1', type: 'text', data: { items: [{ id: 'item-1', text: 'a' }] } }] },
    { title: 'Про нас', slug: 'about', seo_title: 'Про нас — SEO', blocks: [] },
  ],
};

describe('POST /api/sites/create: порожній сайт', () => {
  it('без токена — 401', async () => {
    const res = await request(app).post('/api/sites/create').send({ title: 'Магазин', sitePath: 'my-shop', isBlank: true });
    expect(res.status).toBe(401);
  });

  it('створює приватний сайт із головною сторінкою й блоком header', async () => {
    const res = await create(user, { title: 'Кавова крамниця', sitePath: 'kava-shop', isBlank: true });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Сайт успішно створено!', site: { id: expect.any(Number), site_path: 'kava-shop' } });

    const created = await getSite(res.body.site.id);
    expect(created).toMatchObject({
      user_id: user.id,
      site_path: 'kava-shop',
      title: 'Кавова крамниця',
      status: 'private',
      logo_url: '/logos/logo1.png',
      currency: 'UAH',
      site_theme_mode: 'light',
      site_theme_accent: 'blue',
    });
    expect(created.footer_content).toEqual([]);
    expect(created.theme_settings).toEqual({});
    expect(created.header_content).toHaveLength(1);
    expect(created.header_content[0]).toMatchObject({
      type: 'header',
      data: { site_title: 'Кавова крамниця', logo_src: '/logos/logo1.png', show_title: true },
    });

    const pages = await getPages(created.id);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ name: 'Головна', slug: 'home', is_homepage: 1, block_content: [] });
  });

  it('нормалізує адресу: нижній регістр і обрізання пробілів', async () => {
    const res = await create(user, { title: 'Магазин', sitePath: '  My-Shop ', isBlank: true });
    expect(res.status).toBe(201);
    expect(res.body.site.site_path).toBe('my-shop');
  });

  it('виділений логотип із localhost:5000 зберігається відносним шляхом', async () => {
    const res = await create(user, {
      title: 'Магазин', sitePath: 'my-shop', isBlank: true, selected_logo_url: 'http://localhost:5000/uploads/logo.png',
    });
    expect(res.status).toBe(201);
    expect((await getSite(res.body.site.id)).logo_url).toBe('/uploads/logo.png');
  });
});

describe('POST /api/sites/create: валідація', () => {
  const CASES = [
    ['порожня назва', { sitePath: 'valid-path' }, "Назва сайту обов'язкова"],
    ['назва з одного символу', { title: 'A', sitePath: 'valid-path' }, 'Назва сайту має бути від 2 до 60 символів'],
    ['назва із 61 символу', { title: 'a'.repeat(61), sitePath: 'valid-path' }, 'Назва сайту має бути від 2 до 60 символів'],
    ['назва з <', { title: 'Магазин <b>', sitePath: 'valid-path' }, 'Назва сайту містить недопустимі символи (<, >)'],
    ['порожня адреса', { title: 'Магазин' }, "URL сайту обов'язковий"],
    ['адреса з двох символів', { title: 'Магазин', sitePath: 'ab' }, 'URL сайту має бути від 3 до 30 символів'],
    ['адреса з 31 символу', { title: 'Магазин', sitePath: 'abcdefghij'.repeat(3) + 'k' }, 'URL сайту має бути від 3 до 30 символів'],
    ['адреса з 40 символів', { title: 'Магазин', sitePath: 'abcdefghij'.repeat(4) }, 'URL сайту має бути від 3 до 30 символів'],
    ['кирилиця в адресі', { title: 'Магазин', sitePath: 'магазин' }, 'URL може містити лише малі латинські літери, цифри та дефіс'],
    ['пробіл усередині адреси', { title: 'Магазин', sitePath: 'my shop' }, 'URL може містити лише малі латинські літери, цифри та дефіс'],
    ['адреса починається з дефіса', { title: 'Магазин', sitePath: '-shop' }, 'URL не може починатися або закінчуватися дефісом'],
    ['адреса закінчується дефісом', { title: 'Магазин', sitePath: 'shop-' }, 'URL не може починатися або закінчуватися дефісом'],
    ['два дефіси підряд', { title: 'Магазин', sitePath: 'my--shop' }, 'URL не може містити два дефіси підряд'],
    ['зарезервована адреса admin', { title: 'Магазин', sitePath: 'admin' }, 'Цей URL зарезервовано системою'],
    ['зарезервована адреса api', { title: 'Магазин', sitePath: 'api' }, 'Цей URL зарезервовано системою'],
    ['зарезервована адреса create', { title: 'Магазин', sitePath: 'create' }, 'Цей URL зарезервовано системою'],
    ['п\'ять однакових символів підряд', { title: 'Магазин', sitePath: 'aaaaaa' }, 'Ця адреса містить заборонену або занадто просту послідовність символів'],
    ['проста послідовність qwerty', { title: 'Магазин', sitePath: 'my-qwerty-shop' }, 'Ця адреса містить заборонену або занадто просту послідовність символів'],
    ['проста послідовність 12345', { title: 'Магазин', sitePath: 'shop12345' }, 'Ця адреса містить заборонену або занадто просту послідовність символів'],
  ];

  it.each(CASES)('%s — 400 і сайт не створюється', async (_name, body, message) => {
    const res = await create(user, { ...body, isBlank: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    expect(await countRows('sites')).toBe(0);
  });

  // D-BIZ-05 виправлено: сервер приймає ту саму довжину адреси, що й поле вводу, — до 30 символів.
  it('адреса з 30 символів — 201, з 31 — 400', async () => {
    const accepted = await create(user, { title: 'Магазин', sitePath: 'abcdefghij'.repeat(3), isBlank: true });
    expect(accepted.status).toBe(201);
    expect(accepted.body.site.site_path).toHaveLength(30);
    const refused = await create(user, { title: 'Інший', sitePath: 'abcdefghij'.repeat(3) + 'k', isBlank: true });
    expect(refused.status).toBe(400);
    expect(await countRows('sites')).toBe(1);
  });

  it('зайнята адреса — 400, нічого не створюється', async () => {
    const other = await createUser();
    await createSite(other, { site_path: 'taken-shop' });
    const res = await create(user, { title: 'Магазин', sitePath: 'taken-shop', isBlank: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Ця адреса сайту вже зайнята.');
    expect(await countRows('sites')).toBe(1);
    expect(await countRows('pages')).toBe(0);
  });

  // KNOWN-DEFECT D-ARC-10: код відповіді вибирається за фрагментом тексту помилки; усе інше стає 500.
  it('KNOWN-DEFECT D-ARC-10: без templateId і isBlank відповідь 500, хоча це помилка клієнта', async () => {
    const res = await create(user, { title: 'Магазин', sitePath: 'my-shop' });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('ID шаблону не було надано.');
    expect(await countRows('sites')).toBe(0);
  });

  it('вимкнене створення сайтів у global_settings — 403', async () => {
    await setGlobalSetting('site_creation_enabled', 0);
    const res = await create(user, { title: 'Магазин', sitePath: 'my-shop', isBlank: true });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('призупинено адміністрацією');
    expect(await countRows('sites')).toBe(0);
  });

  it('D-BIZ-03: третій сайт на тарифі FREE створюється, четвертий — 403', async () => {
    for (let i = 0; i < 2; i++) await createSite(user);
    const third = await create(user, { title: 'Третій', sitePath: 'third-shop', isBlank: true });
    expect(third.status).toBe(201);
    const res = await create(user, { title: 'Четвертий', sitePath: 'fourth-shop', isBlank: true });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Ви досягли ліміту сайтів (3) на вашому тарифі.');
    expect(await countRows('sites', 'user_id = ?', [user.id])).toBe(3);
  });

  it('D-BIZ-03: сайти, де користувач лише співавтор, ліміт не вичерпують', async () => {
    const other = await createUser({ plan: 'PLUS' });
    for (let i = 0; i < 3; i++) await addCollaborator(await createSite(other), user, 'editor', ['editor']);
    const res = await create(user, { title: 'Мій перший', sitePath: 'my-first', isBlank: true });
    expect(res.status).toBe(201);
  });

  it('D-BIZ-03: на тарифі PLUS дозволено 8 сайтів, дев\'ятий — 403', async () => {
    const plus = await createUser({ plan: 'PLUS' });
    for (let i = 0; i < 7; i++) await createSite(plus);
    const eighth = await create(plus, { title: 'Восьмий', sitePath: 'eighth-shop', isBlank: true });
    expect(eighth.status).toBe(201);
    const res = await create(plus, { title: 'Дев\'ятий', sitePath: 'ninth-shop', isBlank: true });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Ви досягли ліміту сайтів (8) на вашому тарифі.');
  });

  it('D-BIZ-03: тариф ADMIN без обмежень', async () => {
    const admin = await createUser({ plan: 'ADMIN' });
    for (let i = 0; i < 10; i++) await createSite(admin);
    const res = await create(admin, { title: 'Ще один', sitePath: 'one-more', isBlank: true });
    expect(res.status).toBe(201);
  });

  it('D-BIZ-03: тариф береться з БД, а не з токена', async () => {
    for (let i = 0; i < 3; i++) await createSite(user);
    const res = await create({ ...user, plan: 'PLUS' }, { title: 'Четвертий', sitePath: 'fourth-shop', isBlank: true });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/sites/create: шаблони', () => {
  it('переносить із системного шаблону тему, сторінки, header і footer з новими ідентифікаторами блоків', async () => {
    const template = await createTemplate(null, { content: TEMPLATE });
    const res = await create(user, { templateId: template.id, title: 'Сайт із шаблону', sitePath: 'from-template' });
    expect(res.status).toBe(201);

    const created = await getSite(res.body.site.id);
    expect(created).toMatchObject({ site_theme_mode: 'dark', site_theme_accent: 'green', status: 'private' });
    expect(created.theme_settings).toEqual({ mode: 'dark', accent: 'green' });

    expect(created.header_content).toHaveLength(1);
    expect(created.header_content[0].block_id).not.toBe('tpl-header');
    expect(created.header_content[0].data.site_title).toBe('Сайт із шаблону');
    expect(created.header_content[0].data.nav_items).toEqual(TEMPLATE.header_content[0].data.nav_items);
    expect(created.footer_content).toHaveLength(1);
    expect(created.footer_content[0].block_id).not.toBe('tpl-footer');

    const pages = await getPages(created.id);
    expect(pages.map((p) => p.slug)).toEqual(['home', 'about']);
    expect(pages.map((p) => p.is_homepage)).toEqual([1, 0]);
    expect(pages[1]).toMatchObject({ name: 'Про нас', seo_title: 'Про нас — SEO' });
    const [homeBlock] = pages[0].block_content;
    expect(homeBlock.block_id).not.toBe('tpl-b1');
    expect(homeBlock.data.items[0].id).not.toBe('item-1');
    expect(homeBlock.data.items[0].text).toBe('a');
  });

  it('шаблон у старому форматі (масив блоків) стає однією головною сторінкою', async () => {
    const template = await createTemplate(null, { content: [{ block_id: 'old-1', type: 'text', data: {} }] });
    const res = await create(user, { templateId: template.id, title: 'Старий шаблон', sitePath: 'legacy-shop' });
    expect(res.status).toBe(201);
    const created = await getSite(res.body.site.id);
    expect(created).toMatchObject({ site_theme_mode: 'light', site_theme_accent: 'blue' });
    const pages = await getPages(created.id);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ slug: 'home', is_homepage: 1 });
    expect(pages[0].block_content).toHaveLength(1);
    expect(pages[0].block_content[0].block_id).not.toBe('old-1');
  });

  it('неіснуючий шаблон — 400, сайт не створюється', async () => {
    const res = await create(user, { templateId: 999999, title: 'Магазин', sitePath: 'my-shop' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Шаблон не знайдено.');
    expect(await countRows('sites')).toBe(0);
  });

  it('власний особистий шаблон дозволений', async () => {
    const template = await createTemplate(user, { type: 'personal', access_level: 'private', content: TEMPLATE });
    const res = await create(user, { templateId: template.id, title: 'Мій шаблон', sitePath: 'mine-shop' });
    expect(res.status).toBe(201);
  });

  it('особистий шаблон іншого користувача — 400', async () => {
    const other = await createUser();
    const template = await createTemplate(other, { type: 'personal', access_level: 'private', content: TEMPLATE });
    const res = await create(user, { templateId: template.id, title: 'Чужий шаблон', sitePath: 'theirs-shop' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('У вас немає доступу до цього приватного шаблону.');
    expect(await countRows('sites')).toBe(0);
  });

  // KNOWN-DEFECT D-SEC-17: перевіряється лише власність особистих шаблонів, але не is_ready і access_level.
  it('KNOWN-DEFECT D-SEC-17: сайт створюється із шаблону admin_only, що не позначений готовим', async () => {
    const template = await createTemplate(null, { access_level: 'admin_only', is_ready: 0, content: TEMPLATE });
    const res = await create(user, { templateId: template.id, title: 'З чернетки', sitePath: 'draft-shop' });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/sites/check-slug', () => {
  const check = (slug) => request(app).get('/api/sites/check-slug').query({ slug }).set(authHeader(user));

  it('без токена — 401', async () => {
    const res = await request(app).get('/api/sites/check-slug').query({ slug: 'free-slug' });
    expect(res.status).toBe(401);
  });

  it('вільна адреса', async () => {
    const res = await check('free-slug');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isAvailable: true });
  });

  it('зайнята адреса', async () => {
    await createSite(user, { site_path: 'taken-slug' });
    const res = await check('taken-slug');
    expect(res.body).toEqual({ isAvailable: false, message: 'Ця адреса вже зайнята.' });
  });

  it('регістр і пробіли ігноруються, як і при створенні', async () => {
    await createSite(user, { site_path: 'taken-slug' });
    const res = await check('  Taken-Slug ');
    expect(res.body).toEqual({ isAvailable: false, message: 'Ця адреса вже зайнята.' });
  });

  it('некоректна адреса: 200 і опис помилки', async () => {
    const res = await check('admin');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isAvailable: false, message: 'Цей URL зарезервовано системою' });
  });

  it('без параметра slug: 200 і повідомлення про обов\'язковість', async () => {
    const res = await request(app).get('/api/sites/check-slug').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isAvailable: false, message: "URL сайту обов'язковий" });
  });
});

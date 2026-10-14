// Публічна частина сайтів: видача сторінки за статусом і роллю глядача, маскування ключа LiqPay, поля про власника
// (D-SEC-05, виправлено), облік відвідувань (trackVisit), каталог, шаблони (D-SEC-17), конфлікти маршрутів (D-ARC-11).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { query } from '../helpers/testDb.js';
import {
  createUser, createSite, createProduct, createPage, createTemplate, addCollaborator, getSite,
} from '../helpers/factories.js';

useTestDatabase();

const BLOCKS = [{ block_id: 'b1', type: 'text', data: { text: 'Привіт' } }];

let owner, site, home;

beforeEach(async () => {
  owner = await createUser({ username: 'olena' });
  site = await createSite(owner, { site_path: 'olena-shop', title: 'Крамниця Олени' });
  home = await createPage(site, { name: 'Головна', slug: 'home', is_homepage: 1, block_content: BLOCKS });
});

const fetchSite = (sitePath, user, slug) => {
  const req = request(app).get(slug ? `/api/sites/${sitePath}/${slug}` : `/api/sites/${sitePath}`);
  return user ? req.set(authHeader(user)) : req;
};

describe('GET /api/sites/:site_path', () => {
  it('повертає сайт із головною сторінкою, автором і службовими полями', async () => {
    const res = await fetchSite('olena-shop');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: site.id,
      site_path: 'olena-shop',
      title: 'Крамниця Олени',
      status: 'published',
      author: 'olena',
      is_collaborator: false,
      my_permissions: [],
      page_id: home.id,
    });
    expect(res.body.page_content).toEqual(BLOCKS);
    expect(res.body.page).toMatchObject({ id: home.id, slug: 'home', is_homepage: 1 });
    expect(res.body.tags).toEqual([]);
    expect(res.body.products).toEqual([]);
  });

  it('за slug повертає потрібну сторінку', async () => {
    const about = await createPage(site, { name: 'Про нас', slug: 'about', block_content: [{ block_id: 'a1', type: 'text', data: {} }] });
    const res = await fetchSite('olena-shop', null, 'about');
    expect(res.status).toBe(200);
    expect(res.body.page_id).toBe(about.id);
    expect(res.body.page_content).toEqual([{ block_id: 'a1', type: 'text', data: {} }]);
  });

  it('невідомий сайт: 200 і null (а не 404)', async () => {
    const res = await fetchSite('no-such-site');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('невідома сторінка: 200 і null', async () => {
    const res = await fetchSite('olena-shop', null, 'missing');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('сайт без головної сторінки: 200 і null', async () => {
    await query('DELETE FROM pages WHERE id = ?', [home.id]);
    const res = await fetchSite('olena-shop');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('віддає товари сайту разом із категорією', async () => {
    const product = await createProduct(site, { name: 'Кава в зернах', price: 250 });
    const res = await fetchSite('olena-shop');
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0]).toMatchObject({ id: product.id, name: 'Кава в зернах', categories: [] });
  });

  it('віддає теги сайту', async () => {
    const tag = await query("INSERT INTO tags (name) VALUES ('Блог')");
    await query('INSERT INTO site_tags (site_id, tag_id) VALUES (?, ?)', [site.id, tag.insertId]);
    const res = await fetchSite('olena-shop');
    expect(res.body.tags).toEqual([{ id: tag.insertId, name: 'Блог' }]);
  });
});

describe('приватний ключ LiqPay у відповіді', () => {
  const SECRET = 'SECRET-LIQPAY-KEY-xyz';

  it('приватний ключ маскується, публічний віддається як є', async () => {
    const paid = await createSite(owner, { site_path: 'pay-shop', liqpay: { publicKey: 'sandbox_pub_1', privateKey: SECRET } });
    await createPage(paid, { slug: 'home', is_homepage: 1 });
    const res = await fetchSite('pay-shop');
    expect(res.status).toBe(200);
    expect(res.body.liqpay_public_key).toBe('sandbox_pub_1');
    expect(res.body.liqpay_private_key).toBe('********');
    const [row] = await query('SELECT liqpay_private_key FROM sites WHERE id = ?', [paid.id]);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(JSON.stringify(res.body)).not.toContain(row.liqpay_private_key);
  });

  it('якщо ключа немає, поле порожнє', async () => {
    const res = await fetchSite('olena-shop');
    expect(res.body.liqpay_private_key).toBe('');
  });
});

describe('видимість сторінки за статусом сайту й роллю глядача', () => {
  const PAGE = 'сторінка';
  const NULL = 'null';
  const MODERATION = 'модерація 403';
  const SUSPENDED = 'блокування 403';

  // Рядки: статус сайту; стовпці: хто запитує.
  const MATRIX = {
    published:   { anon: PAGE, stranger: PAGE, collaborator: PAGE, owner: PAGE, moderator: PAGE, admin: PAGE },
    maintenance: { anon: PAGE, stranger: PAGE, collaborator: PAGE, owner: PAGE, moderator: PAGE, admin: PAGE },
    private:     { anon: NULL, stranger: NULL, collaborator: PAGE, owner: PAGE, moderator: PAGE, admin: PAGE },
    probation:   { anon: MODERATION, stranger: MODERATION, collaborator: PAGE, owner: PAGE, moderator: PAGE, admin: PAGE },
    suspended:   { anon: SUSPENDED, stranger: SUSPENDED, collaborator: SUSPENDED, owner: SUSPENDED, moderator: PAGE, admin: PAGE },
  };

  let actors;

  beforeEach(async () => {
    const collaborator = await createUser();
    await addCollaborator(site, collaborator, 'viewer', []);
    actors = {
      anon: null,
      stranger: await createUser(),
      collaborator,
      owner,
      moderator: await createUser({ role: 'moderator' }),
      admin: await createUser({ role: 'admin' }),
    };
  });

  for (const [status, row] of Object.entries(MATRIX)) {
    describe(`статус ${status}`, () => {
      for (const [who, expected] of Object.entries(row)) {
        it(`${who}: ${expected}`, async () => {
          await query('UPDATE sites SET status = ? WHERE id = ?', [status, site.id]);
          const res = await fetchSite('olena-shop', actors[who]);
          if (expected === PAGE) {
            expect(res.status).toBe(200);
            expect(res.body.page_id).toBe(home.id);
          } else if (expected === NULL) {
            expect(res.status).toBe(200);
            expect(res.body).toBeNull();
          } else if (expected === MODERATION) {
            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Сайт знаходиться на модерації.');
          } else {
            expect(res.status).toBe(403);
            expect(res.body.isSuspended).toBe(true);
            expect(res.body.message).toContain('заблоковано');
          }
        });
      }
    });
  }

  it('співавтор отримує is_collaborator і власні права, власник — ні', async () => {
    const collaborator = actors.collaborator;
    await query('UPDATE site_collaborators SET permissions = ? WHERE site_id = ? AND user_id = ?', [
      JSON.stringify(['commerce']), site.id, collaborator.id,
    ]);
    const asCollaborator = await fetchSite('olena-shop', collaborator);
    expect(asCollaborator.body).toMatchObject({ is_collaborator: true, my_role: 'viewer', my_permissions: ['commerce'] });
    const asOwner = await fetchSite('olena-shop', owner);
    expect(asOwner.body).toMatchObject({ is_collaborator: false, my_role: null, my_permissions: [] });
  });
});

describe('поля про власника', () => {
  // D-SEC-05 виправлено: email власника бачать лише власник, співавтори з доступом до налаштувань і персонал платформи.
  it('D-SEC-05: GET /api/sites/info/:id без токена не віддає email власника', async () => {
    const res = await request(app).get(`/api/sites/info/${site.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      site_path: 'olena-shop',
      title: 'Крамниця Олени',
      author: 'olena',
      is_online_payment_enabled: 1,
      is_cod_enabled: 1,
    });
    expect(res.body).not.toHaveProperty('author_email');
    expect(JSON.stringify(res.body)).not.toContain(owner.email);
  });

  it('D-SEC-05: GET /api/sites/:site_path без токена не віддає author_email', async () => {
    const res = await fetchSite('olena-shop');
    expect(res.status).toBe(200);
    expect(res.body.author).toBe('olena');
    expect(res.body).not.toHaveProperty('author_email');
  });

  it('D-SEC-05: перебір ідентифікаторів сайтів не дає жодного email', async () => {
    const other = await createUser();
    const otherSite = await createSite(other);
    for (let id = site.id; id <= otherSite.id; id++) {
      const res = await request(app).get(`/api/sites/info/${id}`);
      if (res.status === 200) {
        expect(res.body).not.toHaveProperty('author_email');
        expect(JSON.stringify(res.body)).not.toContain('@');
      }
    }
  });

  describe('author_email на GET /api/sites/:site_path за роллю глядача', () => {
    let settingsViewer, settingsEditor, themeEditor, stranger, admin, moderator;
    beforeEach(async () => {
      settingsViewer = await createUser();
      settingsEditor = await createUser();
      themeEditor = await createUser();
      stranger = await createUser();
      admin = await createUser({ role: 'admin' });
      moderator = await createUser({ role: 'moderator' });
      await addCollaborator(site, settingsViewer, 'viewer', ['settings']);
      await addCollaborator(site, settingsEditor, 'editor', ['settings']);
      await addCollaborator(site, themeEditor, 'editor', ['theme']);
    });

    it.each(['owner', 'settingsViewer', 'settingsEditor', 'admin', 'moderator'])('%s бачить email власника', async (name) => {
      const viewer = { owner, settingsViewer, settingsEditor, admin, moderator }[name];
      const res = await fetchSite('olena-shop', viewer);
      expect(res.status).toBe(200);
      expect(res.body.author_email).toBe(owner.email);
    });

    it.each(['themeEditor', 'stranger'])('%s email власника не бачить', async (name) => {
      const viewer = { themeEditor, stranger }[name];
      const res = await fetchSite('olena-shop', viewer);
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('author_email');
    });
  });

  it('info/:id для неіснуючого сайту — 404', async () => {
    const res = await request(app).get('/api/sites/info/999999');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Сайт не знайдено');
  });
});

describe('облік відвідувань (trackVisit)', () => {
  const viewsOf = async () => (await getSite(site.id)).view_count;
  const visit = (userAgent, user) => {
    const req = request(app).get('/api/sites/olena-shop').set('User-Agent', userAgent);
    return user ? req.set(authHeader(user)) : req;
  };

  it('перший візит збільшує view_count на 1', async () => {
    await visit('visitor-A');
    expect(await viewsOf()).toBe(1);
  });

  it('повторний візит того ж відвідувача (IP і User-Agent) протягом доби не рахується', async () => {
    await visit('visitor-A');
    await visit('visitor-A');
    expect(await viewsOf()).toBe(1);
  });

  it('інший User-Agent вважається новим відвідувачем', async () => {
    await visit('visitor-A');
    await visit('visitor-B');
    expect(await viewsOf()).toBe(2);
  });

  it('через добу той самий відвідувач рахується знову', async () => {
    await visit('visitor-A');
    await query('UPDATE site_visits SET visited_at = DATE_SUB(NOW(), INTERVAL 25 HOUR)');
    await visit('visitor-A');
    expect(await viewsOf()).toBe(2);
  });

  it('візити власника не рахуються', async () => {
    await visit('owner-browser', owner);
    expect(await viewsOf()).toBe(0);
  });

  it('візит співавтора рахується (виключено лише власника)', async () => {
    const collaborator = await createUser();
    await addCollaborator(site, collaborator, 'editor', []);
    await visit('collab-browser', collaborator);
    expect(await viewsOf()).toBe(1);
  });

  it('у site_visits зберігається хеш відвідувача, а не IP', async () => {
    await visit('visitor-A');
    const rows = await query('SELECT * FROM site_visits');
    expect(rows).toHaveLength(1);
    expect(rows[0].visitor_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('візит рахується й тоді, коли сторінку глядач не бачить (приватний сайт)', async () => {
    await query("UPDATE sites SET status = 'private' WHERE id = ?", [site.id]);
    const res = await visit('visitor-A');
    expect(res.body).toBeNull();
    expect(await viewsOf()).toBe(1);
  });

  it('невідомий сайт нічого не рахує й не викликає помилки', async () => {
    const res = await request(app).get('/api/sites/no-such-site').set('User-Agent', 'visitor-A');
    expect(res.status).toBe(200);
    expect(await query('SELECT * FROM site_visits')).toHaveLength(0);
  });
});

describe('GET /api/sites/catalog', () => {
  let sitesByStatus;

  beforeEach(async () => {
    sitesByStatus = {};
    for (const status of ['maintenance', 'private', 'suspended', 'probation']) {
      sitesByStatus[status] = await createSite(owner, { site_path: `${status}-shop`, status });
    }
  });

  const paths = (res) => res.body.map((s) => s.site_path).sort();

  it('анонімному користувачу показує лише published і maintenance', async () => {
    const res = await request(app).get('/api/sites/catalog');
    expect(res.status).toBe(200);
    expect(paths(res)).toEqual(['maintenance-shop', 'olena-shop']);
  });

  it('не віддає email автора й ключі LiqPay', async () => {
    const res = await request(app).get('/api/sites/catalog');
    expect(res.body[0]).toMatchObject({ author: 'olena', tags: [] });
    expect(res.body[0]).not.toHaveProperty('author_email');
    expect(res.body[0]).not.toHaveProperty('liqpay_private_key');
    expect(res.body[0]).not.toHaveProperty('liqpay_public_key');
  });

  it('scope=my для власника показує всі його сайти незалежно від статусу', async () => {
    const res = await request(app).get('/api/sites/catalog?scope=my').set(authHeader(owner));
    expect(paths(res)).toEqual(['maintenance-shop', 'olena-shop', 'private-shop', 'probation-shop', 'suspended-shop']);
  });

  it('фільтр userId для звичайного користувача лишає лише опубліковані сайти', async () => {
    const stranger = await createUser();
    const res = await request(app).get(`/api/sites/catalog?userId=${owner.id}`).set(authHeader(stranger));
    expect(paths(res)).toEqual(['maintenance-shop', 'olena-shop']);
  });

  it('фільтр userId для адміністратора показує всі сайти користувача', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await request(app).get(`/api/sites/catalog?userId=${owner.id}`).set(authHeader(admin));
    expect(paths(res)).toEqual(['maintenance-shop', 'olena-shop', 'private-shop', 'probation-shop', 'suspended-shop']);
  });

  it('сайт, де користувач є співавтором, входить до списку цього користувача', async () => {
    const collaborator = await createUser();
    await addCollaborator(site, collaborator, 'viewer', []);
    const res = await request(app).get(`/api/sites/catalog?userId=${collaborator.id}`);
    expect(paths(res)).toEqual(['olena-shop']);
  });

  it('пошук за назвою', async () => {
    await createSite(owner, { site_path: 'kava-shop', title: 'Кавова крамниця' });
    await createSite(owner, { site_path: 'books-shop', title: 'Книги' });
    const res = await request(app).get('/api/sites/catalog?search=' + encodeURIComponent('Кавов'));
    expect(paths(res)).toEqual(['kava-shop']);
  });

  it('sort=popular: спочатку закріплені, далі за кількістю переглядів', async () => {
    const low = await createSite(owner, { site_path: 'low-views' });
    const mid = await createSite(owner, { site_path: 'mid-views' });
    const high = await createSite(owner, { site_path: 'high-views' });
    await query('UPDATE sites SET view_count = 5 WHERE id = ?', [low.id]);
    await query('UPDATE sites SET view_count = 20 WHERE id = ?', [mid.id]);
    await query('UPDATE sites SET view_count = 50 WHERE id = ?', [high.id]);
    const byViews = await request(app).get('/api/sites/catalog?sort=popular&userId=' + owner.id);
    expect(byViews.body.slice(0, 3).map((s) => s.site_path)).toEqual(['high-views', 'mid-views', 'low-views']);
    await query('UPDATE sites SET is_pinned = 1 WHERE id = ?', [low.id]);
    const pinnedFirst = await request(app).get('/api/sites/catalog?sort=popular&userId=' + owner.id);
    expect(pinnedFirst.body[0].site_path).toBe('low-views');
  });
});

describe('GET /api/sites/templates', () => {
  const CONTENT = { pages: [{ title: 'Головна', slug: 'home', blocks: [] }] };

  it('віддає лише готові публічні системні шаблони', async () => {
    const publicTpl = await createTemplate(null, { name: 'Публічний', content: CONTENT });
    await createTemplate(null, { name: 'Чернетка', is_ready: 0 });
    await createTemplate(null, { name: 'Для адмінів', access_level: 'admin_only' });
    await createTemplate(owner, { name: 'Особистий', type: 'personal', access_level: 'private' });
    const res = await request(app).get('/api/sites/templates');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: publicTpl.id, name: 'Публічний', is_ready: 1, access_level: 'public' });
    expect(res.body[0].default_block_content).toEqual(CONTENT);
  });

  // KNOWN-DEFECT D-SEC-17: рівень доступу admin_only не перевіряється за роллю користувача.
  it('KNOWN-DEFECT D-SEC-17: параметр include_drafts=true показує шаблони admin_only анонімному користувачу', async () => {
    await createTemplate(null, { name: 'Публічний' });
    await createTemplate(null, { name: 'Для адмінів', access_level: 'admin_only' });
    const res = await request(app).get('/api/sites/templates?include_drafts=true');
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.name).sort()).toEqual(['Для адмінів', 'Публічний']);
  });
});

describe('допоміжні публічні маршрути', () => {
  it('GET /api/sites/default-logos віддає три стандартні логотипи', async () => {
    const res = await request(app).get('/api/sites/default-logos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(['/logos/logo1.png', '/logos/logo2.png', '/logos/logo3.png']);
  });
});

describe('конфлікти маршрутів /api/sites/:a/:b', () => {
  // KNOWN-DEFECT D-ARC-11: /:id/analytics і /:siteId/pages оголошені раніше за /:site_path/:slug.
  it('KNOWN-DEFECT D-ARC-11: сторінка зі slug "analytics" недоступна публічно (запит перехоплює маршрут аналітики)', async () => {
    await createPage(site, { name: 'Аналітика', slug: 'analytics', block_content: BLOCKS });
    const res = await request(app).get('/api/sites/olena-shop/analytics');
    expect(res.status).toBe(401);
  });

  it('KNOWN-DEFECT D-ARC-11: сторінка зі slug "pages" недоступна публічно (запит перехоплює список сторінок)', async () => {
    await createPage(site, { name: 'Сторінки', slug: 'pages', block_content: BLOCKS });
    const res = await request(app).get('/api/sites/olena-shop/pages');
    expect(res.status).toBe(401);
  });
});

// Команда сайту (/api/team): блокування редагування, запрошення, співавтори, права, передача сайту.
// Фіксує D-SEC-15 (список співавторів без перевірки доступу), D-SEC-16 (блокування сайту без перевірки доступу),
// D-SEC-06 (permissions зберігаються, але не діють), D-ARC-10.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { query } from '../helpers/testDb.js';
import {
  createUser, createSite, addCollaborator, createInvite, setSiteLock, getSite, getCollaboratorRows, countRows,
} from '../helpers/factories.js';

useTestDatabase();

const PASSWORD = 'owner-pass-1';
const EDITOR_PERMISSIONS = ['editor', 'theme'];
const VIEWER_PERMISSIONS = ['overview'];
const DEFAULT_PERMISSIONS = ['editor', 'theme', 'commerce', 'overview'];

let owner, editor, viewer, stranger, candidate, site;

beforeEach(async () => {
  owner = await createUser({ plan: 'PLUS', password: PASSWORD, username: 'olena' });
  editor = await createUser({ username: 'editor_user' });
  viewer = await createUser({ username: 'viewer_user' });
  stranger = await createUser({ username: 'stranger_user' });
  candidate = await createUser({ username: 'candidate_user' });
  site = await createSite(owner, { site_path: 'acme-shop', title: 'Акме' });
  await addCollaborator(site, editor, 'editor', EDITOR_PERMISSIONS);
  await addCollaborator(site, viewer, 'viewer', VIEWER_PERMISSIONS);
});

const actor = (name) => ({ anon: null, stranger, viewer, editor, owner, candidate })[name];
const withAuth = (req, user) => (user ? req.set(authHeader(user)) : req);
const team = (method, url, user, body) => {
  const req = withAuth(request(app)[method](`/api/team${url}`), user);
  return body === undefined ? req : req.send(body);
};
const lockOf = async () => {
  const row = await getSite(site.id);
  return { by: row.locked_by_user_id, until: row.locked_until };
};

describe('блокування редагування сайту', () => {
  it('тести виконуються в UTC (інакше порівняння TIMESTAMP із new Date() залежить від пояса комп\'ютера)', () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
  });

  describe('POST /api/team/:id/lock (heartbeat)', () => {
    it('без токена — 401', async () => {
      expect((await team('post', `/${site.id}/lock`, null)).status).toBe(401);
    });

    it('власник займає сайт приблизно на хвилину', async () => {
      const res = await team('post', `/${site.id}/lock`, owner);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ locked: false });
      const { by, until } = await lockOf();
      expect(by).toBe(owner.id);
      expect(new Date(until).getTime()).toBeGreaterThan(Date.now());
      expect(new Date(until).getTime()).toBeLessThan(Date.now() + 2 * 60 * 1000);
    });

    it('інший користувач, поки блокування діє, отримує 423 з іменем того, хто редагує', async () => {
      await team('post', `/${site.id}/lock`, owner);
      const res = await team('post', `/${site.id}/lock`, editor);
      expect(res.status).toBe(423);
      expect(res.body).toEqual({ locked: true, lockedBy: 'olena' });
      expect((await lockOf()).by).toBe(owner.id);
    });

    it('блокування, що спливло, можна перехопити', async () => {
      await setSiteLock(site, owner, -5000);
      const res = await team('post', `/${site.id}/lock`, editor);
      expect(res.status).toBe(200);
      expect((await lockOf()).by).toBe(editor.id);
    });

    it('власне блокування продовжується', async () => {
      await setSiteLock(site, owner, 10 * 1000);
      const res = await team('post', `/${site.id}/lock`, owner);
      expect(res.status).toBe(200);
      const { until } = await lockOf();
      expect(new Date(until).getTime()).toBeGreaterThan(Date.now() + 20 * 1000);
    });

    it('неіснуючий сайт — 404', async () => {
      const res = await team('post', '/999999/lock', owner);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Сайт не знайдено');
    });

    // KNOWN-DEFECT D-SEC-16: доступ до сайту не перевіряється, тож будь-який користувач може його заблокувати.
    it('KNOWN-DEFECT D-SEC-16: сторонній користувач блокує чужий сайт, власник отримує 423 і не може зберегти налаштування', async () => {
      const lock = await team('post', `/${site.id}/lock`, stranger);
      expect(lock.status).toBe(200);
      expect(lock.body).toEqual({ locked: false });

      const heartbeat = await team('post', `/${site.id}/lock`, owner);
      expect(heartbeat.status).toBe(423);
      expect(heartbeat.body.lockedBy).toBe('stranger_user');

      const save = await withAuth(request(app).put('/api/sites/acme-shop/settings'), owner).send({ title: 'Нова назва' });
      expect(save.status).toBe(423);
      expect((await getSite(site.id)).title).toBe('Акме');
    });
  });

  describe('POST /api/team/:id/unlock', () => {
    it('той, хто заблокував, знімає блокування', async () => {
      await setSiteLock(site, editor, 60 * 1000);
      const res = await team('post', `/${site.id}/unlock`, editor);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(await lockOf()).toEqual({ by: null, until: null });
    });

    it('чуже блокування не знімається, хоча відповідь успішна', async () => {
      await setSiteLock(site, owner, 60 * 1000);
      const res = await team('post', `/${site.id}/unlock`, stranger);
      expect(res.status).toBe(200);
      expect((await lockOf()).by).toBe(owner.id);
    });
  });
});

describe('запрошення співавторів', () => {
  describe('POST /api/team/:id/invite', () => {
    it('власник створює посилання, чинне 48 годин', async () => {
      const res = await team('post', `/${site.id}/invite`, owner);
      expect(res.status).toBe(200);
      expect(res.body.inviteLink).toMatch(/^http:\/\/localhost:5173\/invite\/[0-9a-f]{64}$/);
      const invites = await query('SELECT * FROM site_invites WHERE site_id = ?', [site.id]);
      expect(invites).toHaveLength(1);
      expect(res.body.inviteLink.endsWith(invites[0].token)).toBe(true);
      expect(invites[0]).toMatchObject({ created_by: owner.id, role: 'editor' });
      const hours = (new Date(invites[0].expires_at).getTime() - Date.now()) / 3600000;
      expect(hours).toBeGreaterThan(47);
      expect(hours).toBeLessThan(49);
    });

    it('нове посилання замінює попереднє', async () => {
      const old = await createInvite(site, owner);
      const res = await team('post', `/${site.id}/invite`, owner);
      expect(res.status).toBe(200);
      const tokens = (await query('SELECT token FROM site_invites')).map((r) => r.token);
      expect(tokens).toHaveLength(1);
      expect(tokens).not.toContain(old.token);
    });

    it.each(['editor', 'stranger'])('%s не може створювати запрошення — 403', async (who) => {
      const res = await team('post', `/${site.id}/invite`, actor(who));
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Тільки власник може запрошувати користувачів.');
      expect(await countRows('site_invites')).toBe(0);
    });

    it('неіснуючий сайт — 403', async () => {
      expect((await team('post', '/999999/invite', owner)).status).toBe(403);
    });

    it('без токена — 401', async () => {
      expect((await team('post', `/${site.id}/invite`, null)).status).toBe(401);
    });
  });

  describe('GET /api/team/:id/invite', () => {
    it('віддає чинне посилання', async () => {
      const invite = await createInvite(site, owner);
      const res = await team('get', `/${site.id}/invite`, owner);
      expect(res.status).toBe(200);
      expect(res.body.inviteLink).toBe(`http://localhost:5173/invite/${invite.token}`);
    });

    it('без запрошення або зі строком, що вийшов, віддає null', async () => {
      expect((await team('get', `/${site.id}/invite`, owner)).body).toEqual({ inviteLink: null });
      await createInvite(site, owner, { hours: -1 });
      expect((await team('get', `/${site.id}/invite`, owner)).body).toEqual({ inviteLink: null });
    });

    it.each(['editor', 'stranger'])('%s — 403', async (who) => {
      const res = await team('get', `/${site.id}/invite`, actor(who));
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Доступ заборонено.');
    });
  });

  describe('DELETE /api/team/:id/invite', () => {
    it('власник скасовує запрошення', async () => {
      await createInvite(site, owner);
      const res = await team('delete', `/${site.id}/invite`, owner);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Запрошення успішно видалено.');
      expect(await countRows('site_invites')).toBe(0);
    });

    it('сторонній користувач — 403, запрошення лишається', async () => {
      await createInvite(site, owner);
      const res = await team('delete', `/${site.id}/invite`, stranger);
      expect(res.status).toBe(403);
      expect(await countRows('site_invites')).toBe(1);
    });
  });

  describe('POST /api/team/invite/accept', () => {
    it('користувач із чинним посиланням стає співавтором із типовими правами; запрошення одноразове', async () => {
      const invite = await createInvite(site, owner);
      const res = await team('post', '/invite/accept', candidate, { token: invite.token });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Ви успішно приєдналися до проєкту!', siteId: site.id });
      const row = (await getCollaboratorRows(site.id)).find((r) => r.user_id === candidate.id);
      expect(row).toMatchObject({ role: 'editor', permissions: DEFAULT_PERMISSIONS });
      expect(await countRows('site_invites')).toBe(0);

      const again = await team('post', '/invite/accept', stranger, { token: invite.token });
      expect(again.status).toBe(400);
    });

    it('роль береться із запрошення', async () => {
      const invite = await createInvite(site, owner, { role: 'viewer' });
      await team('post', '/invite/accept', candidate, { token: invite.token });
      const row = (await getCollaboratorRows(site.id)).find((r) => r.user_id === candidate.id);
      expect(row.role).toBe('viewer');
    });

    it.each([
      ['невідомий токен', () => ({ token: 'no-such-token' })],
      ['без токена в тілі', () => ({})],
    ])('%s — 400', async (_label, body) => {
      const res = await team('post', '/invite/accept', candidate, body());
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Посилання недійсне або прострочене.');
    });

    it('прострочене запрошення — 400', async () => {
      const invite = await createInvite(site, owner, { hours: -1 });
      const res = await team('post', '/invite/accept', candidate, { token: invite.token });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Посилання недійсне або прострочене.');
    });

    it('власник не може прийняти запрошення на власний сайт — 400, запрошення лишається', async () => {
      const invite = await createInvite(site, owner);
      const res = await team('post', '/invite/accept', owner, { token: invite.token });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Ви вже є власником цього сайту.');
      expect(await countRows('site_invites')).toBe(1);
    });

    it('наявний співавтор не змінює ні роль, ні права, але запрошення витрачається', async () => {
      const invite = await createInvite(site, owner, { role: 'editor' });
      const res = await team('post', '/invite/accept', viewer, { token: invite.token });
      expect(res.status).toBe(200);
      const row = (await getCollaboratorRows(site.id)).find((r) => r.user_id === viewer.id);
      expect(row).toMatchObject({ role: 'viewer', permissions: VIEWER_PERMISSIONS });
      expect(await countRows('site_invites')).toBe(0);
    });

    it('без токена авторизації — 401', async () => {
      const invite = await createInvite(site, owner);
      expect((await team('post', '/invite/accept', null, { token: invite.token })).status).toBe(401);
    });
  });
});

describe('співавтори', () => {
  describe('GET /api/team/:id/collaborators', () => {
    it('власник бачить співавторів із поштою, роллю й правами', async () => {
      const res = await team('get', `/${site.id}/collaborators`, owner);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      const byId = Object.fromEntries(res.body.map((c) => [c.id, c]));
      expect(byId[editor.id]).toMatchObject({ username: 'editor_user', email: editor.email, role: 'editor', permissions: EDITOR_PERMISSIONS });
      expect(byId[viewer.id]).toMatchObject({ username: 'viewer_user', email: viewer.email, role: 'viewer', permissions: VIEWER_PERMISSIONS });
    });

    // KNOWN-DEFECT D-SEC-15: доступ до сайту не перевіряється.
    it('KNOWN-DEFECT D-SEC-15: сторонній користувач отримує пошту й права співавторів чужого сайту', async () => {
      const res = await team('get', `/${site.id}/collaborators`, stranger);
      expect(res.status).toBe(200);
      expect(res.body.map((c) => c.email).sort()).toEqual([editor.email, viewer.email].sort());
      expect(res.body.find((c) => c.id === editor.id).permissions).toEqual(EDITOR_PERMISSIONS);
    });

    it('неіснуючий сайт — порожній список', async () => {
      const res = await team('get', '/999999/collaborators', owner);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('без токена — 401', async () => {
      expect((await team('get', `/${site.id}/collaborators`, null)).status).toBe(401);
    });
  });

  describe('DELETE /api/team/:id/collaborators/:userId', () => {
    it('власник видаляє співавтора', async () => {
      const res = await team('delete', `/${site.id}/collaborators/${editor.id}`, owner);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Користувача видалено з команди.');
      expect((await getCollaboratorRows(site.id)).map((r) => r.user_id)).toEqual([viewer.id]);
    });

    it('співавтор може вийти з команди сам', async () => {
      const res = await team('delete', `/${site.id}/collaborators/${viewer.id}`, viewer);
      expect(res.status).toBe(200);
      expect((await getCollaboratorRows(site.id)).map((r) => r.user_id)).toEqual([editor.id]);
    });

    it('співавтор не може видалити іншого співавтора — 403', async () => {
      const res = await team('delete', `/${site.id}/collaborators/${viewer.id}`, editor);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Недостатньо прав.');
      expect(await getCollaboratorRows(site.id)).toHaveLength(2);
    });

    it('сторонній користувач не може видалити співавтора — 403', async () => {
      const res = await team('delete', `/${site.id}/collaborators/${editor.id}`, stranger);
      expect(res.status).toBe(403);
      expect(await getCollaboratorRows(site.id)).toHaveLength(2);
    });
  });

  describe('PUT /api/team/:id/collaborators/:userId/permissions', () => {
    it('власник змінює права; роль лишається', async () => {
      const res = await team('put', `/${site.id}/collaborators/${editor.id}/permissions`, owner, { permissions: ['commerce'] });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Права доступу успішно оновлено.');
      const row = (await getCollaboratorRows(site.id)).find((r) => r.user_id === editor.id);
      expect(row).toMatchObject({ role: 'editor', permissions: ['commerce'] });
    });

    it('значення прав не перевіряються: зберігається будь-який масив, без поля permissions — порожній', async () => {
      await team('put', `/${site.id}/collaborators/${editor.id}/permissions`, owner, { permissions: ['hack', 123, { a: 1 }] });
      let row = (await getCollaboratorRows(site.id)).find((r) => r.user_id === editor.id);
      expect(row.permissions).toEqual(['hack', 123, { a: 1 }]);
      await team('put', `/${site.id}/collaborators/${editor.id}/permissions`, owner, {});
      row = (await getCollaboratorRows(site.id)).find((r) => r.user_id === editor.id);
      expect(row.permissions).toEqual([]);
    });

    it.each(['editor', 'stranger'])('%s не може змінювати права — 403', async (who) => {
      const res = await team('put', `/${site.id}/collaborators/${editor.id}/permissions`, actor(who), { permissions: ['commerce', 'overview'] });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Тільки власник може змінювати права.');
      const row = (await getCollaboratorRows(site.id)).find((r) => r.user_id === editor.id);
      expect(row.permissions).toEqual(EDITOR_PERMISSIONS);
    });
  });
});

describe('передача сайту', () => {
  const body = (overrides = {}) => ({ newOwnerEmail: candidate.email, password: PASSWORD, ...overrides });

  describe('POST /api/team/:id/transfer/verify', () => {
    it('власник із вірним паролем проходить перевірку', async () => {
      const res = await team('post', `/${site.id}/transfer/verify`, owner, body());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('невірний пароль — 403', async () => {
      const res = await team('post', `/${site.id}/transfer/verify`, owner, body({ password: 'wrong' }));
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Невірний пароль.');
    });

    it('невідомий email — 404', async () => {
      const res = await team('post', `/${site.id}/transfer/verify`, owner, body({ newOwnerEmail: 'nobody@test.local' }));
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Користувача з таким email не знайдено.');
    });

    it('передача самому собі — 400', async () => {
      const res = await team('post', `/${site.id}/transfer/verify`, owner, body({ newOwnerEmail: owner.email }));
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Ви не можете передати сайт самому собі.');
    });

    it('акаунт без пароля (вхід через Google) — 400 із підказкою встановити пароль', async () => {
      await query('UPDATE users SET password_hash = NULL WHERE id = ?', [owner.id]);
      const res = await team('post', `/${site.id}/transfer/verify`, owner, body());
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Google');
    });

    it.each(['editor', 'stranger'])('%s — 403', async (who) => {
      const res = await team('post', `/${site.id}/transfer/verify`, actor(who), body({ newOwnerEmail: candidate.email }));
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Тільки поточний власник може передати сайт.');
    });

    it('KNOWN-DEFECT D-ARC-10: без пароля у запиті — 500 (виняток bcrypt), а не 400', async () => {
      const res = await team('post', `/${site.id}/transfer/verify`, owner, { newOwnerEmail: candidate.email });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/team/:id/transfer', () => {
    it('сайт переходить новому власнику; обидва запису співавторів зникають, інші лишаються, блокування знімається', async () => {
      await addCollaborator(site, candidate, 'viewer', VIEWER_PERMISSIONS);
      await setSiteLock(site, editor, 60 * 1000);
      const res = await team('post', `/${site.id}/transfer`, owner, body());
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Сайт успішно передано новому власнику!');
      const row = await getSite(site.id);
      expect(row.user_id).toBe(candidate.id);
      expect(row.locked_by_user_id).toBeNull();
      expect((await getCollaboratorRows(site.id)).map((r) => r.user_id).sort()).toEqual([editor.id, viewer.id].sort());
    });

    it('попередній власник втрачає доступ, новий отримує', async () => {
      await team('post', `/${site.id}/transfer`, owner, body());
      const former = await withAuth(request(app).put('/api/sites/acme-shop/settings'), owner).send({ title: 'Нова назва' });
      expect(former.status).toBe(403);
      const current = await withAuth(request(app).put('/api/sites/acme-shop/settings'), candidate).send({ title: 'Нова назва' });
      expect(current.status).toBe(200);
    });

    it('співавтор може стати власником', async () => {
      const res = await team('post', `/${site.id}/transfer`, owner, body({ newOwnerEmail: editor.email }));
      expect(res.status).toBe(200);
      expect((await getSite(site.id)).user_id).toBe(editor.id);
      expect((await getCollaboratorRows(site.id)).map((r) => r.user_id)).toEqual([viewer.id]);
    });

    it.each([
      ['невірний пароль', () => body({ password: 'wrong' }), 403, 'Невірний пароль.'],
      ['невідомий email', () => body({ newOwnerEmail: 'nobody@test.local' }), 404, 'Користувача з таким email не знайдено.'],
      ['передача самому собі', () => body({ newOwnerEmail: owner.email }), 400, 'Ви не можете передати сайт самому собі.'],
    ])('%s — відмова, власник не змінюється', async (_label, payload, status, message) => {
      const res = await team('post', `/${site.id}/transfer`, owner, payload());
      expect(res.status).toBe(status);
      expect(res.body.message).toBe(message);
      expect((await getSite(site.id)).user_id).toBe(owner.id);
    });

    it('акаунт без пароля — 400', async () => {
      await query('UPDATE users SET password_hash = NULL WHERE id = ?', [owner.id]);
      const res = await team('post', `/${site.id}/transfer`, owner, body());
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Встановіть пароль у профілі.');
    });

    it.each(['editor', 'stranger'])('%s не може передати чужий сайт — 403', async (who) => {
      const res = await team('post', `/${site.id}/transfer`, actor(who), body({ newOwnerEmail: actor(who).email, password: 'any' }));
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Тільки поточний власник може передати сайт.');
      expect((await getSite(site.id)).user_id).toBe(owner.id);
    });
  });
});

// Видалення й відновлення акаунта (DELETE /api/users/me, POST /api/users/me/restore) та поведінка видаленого акаунта.
// Фіксує D-BIZ-06 (видалення акаунта падає з 500 після зміни стану), D-SEC-10 (токен відновлення без token_version),
// D-SEC-23 (обмеження для видаленого акаунта обходиться рядком запиту), D-BIZ-14 (відкладене видалення лише при вході).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader, tokenFor } from '../helpers/auth.js';
import { quietly } from '../helpers/outbound.js';
import { fromIp } from '../helpers/client.js';
import { query } from '../helpers/testDb.js';
import { createUser, createSite, patchUser, getUser, getSite, countRows } from '../helpers/factories.js';

useTestDatabase();

const PASSWORD = 'Strong-pass1';
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY);

let user;
beforeEach(async () => {
  user = await createUser({ username: 'olena', email: 'olena@test.local', password: PASSWORD });
});

const softDelete = (days = 3) => patchUser(user, { status: 'deleted', deleted_at: daysAgo(days) });
const restore = (header = authHeader(user)) => request(app).post('/api/users/me/restore').set(header);

describe('DELETE /api/users/me', () => {
  it('без токена — 401', async () => {
    const res = await request(app).delete('/api/users/me').send({ confirmation: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['без підтвердження', {}],
    ['неправильне слово', { confirmation: 'delete' }],
  ])('%s — 400, акаунт не змінюється', async (_label, body) => {
    const res = await request(app).delete('/api/users/me').set(authHeader(user)).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Невірне підтвердження.' });
    expect(await getUser(user.id)).toMatchObject({ status: 'active', deleted_at: null });
  });

  // KNOWN-DEFECT D-BIZ-06: після softDeleteUser викликається Site.setAllUserSitesToDraft, якого немає в коді.
  // Користувач бачить помилку 500, але акаунт уже позначено видаленим, а його сайти лишились опублікованими.
  it('KNOWN-DEFECT D-BIZ-06: видалення акаунта — 500, акаунт позначено видаленим, сайти не переведено в чернетки', async () => {
    const site = await createSite(user, { status: 'published' });
    const res = await quietly(() =>
      request(app).delete('/api/users/me').set(authHeader(user)).send({ confirmation: 'DELETE' })
    );
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/setAllUserSitesToDraft/);

    const row = await getUser(user.id);
    expect(row.status).toBe('deleted');
    expect(row.deleted_at).toBeInstanceOf(Date);
    expect((await getSite(site.id)).status).toBe('published');
  });
});

describe('акаунт у стані видалення (14 днів на відновлення)', () => {
  it.each([
    ['GET', '/api/support/my-tickets'],
    ['PUT', '/api/users/profile'],
    ['POST', '/api/auth/refresh'],
  ])('%s %s для видаленого акаунта — 403 ACCOUNT_DELETED', async (method, url) => {
    await softDelete();
    const res = await request(app)[method.toLowerCase()](url).set(authHeader(user));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Акаунт видалено. Необхідно відновити.', code: 'ACCOUNT_DELETED' });
  });

  it('POST /api/users/me/restore відновлює акаунт і видає новий токен на 24 години', async () => {
    await softDelete();
    const res = await restore();
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Акаунт успішно відновлено!');
    expect(res.body.user).toMatchObject({ id: user.id, username: 'olena', role: 'user', plan: 'FREE', has_password: true });
    expect(res.body.user.stats).toMatchObject({ siteCount: 0, siteLimit: 3 });
    expect(await getUser(user.id)).toMatchObject({ status: 'active', deleted_at: null });

    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: user.id, role: 'user', plan: 'FREE' });
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
  });

  it('активний акаунт відновлювати не потрібно — 400', async () => {
    const res = await restore();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Акаунт не потребує відновлення або не знайдено.' });
  });

  it('токен «лише для відновлення», виданий входом, відновлює акаунт', async () => {
    await softDelete();
    const login = await fromIp(request(app).post('/api/auth/login')).send({ loginInput: 'olena', password: PASSWORD });
    expect(login.body.require_restore).toBe(true);
    const res = await restore({ Authorization: `Bearer ${login.body.token}` });
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).status).toBe('active');
  });

  it('після відновлення звичайні маршрути знову доступні', async () => {
    await softDelete();
    const res = await restore();
    const tickets = await request(app).get('/api/support/my-tickets').set('Authorization', `Bearer ${res.body.token}`);
    expect(tickets.status).toBe(200);
  });

  // KNOWN-DEFECT D-SEC-10: токен відновлення видається без token_version і не відкликається зміною версії.
  it('KNOWN-DEFECT D-SEC-10: токен відновлення не має token_version і переживає зміну версії, а токен входу — ні', async () => {
    await softDelete();
    const res = await restore();
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET)).not.toHaveProperty('token_version');

    await patchUser(user, { token_version: 1 }); // скидання пароля
    const survivor = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    const stale = await request(app).get('/api/auth/me').set(authHeader(user));
    expect(survivor.status).toBe(200);
    expect(stale.status).toBe(401);
  });

  // KNOWN-DEFECT D-SEC-23: verifyToken визначає «маршрут відновлення» за підрядком у req.originalUrl, а той включає рядок запиту.
  it.each([
    ['/api/support/my-tickets?next=/restore'],
    ['/api/support/my-tickets?from=/auth/me'],
    ['/api/support/my-tickets?x=/users/me'],
  ])('KNOWN-DEFECT D-SEC-23: %s обходить заборону для видаленого акаунта', async (url) => {
    await softDelete();
    const blocked = await request(app).get('/api/support/my-tickets').set(authHeader(user));
    expect(blocked.status).toBe(403);
    const res = await request(app).get(url).set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// KNOWN-DEFECT D-BIZ-14: «безповоротне видалення через 14 днів» виконується лише коли власник акаунта сам спробує увійти
// або викличе /auth/me. Фонового завдання немає: єдина подія БД очищає попередження, а не акаунти.
describe('D-BIZ-14: видалення після 14 днів виконується лише при вході', () => {
  it('KNOWN-DEFECT D-BIZ-14: у схемі немає події, що видаляє акаунти', async () => {
    const events = await query('SELECT event_name AS name FROM information_schema.events WHERE event_schema = DATABASE()');
    expect(events.map((event) => event.name).filter((name) => /user|account|delet/i.test(name))).toEqual([]);
  });

  it('KNOWN-DEFECT D-BIZ-14: акаунт, видалений 20 днів тому, лишається в БД, доки власник не спробує увійти', async () => {
    await createSite(user);
    await softDelete(20);
    expect(await countRows('users', 'id = ?', [user.id])).toBe(1);
    expect(await countRows('sites', 'user_id = ?', [user.id])).toBe(1);
  });

  it('вхід після 14 днів стирає акаунт разом із сайтами (каскад зовнішніх ключів)', async () => {
    await createSite(user);
    await softDelete(20);
    const res = await fromIp(request(app).post('/api/auth/login')).send({ loginInput: 'olena', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Акаунт видалено безповоротно.' });
    expect(await countRows('users', 'id = ?', [user.id])).toBe(0);
    expect(await countRows('sites', 'user_id = ?', [user.id])).toBe(0);
  });

  it('GET /api/auth/me після 14 днів теж стирає акаунт', async () => {
    await softDelete(20);
    const res = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${tokenFor(user)}` });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Акаунт видалено безповоротно.' });
    expect(await countRows('users', 'id = ?', [user.id])).toBe(0);
  });

  it('до 14 днів /auth/me віддає ознаку require_restore', async () => {
    await softDelete(5);
    const res = await request(app).get('/api/auth/me').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: user.id, username: 'olena', email: 'olena@test.local', status: 'deleted', require_restore: true,
      message: 'Акаунт в процесі видалення. Бажаєте відновити?',
    });
  });
});

// Підтримка (/api/support): звернення, відповіді, статуси, апеляції щодо сайтів.
// Фіксує D-CON-01 (маршрут адмін-панелі не існує, модератор бачить список, але не може працювати зі зверненнями) і виправлення
// D-SEC-24 (апеляцію подає лише власник заблокованого сайту). Завантаження вкладень (Cloudinary) не охоплене.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { query } from '../helpers/testDb.js';
import {
  createUser, createSite, createTicket, addTicketReply, getTicket, getTicketReplies, countRows,
} from '../helpers/factories.js';

useTestDatabase();

let owner, other, admin, moderator;
beforeEach(async () => {
  owner = await createUser({ username: 'olena', email: 'olena@test.local' });
  other = await createUser({ username: 'other', email: 'other@test.local' });
  admin = await createUser({ role: 'admin', username: 'root', email: 'admin@test.local' });
  moderator = await createUser({ role: 'moderator', username: 'mod', email: 'mod@test.local' });
});

const as = (req, user) => (user ? req.set(authHeader(user)) : req);
const open = (user, body) => as(request(app).post('/api/support'), user).send(body);
const getTicketApi = (id, user) => as(request(app).get(`/api/support/${id}`), user);
const reply = (id, user, body = {}) => as(request(app).post(`/api/support/${id}/reply`), user).send(body);
const setStatus = (id, user, status) => as(request(app).put(`/api/support/${id}/status`), user).send({ status });
const adminList = (user, search = '') => as(request(app).get(`/api/support/admin/tickets${search}`), user);

describe('POST /api/support (створення звернення)', () => {
  it('без токена — 401', async () => {
    const res = await open(null, { subject: 'Тема', body: 'Текст' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['без теми', { body: 'Текст' }],
    ['без тексту', { subject: 'Тема' }],
  ])('%s — 400', async (_label, body) => {
    const res = await open(owner, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Тема та текст звернення є обов'язковими." });
    expect(await countRows('support_tickets')).toBe(0);
  });

  it('створює звичайне звернення зі статусом open', async () => {
    const res = await open(owner, { subject: 'Не працює оплата', body: 'Опис проблеми' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      subject: 'Не працює оплата', body: 'Опис проблеми', status: 'open', type: 'general', message: 'Звернення створено.',
    });
    const row = await getTicket(res.body.id);
    expect(row).toMatchObject({
      user_id: owner.id, subject: 'Не працює оплата', status: 'open', type: 'general', closed_by: null, attachments: [],
    });
  });

  // Вік звернення задано з півхвилини: MySQL округлює дробові секунди TIMESTAMP, тож на межі цілої хвилини
  // залишок час від часу виходив на хвилину більшим (мінливий тест).
  it('не частіше разу на 20 хвилин: повторне звернення — 429 із залишком часу', async () => {
    await createTicket(owner, { minutesAgo: 1.5 });
    const res = await open(owner, { subject: 'Ще одне', body: 'Текст' });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ message: 'Ви занадто часто створюєте звернення. Зачекайте ще 19 хв.' });
    expect(await countRows('support_tickets')).toBe(1);
  });

  it('через 19,5 хвилини ще 429 (залишилась 1 хв.), через 21 — дозволено', async () => {
    await createTicket(owner, { minutesAgo: 19.5 });
    const early = await open(owner, { subject: 'Ще одне', body: 'Текст' });
    expect(early.status).toBe(429);
    expect(early.body.message).toBe('Ви занадто часто створюєте звернення. Зачекайте ще 1 хв.');

    await createTicket(other, { minutesAgo: 21 });
    const later = await open(other, { subject: 'Ще одне', body: 'Текст' });
    expect(later.status).toBe(201);
  });

  it('обмеження персональне: інший користувач створює звернення одразу', async () => {
    await createTicket(owner, { minutesAgo: 1 });
    const res = await open(other, { subject: 'Тема', body: 'Текст' });
    expect(res.status).toBe(201);
  });

  it('із siteId створюється апеляція: тип appeal і запис у site_appeals', async () => {
    const site = await createSite(owner, { status: 'suspended' });
    const res = await open(owner, { subject: 'Апеляція', body: 'Прошу переглянути', siteId: site.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'appeal', message: 'Апеляцію подано успішно.' });
    const appeals = await query('SELECT * FROM site_appeals WHERE site_id = ?', [site.id]);
    expect(appeals).toHaveLength(1);
    expect(appeals[0]).toMatchObject({ user_id: owner.id, ticket_id: res.body.id, status: 'pending' });
  });

  it('на один сайт — одна апеляція, повторна — 400 без нового звернення', async () => {
    const site = await createSite(owner, { status: 'suspended' });
    await open(owner, { subject: 'Апеляція', body: 'Текст', siteId: site.id });
    await query('UPDATE support_tickets SET created_at = created_at - INTERVAL 1 HOUR');
    const again = await open(owner, { subject: 'Ще раз', body: 'Текст', siteId: site.id });
    expect(again.status).toBe(400);
    expect(again.body).toEqual({ message: 'Для цього сайту вже подано апеляцію. Ви не можете створити нову.' });
    expect(await countRows('support_tickets')).toBe(1);
  });

  // D-SEC-24 виправлено: апеляцію подає лише власник сайту, і лише коли сайт заблоковано.
  it('D-SEC-24: сторонній не подає апеляцію від імені чужого сайту, власник її подає', async () => {
    const site = await createSite(owner, { status: 'suspended' });
    const squatted = await open(other, { subject: 'Апеляція', body: 'Текст', siteId: site.id });
    expect(squatted.status).toBe(403);
    expect(squatted.body).toEqual({ message: 'Апеляцію можна подати лише на власний сайт.' });
    expect(await countRows('support_tickets')).toBe(0);
    expect(await countRows('site_appeals')).toBe(0);

    const rightful = await open(owner, { subject: 'Моя апеляція', body: 'Текст', siteId: site.id });
    expect(rightful.status).toBe(201);
    const appeals = await query('SELECT user_id FROM site_appeals WHERE site_id = ?', [site.id]);
    expect(appeals.map((appeal) => appeal.user_id)).toEqual([owner.id]);
  });

  it('D-SEC-24: на працюючий сайт власника апеляцію подати не можна', async () => {
    const site = await createSite(owner, { status: 'published' });
    const res = await open(owner, { subject: 'Апеляція', body: 'Текст', siteId: site.id });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Апеляцію можна подати лише на заблокований сайт.' });
    expect(await countRows('support_tickets')).toBe(0);
    expect(await countRows('site_appeals')).toBe(0);
  });

  it('D-SEC-24: неіснуючий сайт — 403 без звернення й без помилки зовнішнього ключа', async () => {
    const res = await open(owner, { subject: 'Апеляція', body: 'Текст', siteId: 999999 });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Апеляцію можна подати лише на власний сайт.' });
    expect(await countRows('support_tickets')).toBe(0);
    expect(await countRows('site_appeals')).toBe(0);
  });
});

describe('GET /api/support/my-tickets', () => {
  it('без токена — 401', async () => {
    const res = await request(app).get('/api/support/my-tickets');
    expect(res.status).toBe(401);
  });

  it('віддає лише власні звернення, найсвіжіші зверху', async () => {
    const older = await createTicket(owner, { minutesAgo: 120 });
    const newer = await createTicket(owner, { minutesAgo: 10 });
    await createTicket(other, { minutesAgo: 5 });
    const res = await as(request(app).get('/api/support/my-tickets'), owner);
    expect(res.status).toBe(200);
    expect(res.body.map((ticket) => ticket.id)).toEqual([newer.id, older.id]);
  });
});

describe('GET /api/support/:ticketId', () => {
  let ticket;
  beforeEach(async () => {
    ticket = await createTicket(owner, { subject: 'Питання', body: 'Текст', minutesAgo: 60 });
    await addTicketReply(ticket, owner, { body: 'Перше повідомлення', minutesAgo: 40 });
    await addTicketReply(ticket, admin, { body: 'Відповідь адміністратора', minutesAgo: 20 });
  });

  it('без токена — 401', async () => {
    expect((await getTicketApi(ticket.id)).status).toBe(401);
  });

  it.each([
    ['власник', () => owner],
    ['адміністратор', () => admin],
  ])('%s відкриває звернення з відповідями у хронологічному порядку', async (_label, viewer) => {
    const res = await getTicketApi(ticket.id, viewer());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ticket.id, subject: 'Питання', user_id: owner.id, username: 'olena' });
    expect(res.body.replies.map((item) => item.body)).toEqual(['Перше повідомлення', 'Відповідь адміністратора']);
    expect(res.body.replies[1]).toMatchObject({ username: 'root', role: 'admin' });
  });

  it('сторонній користувач — 403', async () => {
    const res = await getTicketApi(ticket.id, other);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Доступ заборонено.' });
  });

  it('неіснуюче звернення — 404', async () => {
    const res = await getTicketApi(999999, owner);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Звернення не знайдено.' });
  });
});

describe('POST /api/support/:ticketId/reply', () => {
  let ticket;
  beforeEach(async () => {
    ticket = await createTicket(owner, { status: 'open', minutesAgo: 60 });
  });

  it('відповідь власника: 201, звернення лишається відкритим', async () => {
    const res = await reply(ticket.id, owner, { body: 'Доповнення' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Відповідь додано.' });
    const replies = await getTicketReplies(ticket.id);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ user_id: owner.id, body: 'Доповнення', attachments: [] });
    expect((await getTicket(ticket.id)).status).toBe('open');
  });

  it('відповідь адміністратора переводить звернення в answered', async () => {
    const res = await reply(ticket.id, admin, { body: 'Ми розібралися' });
    expect(res.status).toBe(201);
    expect((await getTicket(ticket.id)).status).toBe('answered');
  });

  it('відповідь власника в закритому зверненні знову відкриває його й стирає closed_by', async () => {
    await query("UPDATE support_tickets SET status = 'closed', closed_by = 'admin' WHERE id = ?", [ticket.id]);
    const res = await reply(ticket.id, owner, { body: 'Проблема повернулась' });
    expect(res.status).toBe(201);
    expect(await getTicket(ticket.id)).toMatchObject({ status: 'open', closed_by: null });
  });

  it.each([
    ['порожній текст', {}],
    ['лише пробіли', { body: '   ' }],
  ])('%s без вкладень — 400', async (_label, body) => {
    const res = await reply(ticket.id, owner, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Введіть текст або прикріпіть файл.' });
    expect(await getTicketReplies(ticket.id)).toHaveLength(0);
  });

  it('сторонній користувач — 403, неіснуюче звернення — 404, без токена — 401', async () => {
    const stranger = await reply(ticket.id, other, { body: 'Привіт' });
    expect(stranger.status).toBe(403);
    expect(stranger.body).toEqual({ message: 'Ви не можете відповідати тут.' });
    const missing = await reply(999999, owner, { body: 'Привіт' });
    expect(missing.status).toBe(404);
    const anonymous = await reply(ticket.id, null, { body: 'Привіт' });
    expect(anonymous.status).toBe(401);
  });

  it('після двох підряд повідомлень користувача третє — 429 до відповіді адміністратора', async () => {
    await addTicketReply(ticket, owner, { minutesAgo: 30 });
    await addTicketReply(ticket, owner, { minutesAgo: 20 });
    const blocked = await reply(ticket.id, owner, { body: 'Третє' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      message: 'Ви вже відправили два повідомлення поспіль. Будь ласка, дочекайтеся відповіді адміністратора.',
    });

    await addTicketReply(ticket, admin, { minutesAgo: 10 });
    const allowed = await reply(ticket.id, owner, { body: 'Дякую' });
    expect(allowed.status).toBe(201);
  });

  it('обмеження «двох поспіль» не діє на адміністратора', async () => {
    await addTicketReply(ticket, admin, { minutesAgo: 30 });
    await addTicketReply(ticket, admin, { minutesAgo: 20 });
    const res = await reply(ticket.id, admin, { body: 'Ще одна' });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/support/admin/tickets', () => {
  let open1, answered, closed;
  beforeEach(async () => {
    open1 = await createTicket(owner, { status: 'open', minutesAgo: 30 });
    answered = await createTicket(other, { status: 'answered', minutesAgo: 20 });
    closed = await createTicket(owner, { status: 'closed', closed_by: 'user', minutesAgo: 10 });
  });

  it('без токена — 401, звичайний користувач — 403', async () => {
    expect((await adminList(null)).status).toBe(401);
    const res = await adminList(owner);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Доступ заборонено. Недостатньо прав.' });
  });

  it('за замовчуванням віддає незакриті звернення з даними автора', async () => {
    const res = await adminList(admin);
    expect(res.status).toBe(200);
    expect(res.body.map((ticket) => ticket.id)).toEqual([answered.id, open1.id]);
    expect(res.body[0]).toMatchObject({ username: 'other', user_email: 'other@test.local' });
  });

  it.each([
    ['?status=closed', () => [closed.id]],
    ['?status=all', () => [closed.id, answered.id, open1.id]],
    ['?status=anything', () => [closed.id, answered.id, open1.id]],
  ])('фільтр %s', async (search, expected) => {
    const res = await adminList(admin, search);
    expect(res.body.map((ticket) => ticket.id)).toEqual(expected());
  });
});

describe('PUT /api/support/:ticketId/status', () => {
  let ticket;
  beforeEach(async () => {
    ticket = await createTicket(owner, { status: 'open', minutesAgo: 60 });
  });

  it('невірний статус — 400, неіснуюче звернення — 404, сторонній — 403', async () => {
    const invalid = await setStatus(ticket.id, owner, 'archived');
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ message: 'Невірний статус.' });
    expect((await setStatus(999999, owner, 'closed')).status).toBe(404);
    const stranger = await setStatus(ticket.id, other, 'closed');
    expect(stranger.status).toBe(403);
    expect(stranger.body).toEqual({ message: 'Доступ заборонено.' });
  });

  it('власник може лише закрити звернення: closed_by = user', async () => {
    const closedRes = await setStatus(ticket.id, owner, 'closed');
    expect(closedRes.status).toBe(200);
    expect(closedRes.body).toEqual({ message: 'Статус оновлено.' });
    expect(await getTicket(ticket.id)).toMatchObject({ status: 'closed', closed_by: 'user' });

    for (const status of ['open', 'answered']) {
      const res = await setStatus(ticket.id, owner, status);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Користувач може лише закривати звернення.' });
    }
  });

  it('адміністратор встановлює будь-який статус: closed_by = admin лише для closed', async () => {
    await setStatus(ticket.id, admin, 'closed');
    expect(await getTicket(ticket.id)).toMatchObject({ status: 'closed', closed_by: 'admin' });
    await setStatus(ticket.id, admin, 'open');
    expect(await getTicket(ticket.id)).toMatchObject({ status: 'open', closed_by: null });
    await setStatus(ticket.id, admin, 'answered');
    expect(await getTicket(ticket.id)).toMatchObject({ status: 'answered', closed_by: null });
  });
});

// KNOWN-DEFECT D-CON-01: адмін-панель викликає PUT /support/admin/:id/status, а на сервері є лише PUT /support/:ticketId/status.
// Окрім того, сервер вважає адміністратором лише роль admin, тож модератор бачить список звернень, але не може ні відкрити їх,
// ні відповісти, ні змінити статус.
describe('D-CON-01: адмін-панель і модератор', () => {
  let ticket;
  beforeEach(async () => {
    ticket = await createTicket(owner, { status: 'open', minutesAgo: 60 });
  });

  it.each([
    ['closed'],
    ['open'],
  ])('KNOWN-DEFECT D-CON-01: PUT /api/support/admin/:id/status (виклик адмін-панелі, status=%s) — 404, статус не змінюється', async (status) => {
    const res = await as(request(app).put(`/api/support/admin/${ticket.id}/status`), admin).send({ status });
    expect(res.status).toBe(404);
    expect((await getTicket(ticket.id)).status).toBe('open');
  });

  it('KNOWN-DEFECT D-CON-01: модератор бачить список звернень, але не може відкрити звернення, відповісти й змінити статус', async () => {
    const list = await adminList(moderator);
    expect(list.status).toBe(200);
    expect(list.body.map((item) => item.id)).toContain(ticket.id);

    const opened = await getTicketApi(ticket.id, moderator);
    expect(opened.status).toBe(403);
    expect(opened.body).toEqual({ message: 'Доступ заборонено.' });

    const replied = await reply(ticket.id, moderator, { body: 'Відповідь модератора' });
    expect(replied.status).toBe(403);
    expect(replied.body).toEqual({ message: 'Ви не можете відповідати тут.' });

    const closed = await setStatus(ticket.id, moderator, 'closed');
    expect(closed.status).toBe(403);
    expect(closed.body).toEqual({ message: 'Доступ заборонено.' });

    expect(await getTicketReplies(ticket.id)).toHaveLength(0);
    expect((await getTicket(ticket.id)).status).toBe('open');
  });
});

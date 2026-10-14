// Перевірка токена (middleware verifyToken) і життєвий цикл JWT.
// Фіксує виправлення D-SEC-09 (запасного секрету 'secret_key' немає) і D-SEC-10 (кожен токен несе token_version і відкликається).
// Як «пробу» використовується GET /api/auth/me: він лише повертає профіль і не має побічних ефектів.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader, tokenFor } from '../helpers/auth.js';
import { quietly } from '../helpers/outbound.js';
import { fromIp } from '../helpers/client.js';
import { createUser, patchUser, getUser } from '../helpers/factories.js';

useTestDatabase();

const PASSWORD = 'Strong-pass1';
const DAY = 24 * 60 * 60 * 1000;
const probe = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
const sign = (payload, secret = process.env.JWT_SECRET) => jwt.sign(payload, secret, { expiresIn: '1h' });

// Тимчасово прибирає JWT_SECRET із середовища процесу, як на розгортанні без цієї змінної.
async function withoutJwtSecret(action) {
  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    return await action();
  } finally {
    process.env.JWT_SECRET = saved;
  }
}

let user;
beforeEach(async () => {
  user = await createUser({ username: 'olena', email: 'olena@test.local', password: PASSWORD });
});

describe('verifyToken: перевірка заголовка й підпису', () => {
  it.each([
    ['заголовка немає', undefined, 'Відмовлено у доступі. Токен не надано.'],
    ['схема не Bearer', 'Basic abc', 'Відмовлено у доступі. Токен не надано.'],
    ['токен не є JWT', 'Bearer not-a-jwt', 'Недійсний токен авторизації.'],
  ])('%s — 401', async (_label, header, message) => {
    const req = request(app).get('/api/auth/me');
    const res = await (header ? req.set('Authorization', header) : req);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message });
  });

  it('підпис іншим секретом — 401', async () => {
    const res = await probe(sign({ id: user.id, role: 'user', plan: 'FREE', token_version: 0 }, 'another-secret'));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Недійсний токен авторизації.' });
  });

  it('строк дії минув — 401 з окремим повідомленням', async () => {
    const expired = jwt.sign(
      { id: user.id, role: 'user', plan: 'FREE', token_version: 0, exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_SECRET
    );
    const res = await probe(expired);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Час дії сесії минув. Будь ласка, увійдіть знову.' });
  });

  it('користувача немає в БД — 401', async () => {
    const res = await probe(tokenFor({ id: 999999 }));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Користувача не знайдено.' });
  });

  it('версія токена не збігається з версією в БД — 401', async () => {
    await patchUser(user, { token_version: 1 });
    const res = await probe(tokenFor(user));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'Сесія застаріла через зміну пароля або налаштувань безпеки. Будь ласка, увійдіть знову.',
    });
  });

  it('токен із поточною версією приймається', async () => {
    await patchUser(user, { token_version: 3 });
    const res = await probe(tokenFor({ ...user, token_version: 3 }));
    expect(res.status).toBe(200);
  });
});

describe('verifyToken: стан акаунта', () => {
  it('заблокований акаунт — 403 з кодом ACCOUNT_SUSPENDED', async () => {
    await patchUser(user, { status: 'suspended' });
    const res = await probe(tokenFor(user));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Доступ заблоковано. Ваш акаунт деактивовано.', code: 'ACCOUNT_SUSPENDED' });
  });

  it('видалений акаунт: звичайні маршрути — 403 ACCOUNT_DELETED, /api/auth/me — відповідь для відновлення', async () => {
    await patchUser(user, { status: 'deleted', deleted_at: new Date(Date.now() - 3 * DAY) });
    const blocked = await request(app).get('/api/support/my-tickets').set(authHeader(user));
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ message: 'Акаунт видалено. Необхідно відновити.', code: 'ACCOUNT_DELETED' });

    const me = await probe(tokenFor(user));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: user.id, status: 'deleted', require_restore: true });
  });
});

describe('verifyTokenOptional (глобально на всі маршрути)', () => {
  it('недійсний токен на публічному маршруті не дає 401, користувач вважається анонімним', async () => {
    const res = await request(app).get('/api/sites/default-logos').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(200);
  });
});

// D-SEC-09 виправлено: запасного секрету 'secret_key' більше немає. Без JWT_SECRET сервер не запускається (server.js),
// а якщо змінну прибрати вже в роботі, токени не видаються й не приймаються: відповідь 500 замість мовчазного переходу на відомий секрет.
describe('D-SEC-09: запасного секрету JWT немає', () => {
  const forge = (payload) => jwt.sign(payload, 'secret_key', { expiresIn: '1h' });
  const validPayload = () => ({ id: user.id, role: 'user', plan: 'FREE', token_version: 0 });

  it('контроль: коли JWT_SECRET задано, токен, підписаний запасним секретом, відхиляється', async () => {
    const res = await probe(forge(validPayload()));
    expect(res.status).toBe(401);
  });

  it("без JWT_SECRET підроблений токен із секретом 'secret_key' не приймається: 500, профіль не віддається", async () => {
    const res = await quietly(() => withoutJwtSecret(() => probe(forge(validPayload()))));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/JWT_SECRET/);
    expect(res.body.id).toBeUndefined();
  });

  it('без JWT_SECRET не приймається й токен, підписаний справжнім секретом', async () => {
    const real = sign(validPayload());
    const res = await quietly(() => withoutJwtSecret(() => probe(real)));
    expect(res.status).toBe(500);
  });

  it('без JWT_SECRET запит без токена, як і раніше, — 401', async () => {
    const res = await withoutJwtSecret(() => request(app).get('/api/auth/me'));
    expect(res.status).toBe(401);
  });

  it('без JWT_SECRET вхід не видає токен: 500, у відповіді немає token', async () => {
    const res = await quietly(() =>
      withoutJwtSecret(() => fromIp(request(app).post('/api/auth/login')).send({ loginInput: 'olena', password: PASSWORD }))
    );
    expect(res.status).toBe(500);
    expect(res.body.token).toBeUndefined();
    expect(res.body.message).toMatch(/JWT_SECRET/);
  });

  it('без JWT_SECRET відновлення акаунта не виконується: 500, акаунт лишається видаленим', async () => {
    await patchUser(user, { status: 'deleted', deleted_at: new Date(Date.now() - 3 * DAY) });
    const res = await quietly(() =>
      withoutJwtSecret(() =>
        request(app)
          .post('/api/users/me/restore')
          .set('Authorization', `Bearer ${forge(validPayload())}`)
      )
    );
    expect(res.status).toBe(500);
    expect((await getUser(user.id)).status).toBe('deleted');
  });

  it('JWT_SECRET з самих пробілів вважається незаданим', async () => {
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = '   ';
    try {
      const res = await quietly(() => probe(forge(validPayload())));
      expect(res.status).toBe(500);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
});

// D-SEC-10 виправлено: токен без поля token_version не приймається, а /auth/refresh видає токен з актуальною версією.
describe('D-SEC-10: токени з token_version', () => {
  it('токен без поля token_version відхиляється, навіть коли версія в БД нульова', async () => {
    const unversioned = sign({ id: user.id, role: 'user', plan: 'FREE' });
    const res = await probe(unversioned);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'Сесія застаріла через зміну пароля або налаштувань безпеки. Будь ласка, увійдіть знову.',
    });
  });

  it('/auth/refresh видає токен з актуальною версією з БД', async () => {
    await patchUser(user, { token_version: 4 });
    const res = await request(app).post('/api/auth/refresh').set(authHeader({ ...user, token_version: 4 }));
    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: user.id, role: 'user', plan: 'FREE', token_version: 4 });
  });

  it('оновлений токен відкликається зміною версії, як і звичайний токен входу', async () => {
    const original = authHeader(user);
    const refreshed = await request(app).post('/api/auth/refresh').set(original);
    await patchUser(user, { token_version: 1 });
    const stale = await request(app).get('/api/auth/me').set(original);
    const staleRefreshed = await probe(refreshed.body.token);
    expect(stale.status).toBe(401);
    expect(staleRefreshed.status).toBe(401);
  });

  it('токен, оновлений повторно, лишається чинним, доки версія не змінилась', async () => {
    let token = tokenFor(user);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/auth/refresh').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      token = res.body.token;
    }
    expect((await probe(token)).status).toBe(200);
    await patchUser(user, { token_version: 1 });
    expect((await probe(token)).status).toBe(401);
  });
});

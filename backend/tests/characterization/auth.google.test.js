// Вхід через Google (config/passport.js і authController.googleCallback).
// Справжній обмін кодом із Google потребує зовнішнього сервісу, тому функція перевірки стратегії passport
// викликається напряму (passport._strategy('google')._verify), а googleCallback — із підставним req/res.
// Фіксує D-SEC-22 (прив'язка Google до чужого непідтвердженого акаунта за збігом email) і D-SEC-10 (токен без token_version).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'node:module';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { fromIp } from '../helpers/client.js';
import { createUser, patchUser, setGlobalSetting, getUser, getUserByEmail, countRows } from '../helpers/factories.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { googleCallback } = require('../../controllers/authController');

useTestDatabase();

const CLIENT = 'http://localhost:5173';
const DAY = 24 * 60 * 60 * 1000;
const PROFILE = {
  id: 'google-1',
  displayName: '  Олена   Коваль ',
  emails: [{ value: 'olena@gmail.test' }],
  photos: [{ value: 'https://lh3.googleusercontent.com/a/olena' }],
};

// Функція перевірки, яку passport викликає після обміну коду: повертає { error, user }.
const verify = (profile) =>
  new Promise((resolve) => {
    passport._strategy('google')._verify('access-token', 'refresh-token', profile, (error, user) => resolve({ error, user }));
  });

// Виклик googleCallback із підставним req/res; повертає адресу переспрямування.
async function callback(user) {
  const res = { redirect: vi.fn() };
  await googleCallback({ user }, res);
  expect(res.redirect).toHaveBeenCalledTimes(1);
  return res.redirect.mock.calls[0][0];
}
const tokenOf = (location) => new URL(location).searchParams.get('token');

describe('маршрути Google OAuth', () => {
  it('GET /api/auth/google переспрямовує на сторінку згоди Google із запитом профілю й пошти', async () => {
    const res = await request(app).get('/api/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://accounts.google.com/');
    expect(res.headers.location).toContain('client_id=test-client-id');
    const scope = decodeURIComponent(res.headers.location).match(/scope=([^&]*)/)[1];
    expect(scope).toContain('profile');
    expect(scope).toContain('email');
  });

  it('відмова користувача на сторінці Google веде на /login?error=google_auth_failed', async () => {
    const res = await request(app).get('/api/auth/google/callback?error=access_denied');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${CLIENT}/login?error=google_auth_failed`);
  });
});

describe('стратегія Google: пошук і створення акаунта', () => {
  it('новий користувач: акаунт створюється підтвердженим, без пароля, з аватаром Google і slug-транслітерацією', async () => {
    const { error, user } = await verify(PROFILE);
    expect(error).toBeNull();
    expect(user).toMatchObject({
      username: 'Олена Коваль', slug: 'olena-koval', email: 'olena@gmail.test', role: 'user',
      avatar_url: 'https://lh3.googleusercontent.com/a/olena',
    });
    const row = await getUser(user.id);
    expect(row).toMatchObject({
      google_id: 'google-1', is_verified: 1, password_hash: null, status: 'active', plan: 'FREE', role: 'user',
    });
  });

  it('повторний вхід за google_id повертає той самий акаунт без нових рядків', async () => {
    const existing = await createUser({ username: 'olena', email: 'olena@gmail.test' });
    await patchUser(existing, { google_id: 'google-1' });
    const { user } = await verify(PROFILE);
    expect(user.id).toBe(existing.id);
    expect(await countRows('users')).toBe(1);
  });

  it("зайняте ім'я отримує випадковий числовий суфікс", async () => {
    await createUser({ username: 'Олена Коваль', email: 'other@test.local' });
    const { user } = await verify(PROFILE);
    expect(user.username).toMatch(/^Олена Коваль \d{1,3}$/);
  });

  it('збіг email із підтвердженим локальним акаунтом прив’язує Google до нього', async () => {
    const local = await createUser({ username: 'olena', email: 'olena@gmail.test', password: 'Strong-pass1' });
    const { user } = await verify(PROFILE);
    expect(user).toMatchObject({ id: local.id, google_id: 'google-1', is_verified: 1 });
    expect((await getUser(local.id)).google_id).toBe('google-1');
  });

  it('заблокований локальний акаунт не прив’язується, але повертається зі статусом для контролера', async () => {
    const banned = await createUser({ username: 'olena', email: 'olena@gmail.test' });
    await patchUser(banned, { status: 'suspended' });
    const { user } = await verify(PROFILE);
    expect(user.id).toBe(banned.id);
    expect(user.status).toBe('suspended');
    expect((await getUser(banned.id)).google_id).toBeNull();
  });

  it('профіль без email — помилка', async () => {
    const { error, user } = await verify({ ...PROFILE, emails: [] });
    expect(error.message).toBe('Google не предоставил Email');
    expect(user).toBeNull();
    expect(await countRows('users')).toBe(0);
  });

  it('порожній профіль — помилка', async () => {
    const { error, user } = await verify(undefined);
    expect(error.message).toBe('Не удалось получить профиль от Google');
    expect(user).toBeNull();
  });

  // KNOWN-DEFECT D-SEC-22: збіг email — єдина умова прив'язки. Локальний акаунт, створений зловмисником до жертви з її поштою
  // (непідтверджений, із паролем зловмисника), після входу жертви через Google стає підтвердженим, а пароль зловмисника лишається чинним.
  it('KNOWN-DEFECT D-SEC-22: непідтверджений акаунт із чужим паролем стає підтвердженим, пароль зловмисника зберігається', async () => {
    const squatter = await createUser({ username: 'squatter', email: 'olena@gmail.test', password: 'Attacker-pass1' });
    await patchUser(squatter, { is_verified: 0 });
    const before = await fromIp(request(app).post('/api/auth/login')).send({ loginInput: 'olena@gmail.test', password: 'Attacker-pass1' });
    expect(before.status).toBe(403);
    expect(before.body.isNotVerified).toBe(true);

    const { user } = await verify(PROFILE);
    expect(user.id).toBe(squatter.id);
    const row = await getUser(squatter.id);
    expect(row).toMatchObject({ google_id: 'google-1', is_verified: 1 });
    expect(bcrypt.compareSync('Attacker-pass1', row.password_hash)).toBe(true);

    const after = await fromIp(request(app).post('/api/auth/login')).send({ loginInput: 'olena@gmail.test', password: 'Attacker-pass1' });
    expect(after.status).toBe(200);
    expect(after.body.user.id).toBe(squatter.id);
  });
});

describe('googleCallback: переспрямування після входу', () => {
  let user;
  beforeEach(async () => {
    user = await createUser({ username: 'olena', email: 'olena@test.local' });
    user = { ...(await getUser(user.id)) };
  });

  it('без користувача — /login?error=auth_failed', async () => {
    expect(await callback(undefined)).toBe(`${CLIENT}/login?error=auth_failed`);
  });

  it('активний користувач: токен на 24 години в адресі /auth/success, оновлений last_login_at', async () => {
    const location = await callback(user);
    expect(location.startsWith(`${CLIENT}/auth/success?token=`)).toBe(true);
    const payload = jwt.verify(tokenOf(location), process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: user.id, role: 'user', plan: 'FREE', token_version: 0 });
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
    expect((await getUser(user.id)).last_login_at).toBeInstanceOf(Date);
  });

  it('вхід вимкнено в налаштуваннях — /login?error=auth_disabled', async () => {
    await setGlobalSetting('auth_enabled', 0);
    expect(await callback(user)).toBe(`${CLIENT}/login?error=auth_disabled`);
  });

  it.each(['admin', 'moderator'])('роль %s через Google не входить', async (role) => {
    expect(await callback({ ...user, role })).toBe(`${CLIENT}/login?error=auth_failed`);
  });

  it('заблокований акаунт — auth_failed', async () => {
    expect(await callback({ ...user, status: 'suspended' })).toBe(`${CLIENT}/login?error=auth_failed`);
  });

  it('видалений менш ніж 14 днів тому: токен лише для відновлення на 1 годину', async () => {
    const location = await callback({ ...user, status: 'deleted', deleted_at: new Date(Date.now() - 3 * DAY) });
    expect(location.startsWith(`${CLIENT}/auth/success?token=`)).toBe(true);
    const payload = jwt.verify(tokenOf(location), process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: user.id, role: 'RESTORE_ONLY' });
    expect(payload.exp - payload.iat).toBe(60 * 60);
  });

  it('видалений понад 14 днів тому: акаунт стирається остаточно', async () => {
    const location = await callback({ ...user, status: 'deleted', deleted_at: new Date(Date.now() - 20 * DAY) });
    expect(location).toBe(`${CLIENT}/login?error=auth_failed`);
    expect(await getUserByEmail('olena@test.local')).toBeUndefined();
  });

  // KNOWN-DEFECT D-SEC-10: об'єкт нового користувача зі стратегії не містить token_version, тож токен першого входу його не має.
  it('KNOWN-DEFECT D-SEC-10: токен першого входу через Google (новий акаунт) не має token_version', async () => {
    const { user: created } = await verify(PROFILE);
    const location = await callback(created);
    const payload = jwt.verify(tokenOf(location), process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: created.id, role: 'user', plan: 'FREE' });
    expect(payload).not.toHaveProperty('token_version');
  });
});

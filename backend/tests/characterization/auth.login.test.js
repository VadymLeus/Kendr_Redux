// Вхід користувача й сесія (/api/auth/login, /me, /refresh).
// Фіксує D-SEC-26 (стан акаунта розкривається до перевірки пароля) і D-BIZ-13 (відсутній пароль дає 500).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { quietly } from '../helpers/outbound.js';
import { fromIp } from '../helpers/client.js';
import { createUser, patchUser, setGlobalSetting, getUser } from '../helpers/factories.js';

useTestDatabase();

const PASSWORD = 'Strong-pass1';
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY);
const login = (body) => fromIp(request(app).post('/api/auth/login')).send(body);
const decode = (token) => jwt.verify(token, process.env.JWT_SECRET);

const USER_KEYS = [
  'id', 'username', 'slug', 'email', 'avatar_url', 'role', 'plan', 'platform_theme_mode', 'platform_theme_accent',
  'created_at', 'has_password', 'status',
];

let user;
beforeEach(async () => {
  user = await createUser({ username: 'olena', email: 'olena@test.local', password: PASSWORD });
  await patchUser(user, { slug: 'olena-slug' });
});

describe('POST /api/auth/login: успішний вхід', () => {
  it.each([
    ['email', 'olena@test.local'],
    ["ім'я користувача", 'olena'],
    ['slug', 'olena-slug'],
  ])('вхід за %s', async (_label, loginInput) => {
    const res = await login({ loginInput, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(typeof res.body.token).toBe('string');
  });

  it('відповідь містить лише публічні поля користувача', async () => {
    const res = await login({ loginInput: 'olena', password: PASSWORD });
    expect(Object.keys(res.body.user).sort()).toEqual([...USER_KEYS].sort());
    expect(res.body.user).toMatchObject({
      username: 'olena', email: 'olena@test.local', role: 'user', plan: 'FREE', status: 'active', has_password: true,
      platform_theme_mode: 'system', platform_theme_accent: 'blue',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|otp_code/);
  });

  it('токен: id, роль, тариф і версія, строк дії 24 години', async () => {
    const res = await login({ loginInput: 'olena', password: PASSWORD });
    const payload = decode(res.body.token);
    expect(payload).toMatchObject({ id: user.id, role: 'user', plan: 'FREE', token_version: 0 });
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
  });

  it('оновлює last_login_at', async () => {
    expect((await getUser(user.id)).last_login_at).toBeNull();
    await login({ loginInput: 'olena', password: PASSWORD });
    expect((await getUser(user.id)).last_login_at).toBeInstanceOf(Date);
  });

  it('тариф користувача потрапляє в токен і відповідь', async () => {
    await patchUser(user, { plan: 'PLUS' });
    const res = await login({ loginInput: 'olena', password: PASSWORD });
    expect(res.body.user.plan).toBe('PLUS');
    expect(decode(res.body.token).plan).toBe('PLUS');
  });
});

describe('POST /api/auth/login: відмови', () => {
  const WRONG = { message: 'Невірний логін або пароль.' };

  it('неправильний пароль і невідомий логін дають однакову відповідь 401', async () => {
    const wrongPassword = await login({ loginInput: 'olena', password: 'Wrong-pass1' });
    const unknownLogin = await login({ loginInput: 'nobody', password: PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(unknownLogin.status).toBe(401);
    expect(wrongPassword.body).toEqual(WRONG);
    expect(unknownLogin.body).toEqual(WRONG);
    expect((await getUser(user.id)).last_login_at).toBeNull();
  });

  it.each(['admin', 'moderator'])('роль %s не входить через /login навіть із правильним паролем', async (role) => {
    await patchUser(user, { role });
    const res = await login({ loginInput: 'olena', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(WRONG);
  });

  it('акаунт без пароля (лише Google) — 400 з підказкою', async () => {
    await patchUser(user, { password_hash: null });
    const res = await login({ loginInput: 'olena', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Пароль не встановлено. Увійдіть через Google або відновіть пароль.' });
  });

  it('вхід вимкнено в налаштуваннях платформи — 403 для користувача', async () => {
    await setGlobalSetting('auth_enabled', 0);
    const res = await login({ loginInput: 'olena', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Авторизація тимчасово призупинена. Ведуться технічні роботи.' });
  });

  it('видалений менш ніж 14 днів тому: вхід дає токен лише для відновлення', async () => {
    await patchUser(user, { status: 'deleted', deleted_at: daysAgo(3) });
    const res = await login({ loginInput: 'olena', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      require_restore: true,
      message: 'Акаунт в процесі видалення. Відновити?',
      user: { id: user.id, username: 'olena', email: 'olena@test.local', status: 'deleted' },
    });
    const payload = decode(res.body.token);
    expect(payload).toMatchObject({ id: user.id, role: 'RESTORE_ONLY' });
    expect(payload.exp - payload.iat).toBe(60 * 60);
  });

  it('видалений акаунт із неправильним паролем — 401', async () => {
    await patchUser(user, { status: 'deleted', deleted_at: daysAgo(3) });
    const res = await login({ loginInput: 'olena', password: 'Wrong-pass1' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(WRONG);
  });

  // KNOWN-DEFECT D-BIZ-13: відсутній пароль не відсікається, виняток bcrypt повертається як 500.
  it('KNOWN-DEFECT D-BIZ-13: без пароля в запиті — 500 (виняток bcryptjs), а не 400 чи 401', async () => {
    const res = await quietly(() => login({ loginInput: 'olena' }));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/illegal arguments/i);
  });

  it('без логіна — 401', async () => {
    const res = await login({ password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(WRONG);
  });
});

// KNOWN-DEFECT D-SEC-26: відповідь про стан акаунта віддається до перевірки пароля, тож за самим іменем користувача
// сторонній дізнається про блокування, непідтверджену пошту (разом із самою поштою) та роль акаунта.
describe('D-SEC-26: стан акаунта розкривається до перевірки пароля', () => {
  it('KNOWN-DEFECT D-SEC-26: заблокований акаунт — 403 навіть із неправильним паролем', async () => {
    await patchUser(user, { status: 'suspended' });
    const res = await login({ loginInput: 'olena', password: 'Wrong-pass1' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Ваш акаунт заблоковано назавжди за порушення правил платформи.' });
  });

  it('KNOWN-DEFECT D-SEC-26: непідтверджений акаунт віддає свій email за самим іменем, без пароля', async () => {
    await patchUser(user, { is_verified: 0 });
    const res = await login({ loginInput: 'olena', password: 'Wrong-pass1' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Ваша пошта не підтверджена.', isNotVerified: true, email: 'olena@test.local' });
  });
});

describe('GET /api/auth/me', () => {
  it('без токена — 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Відмовлено у доступі. Токен не надано.' });
  });

  it('віддає профіль без секретних полів', async () => {
    await patchUser(user, { bio: 'Про мене', phone_number: '+380501234567' });
    const res = await request(app).get('/api/auth/me').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'id', 'username', 'slug', 'email', 'avatar_url', 'role', 'plan', 'platform_theme_mode', 'platform_theme_accent',
      'bio', 'social_telegram', 'social_instagram', 'social_website', 'is_profile_public', 'phone_number',
      'created_at', 'last_login_at', 'has_password', 'status',
    ].sort());
    expect(res.body).toMatchObject({
      id: user.id, username: 'olena', email: 'olena@test.local', bio: 'Про мене', phone_number: '+380501234567',
      has_password: true, status: 'active', is_profile_public: 1,
    });
  });

  it('has_password = false для акаунта без пароля', async () => {
    await patchUser(user, { password_hash: null });
    const res = await request(app).get('/api/auth/me').set(authHeader(user));
    expect(res.body.has_password).toBe(false);
  });
});

describe('POST /api/auth/refresh', () => {
  it('видає новий токен на 24 години й актуальні дані користувача (тариф береться з БД)', async () => {
    await patchUser(user, { plan: 'PLUS' });
    const res = await request(app).post('/api/auth/refresh').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.user).sort()).toEqual([...USER_KEYS].sort());
    expect(res.body.user.plan).toBe('PLUS');
    const payload = decode(res.body.token);
    expect(payload).toMatchObject({ id: user.id, role: 'user', plan: 'PLUS' });
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
  });

  it('без токена — 401', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});

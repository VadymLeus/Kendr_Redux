// Вхід до адмін-панелі (/api/auth/admin/login, /verify-2fa) і повторне надсилання коду (/resend-otp).
// Фіксує D-SEC-04 (resend-otp + verify-2fa обходять пароль і вимкнене для staff скидання пароля) і D-SEC-26 (розкриття стану акаунта).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'node:module';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { captureOutbound, quietly } from '../helpers/outbound.js';
import { fromIp } from '../helpers/client.js';
import { createUser, patchUser, setOtp, getUser } from '../helpers/factories.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

useTestDatabase();

let out;
beforeEach(() => {
  out = captureOutbound();
});
afterEach(() => out.restore());

const PASSWORD = 'Strong-pass1';
const post = (url, body) => fromIp(request(app).post(`/api/auth/${url}`)).send(body);
const adminLogin = (body) => post('admin/login', body);
const verify2fa = (body) => post('verify-2fa', body);
const resendOtp = (body) => post('resend-otp', body);

let admin, moderator;
beforeEach(async () => {
  admin = await createUser({ role: 'admin', username: 'root', email: 'admin@test.local', password: PASSWORD });
  moderator = await createUser({ role: 'moderator', username: 'mod', email: 'mod@test.local', password: PASSWORD });
});

describe('POST /api/auth/admin/login: перший крок (пароль)', () => {
  it.each([
    ['admin', 'admin@test.local'],
    ['moderator', 'mod@test.local'],
  ])('%s з правильним паролем отримує код 2FA на пошту, токена ще немає', async (_role, email) => {
    const res = await adminLogin({ loginInput: email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, require2FA: true, email });

    const row = await getUser(email === 'admin@test.local' ? admin.id : moderator.id);
    expect(row.otp_purpose).toBe('2FA');
    expect(row.otp_code).toMatch(/^\d{6}$/);
    // Код 2FA дійсний 5 хвилин
    expect(Math.abs(row.otp_expires.getTime() - Date.now() - 5 * 60 * 1000)).toBeLessThan(60 * 1000);
    expect(out.emails).toHaveLength(1);
    expect(out.emails[0]).toMatchObject({ to: email, subject: 'Підтвердження входу | Kendr' });
    expect(out.codeSentTo(email)).toBe(row.otp_code);
  });

  it('невідомий логін — 401', async () => {
    const res = await adminLogin({ loginInput: 'nobody', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Невірні облікові дані.' });
  });

  it('звичайний користувач — 403 «лише для персоналу»', async () => {
    const regular = await createUser({ username: 'regular', email: 'regular@test.local', password: PASSWORD });
    const res = await adminLogin({ loginInput: regular.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Відмовлено у доступі. Зона лише для персоналу.' });
    expect(out.emails).toHaveLength(0);
  });

  it('неактивний співробітник — 403', async () => {
    await patchUser(admin, { status: 'suspended' });
    const res = await adminLogin({ loginInput: 'admin@test.local', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Акаунт співробітника неактивний.' });
  });

  it('неправильний пароль — 401 без листа', async () => {
    const res = await adminLogin({ loginInput: 'admin@test.local', password: 'Wrong-pass1' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Невірні облікові дані.' });
    expect(out.emails).toHaveLength(0);
    expect((await getUser(admin.id)).otp_code).toBeNull();
  });

  // KNOWN-DEFECT D-SEC-26: роль перевіряється до пароля, тож за самим іменем видно, що обліковий запис існує й не є staff.
  it('KNOWN-DEFECT D-SEC-26: для існуючого звичайного акаунта відповідь 403 віддається без перевірки пароля', async () => {
    const regular = await createUser({ username: 'regular', email: 'regular@test.local', password: PASSWORD });
    const known = await adminLogin({ loginInput: regular.email, password: 'Wrong-pass1' });
    const unknown = await adminLogin({ loginInput: 'nobody', password: 'Wrong-pass1' });
    expect(known.status).toBe(403);
    expect(unknown.status).toBe(401);
  });
});

describe('POST /api/auth/verify-2fa: другий крок (код)', () => {
  beforeEach(async () => {
    await setOtp(admin, { code: '123456', purpose: '2FA', minutes: 5 });
  });

  it('правильний код видає токен адміністратора, стирає код і оновлює last_login_at', async () => {
    const res = await verify2fa({ email: 'admin@test.local', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: 'Вхід в панель успішний', require_restore: false,
      user: { id: admin.id, username: 'root', email: 'admin@test.local', role: 'admin', status: 'active', has_password: true },
    });
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: admin.id, role: 'admin', plan: 'FREE', token_version: 0 });
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);

    const row = await getUser(admin.id);
    expect(row).toMatchObject({ otp_code: null, otp_expires: null, otp_purpose: null });
    expect(row.last_login_at).toBeInstanceOf(Date);

    const panel = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${res.body.token}`);
    expect(panel.status).toBe(200);
    expect(Array.isArray(panel.body)).toBe(true);
  });

  it("без email або коду — 400", async () => {
    const res = await verify2fa({ email: 'admin@test.local' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Email та код обов'язкові." });
  });

  it.each([
    ['неправильний код', { email: 'admin@test.local', code: '654321' }],
    ['невідомий email', { email: 'nobody@test.local', code: '123456' }],
  ])('%s — 401', async (_label, body) => {
    const res = await verify2fa(body);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Невірний код підтвердження.' });
    expect((await getUser(admin.id)).otp_code).toBe('123456');
  });

  it('код з іншим призначенням не підходить', async () => {
    await setOtp(admin, { code: '123456', purpose: 'RESET_PASSWORD', minutes: 5 });
    const res = await verify2fa({ email: 'admin@test.local', code: '123456' });
    expect(res.status).toBe(401);
  });

  it('код, що сплив, — 401 і код стирається', async () => {
    await setOtp(admin, { code: '123456', purpose: '2FA', minutes: -1 });
    const res = await verify2fa({ email: 'admin@test.local', code: '123456' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Термін дії коду минув. Увійдіть заново.' });
    expect(await getUser(admin.id)).toMatchObject({ otp_code: null, otp_expires: null, otp_purpose: null });
  });

  it('код одноразовий', async () => {
    await verify2fa({ email: 'admin@test.local', code: '123456' });
    const again = await verify2fa({ email: 'admin@test.local', code: '123456' });
    expect(again.status).toBe(401);
  });
});

describe('POST /api/auth/resend-otp', () => {
  it('перевипускає код для підтвердження пошти на 15 хвилин і надсилає лист', async () => {
    const user = await createUser({ username: 'olena', email: 'olena@test.local' });
    await patchUser(user, { is_verified: 0 });
    await setOtp(user, { code: '111111', purpose: 'VERIFY_EMAIL', minutes: 1 });

    const res = await resendOtp({ email: 'olena@test.local', purpose: 'VERIFY_EMAIL' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Код успішно відправлено повторно!' });
    const row = await getUser(user.id);
    expect(row.otp_purpose).toBe('VERIFY_EMAIL');
    expect(Math.abs(row.otp_expires.getTime() - Date.now() - 15 * 60 * 1000)).toBeLessThan(60 * 1000);
    expect(out.codeSentTo('olena@test.local')).toBe(row.otp_code);
    expect(out.emails[0].subject).toBe('Підтвердження пошти | Kendr');
  });
});

// KNOWN-DEFECT D-SEC-04: resend-otp не вимагає автентифікації, приймає purpose від клієнта й не зв'язаний із входом,
// а verify-2fa не вимагає пройденого кроку пароля, ролі й статусу акаунта. Потрібен лише доступ до пошти.
describe('D-SEC-04: resend-otp і verify-2fa обходять крок пароля', () => {
  it.each([
    ['admin', 'admin@test.local'],
    ['moderator', 'mod@test.local'],
  ])('KNOWN-DEFECT D-SEC-04: для %s код 2FA замовляється без пароля, verify-2fa видає токен панелі керування', async (role, email) => {
    const resend = await resendOtp({ email, purpose: '2FA' });
    expect(resend.status).toBe(200);
    expect(out.emails).toHaveLength(1);
    expect(out.emails[0].subject).toBe('Підтвердження входу | Kendr');

    const res = await verify2fa({ email, code: out.codeSentTo(email) });
    expect(res.status).toBe(200);
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET)).toMatchObject({ role });
    // Крок пароля (POST /admin/login) у цьому сценарії не викликався жодного разу
    const panel = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${res.body.token}`);
    expect(panel.status).toBe(200);
  });

  it('KNOWN-DEFECT D-SEC-04: verify-2fa не перевіряє роль: токен отримує й звичайний користувач', async () => {
    const regular = await createUser({ username: 'regular', email: 'regular@test.local' });
    await resendOtp({ email: regular.email, purpose: '2FA' });
    const res = await verify2fa({ email: regular.email, code: out.codeSentTo(regular.email) });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: regular.id, role: 'user' });
  });

  it('KNOWN-DEFECT D-SEC-04: verify-2fa не перевіряє статус: заблокований акаунт отримує токен (його відхиляє лише verifyToken)', async () => {
    const banned = await createUser({ username: 'banned', email: 'banned@test.local' });
    await patchUser(banned, { status: 'suspended' });
    await resendOtp({ email: banned.email, purpose: '2FA' });
    const res = await verify2fa({ email: banned.email, code: out.codeSentTo(banned.email) });
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('KNOWN-DEFECT D-SEC-04: непідтверджений акаунт обходить заборону входу й користується токеном', async () => {
    const fresh = await createUser({ username: 'fresh', email: 'fresh@test.local' });
    await patchUser(fresh, { is_verified: 0 });
    await resendOtp({ email: fresh.email, purpose: '2FA' });
    const res = await verify2fa({ email: fresh.email, code: out.codeSentTo(fresh.email) });
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect((await getUser(fresh.id)).is_verified).toBe(0);
  });

  it('KNOWN-DEFECT D-SEC-04: пароль адміністратора скидається поштою, хоча forgot-password для staff вимкнено навмисно', async () => {
    const forgot = await post('forgot-password', { email: 'admin@test.local' });
    expect(forgot.status).toBe(200);
    expect(out.emails).toHaveLength(0);
    expect((await getUser(admin.id)).otp_code).toBeNull();

    await resendOtp({ email: 'admin@test.local', purpose: 'RESET_PASSWORD' });
    const code = out.codeSentTo('admin@test.local');
    expect(code).toMatch(/^\d{6}$/);

    const reset = await post('reset-password', { email: 'admin@test.local', code, newPassword: 'Brand-new1' });
    expect(reset.status).toBe(200);
    const row = await getUser(admin.id);
    expect(bcrypt.compareSync('Brand-new1', row.password_hash)).toBe(true);
    expect(row.token_version).toBe(1);
    const firstStep = await adminLogin({ loginInput: 'admin@test.local', password: 'Brand-new1' });
    expect(firstStep.body).toMatchObject({ success: true, require2FA: true });
  });

  it('KNOWN-DEFECT D-SEC-04: resend-otp розкриває наявність акаунта (404 проти 200)', async () => {
    const unknown = await resendOtp({ email: 'nobody@test.local', purpose: '2FA' });
    const known = await resendOtp({ email: 'admin@test.local', purpose: '2FA' });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ message: 'Користувача не знайдено.' });
    expect(known.status).toBe(200);
  });

  it('KNOWN-DEFECT D-SEC-04: без purpose відповідь 200, лист не надсилається, а чинний код жертви знецінюється', async () => {
    const victim = await createUser({ username: 'victim', email: 'victim@test.local' });
    await setOtp(victim, { code: '111111', purpose: 'RESET_PASSWORD', minutes: 10 });

    const res = await resendOtp({ email: victim.email });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Код успішно відправлено повторно!' });
    expect(out.emails).toHaveLength(0);
    expect((await getUser(victim.id)).otp_purpose).toBeNull();

    const check = await post('verify-reset-code', { email: victim.email, code: '111111' });
    expect(check.status).toBe(400);
  });

  it('KNOWN-DEFECT D-SEC-04: purpose поза переліком призводить до помилки БД (500 із текстом SQL)', async () => {
    const res = await quietly(() => resendOtp({ email: 'admin@test.local', purpose: 'NOT_A_PURPOSE' }));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/otp_purpose/);
  });
});

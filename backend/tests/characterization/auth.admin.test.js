// Вхід до адмін-панелі (/api/auth/admin/login, /verify-2fa) і повторне надсилання коду (/resend-otp).
// Фіксує виправлення D-SEC-04 (resend-otp і verify-2fa більше не обходять пароль і вимкнене для staff скидання пароля) і D-SEC-26 (розкриття стану акаунта).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'node:module';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { captureOutbound } from '../helpers/outbound.js';
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
  const unverified = async () => {
    const user = await createUser({ username: 'olena', email: 'olena@test.local' });
    await patchUser(user, { is_verified: 0 });
    return user;
  };

  it('перевипускає код для підтвердження пошти на 15 хвилин і надсилає лист', async () => {
    const user = await unverified();
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

  it('перевипускає код скидання пароля для звичайного акаунта', async () => {
    const user = await createUser({ username: 'olena', email: 'olena@test.local' });
    const res = await resendOtp({ email: 'olena@test.local', purpose: 'RESET_PASSWORD' });
    expect(res.status).toBe(200);
    const row = await getUser(user.id);
    expect(row.otp_purpose).toBe('RESET_PASSWORD');
    expect(out.codeSentTo('olena@test.local')).toBe(row.otp_code);
  });

  it('підтверджений акаунт не отримує код підтвердження пошти', async () => {
    const user = await createUser({ username: 'olena', email: 'olena@test.local' });
    const res = await resendOtp({ email: 'olena@test.local', purpose: 'VERIFY_EMAIL' });
    expect(res.status).toBe(200);
    expect(out.emails).toHaveLength(0);
    expect((await getUser(user.id)).otp_code).toBeNull();
  });

  it('заблокований акаунт не отримує жодного коду', async () => {
    const user = await unverified();
    await patchUser(user, { status: 'suspended' });
    for (const purpose of ['VERIFY_EMAIL', 'RESET_PASSWORD']) {
      expect((await resendOtp({ email: 'olena@test.local', purpose })).status).toBe(200);
    }
    expect(out.emails).toHaveLength(0);
    expect((await getUser(user.id)).otp_code).toBeNull();
  });
});

// D-SEC-04 виправлено: resend-otp видає лише коди VERIFY_EMAIL і RESET_PASSWORD та лише тим акаунтам, яким вони дозволені;
// код 2FA з'являється тільки після пароля в admin/login, а verify-2fa приймає його лише від активного співробітника.
describe('D-SEC-04: resend-otp і verify-2fa не обходять крок пароля', () => {
  it.each([
    ['admin', 'admin@test.local'],
    ['moderator', 'mod@test.local'],
  ])('D-SEC-04: для %s код 2FA без пароля не замовити, токена панелі керування немає', async (_role, email) => {
    const resend = await resendOtp({ email, purpose: '2FA' });
    expect(resend.status).toBe(400);
    expect(resend.body).toEqual({ message: 'Невірне призначення коду.' });
    expect(out.emails).toHaveLength(0);

    const res = await verify2fa({ email, code: '123456' });
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('token');
  });

  it('D-SEC-04: verify-2fa перевіряє роль: код 2FA звичайного користувача токена не дає', async () => {
    const regular = await createUser({ username: 'regular', email: 'regular@test.local' });
    await setOtp(regular, { code: '123456', purpose: '2FA', minutes: 5 });
    const res = await verify2fa({ email: regular.email, code: '123456' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Невірний код підтвердження.' });
  });

  it.each(['suspended', 'deleted'])('D-SEC-04: verify-2fa перевіряє статус: співробітник зі статусом %s токена не отримує', async (status) => {
    await setOtp(admin, { code: '123456', purpose: '2FA', minutes: 5 });
    await patchUser(admin, { status });
    const res = await verify2fa({ email: 'admin@test.local', code: '123456' });
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('token');
  });

  it('D-SEC-04: непідтверджений акаунт не отримує ні код 2FA, ні токен', async () => {
    const fresh = await createUser({ username: 'fresh', email: 'fresh@test.local' });
    await patchUser(fresh, { is_verified: 0 });
    expect((await resendOtp({ email: fresh.email, purpose: '2FA' })).status).toBe(400);
    expect((await verify2fa({ email: fresh.email, code: '123456' })).status).toBe(401);
    expect(out.emails).toHaveLength(0);
    expect((await getUser(fresh.id)).is_verified).toBe(0);
  });

  it('D-SEC-04: пароль адміністратора поштою не скидається: ні forgot-password, ні resend-otp не видають код', async () => {
    const forgot = await post('forgot-password', { email: 'admin@test.local' });
    expect(forgot.status).toBe(200);
    const resend = await resendOtp({ email: 'admin@test.local', purpose: 'RESET_PASSWORD' });
    expect(resend.status).toBe(200);
    expect(out.emails).toHaveLength(0);
    expect((await getUser(admin.id)).otp_code).toBeNull();

    const reset = await post('reset-password', { email: 'admin@test.local', code: '123456', newPassword: 'Brand-new1' });
    expect(reset.status).toBe(400);
    const row = await getUser(admin.id);
    expect(bcrypt.compareSync(PASSWORD, row.password_hash)).toBe(true);
    expect(row.token_version).toBe(0);
  });

  it('D-SEC-04: resend-otp не розкриває наявність акаунта: відповідь однакова для відомого й невідомого email', async () => {
    const unknown = await resendOtp({ email: 'nobody@test.local', purpose: 'RESET_PASSWORD' });
    const known = await resendOtp({ email: 'admin@test.local', purpose: 'RESET_PASSWORD' });
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });

  it.each([
    ['без purpose', {}],
    ['purpose поза переліком', { purpose: 'NOT_A_PURPOSE' }],
    ['purpose не рядок', { purpose: ['2FA'] }],
  ])('D-SEC-04: %s — 400, чинний код жертви лишається', async (_label, extra) => {
    const victim = await createUser({ username: 'victim', email: 'victim@test.local' });
    await setOtp(victim, { code: '111111', purpose: 'RESET_PASSWORD', minutes: 10 });

    const res = await resendOtp({ email: victim.email, ...extra });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Невірне призначення коду.' });
    expect(out.emails).toHaveLength(0);
    expect((await getUser(victim.id)).otp_purpose).toBe('RESET_PASSWORD');

    const check = await post('verify-reset-code', { email: victim.email, code: '111111' });
    expect(check.status).toBe(200);
  });

  it('D-SEC-04: email не рядок не потрапляє в запит до БД', async () => {
    const res = await resendOtp({ email: { $ne: null }, purpose: 'RESET_PASSWORD' });
    expect(res.status).toBe(200);
    expect(out.emails).toHaveLength(0);
  });
});

// Відновлення пароля (/api/auth/forgot-password, /verify-reset-code, /reset-password).
// Фіксує D-BIZ-04 (правило пароля при скиданні слабше за клієнтське). Обхід цього потоку через resend-otp — D-SEC-04 в auth.admin.test.js.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
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
const NEW_PASSWORD = 'Brand-new1';
const post = (url, body) => fromIp(request(app).post(`/api/auth/${url}`)).send(body);
const GENERIC = { message: 'Якщо цей email зареєстровано в системі, ми відправили на нього інструкції.' };

let user;
beforeEach(async () => {
  user = await createUser({ username: 'olena', email: 'olena@test.local', password: PASSWORD });
});

describe('POST /api/auth/forgot-password', () => {
  it('для існуючого акаунта створює код на 15 хвилин і надсилає лист', async () => {
    const res = await post('forgot-password', { email: 'olena@test.local' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(GENERIC);
    const row = await getUser(user.id);
    expect(row.otp_purpose).toBe('RESET_PASSWORD');
    expect(Math.abs(row.otp_expires.getTime() - Date.now() - 15 * 60 * 1000)).toBeLessThan(60 * 1000);
    expect(out.emails).toHaveLength(1);
    expect(out.emails[0]).toMatchObject({ to: 'olena@test.local', subject: 'Відновлення пароля | Kendr' });
    expect(out.codeSentTo('olena@test.local')).toBe(row.otp_code);
  });

  it.each([
    ['невідомий email', async () => 'nobody@test.local'],
    ['заблокований акаунт', async () => { await patchUser(user, { status: 'suspended' }); return 'olena@test.local'; }],
    ['адміністратор', async () => { await patchUser(user, { role: 'admin' }); return 'olena@test.local'; }],
    ['модератор', async () => { await patchUser(user, { role: 'moderator' }); return 'olena@test.local'; }],
  ])('%s — та сама відповідь, лист не надсилається, код не створюється', async (_label, prepare) => {
    const email = await prepare();
    const res = await post('forgot-password', { email });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(GENERIC);
    expect(out.emails).toHaveLength(0);
    expect((await getUser(user.id)).otp_code).toBeNull();
  });

  it('без email — та сама відповідь', async () => {
    const res = await post('forgot-password', {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual(GENERIC);
  });
});

describe('POST /api/auth/verify-reset-code', () => {
  beforeEach(async () => {
    await setOtp(user, { code: '123456', purpose: 'RESET_PASSWORD', minutes: 10 });
  });

  it('правильний код — 200, код не споживається', async () => {
    const res = await post('verify-reset-code', { email: 'olena@test.local', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Код вірний. Введіть новий пароль.' });
    expect((await getUser(user.id)).otp_code).toBe('123456');
  });

  it.each([
    ['неправильний код', { email: 'olena@test.local', code: '654321' }],
    ['невідомий email', { email: 'nobody@test.local', code: '123456' }],
  ])('%s — 400', async (_label, body) => {
    const res = await post('verify-reset-code', body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Недійсний код підтвердження.' });
  });

  it('код іншого призначення — 400', async () => {
    await setOtp(user, { code: '123456', purpose: 'VERIFY_EMAIL', minutes: 10 });
    const res = await post('verify-reset-code', { email: 'olena@test.local', code: '123456' });
    expect(res.status).toBe(400);
  });

  it('код, що сплив, — 400', async () => {
    await setOtp(user, { code: '123456', purpose: 'RESET_PASSWORD', minutes: -1 });
    const res = await post('verify-reset-code', { email: 'olena@test.local', code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Термін дії коду минув.' });
  });
});

describe('POST /api/auth/reset-password', () => {
  const reset = (overrides = {}) =>
    post('reset-password', { email: 'olena@test.local', code: '123456', newPassword: NEW_PASSWORD, ...overrides });

  beforeEach(async () => {
    await setOtp(user, { code: '123456', purpose: 'RESET_PASSWORD', minutes: 10 });
  });

  it('змінює пароль, стирає код і збільшує token_version', async () => {
    const res = await reset();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Пароль успішно змінено! Тепер ви можете увійти.' });
    const row = await getUser(user.id);
    expect(bcrypt.compareSync(NEW_PASSWORD, row.password_hash)).toBe(true);
    expect(bcrypt.compareSync(PASSWORD, row.password_hash)).toBe(false);
    expect(row).toMatchObject({ otp_code: null, otp_expires: null, otp_purpose: null, token_version: 1 });
  });

  it('після скидання діє лише новий пароль, а токен зі старою версією відкликається', async () => {
    const oldToken = authHeader(user);
    await reset();

    const oldPassword = await post('login', { loginInput: 'olena', password: PASSWORD });
    expect(oldPassword.status).toBe(401);
    const newPassword = await post('login', { loginInput: 'olena', password: NEW_PASSWORD });
    expect(newPassword.status).toBe(200);

    const stale = await request(app).get('/api/auth/me').set(oldToken);
    expect(stale.status).toBe(401);
    const fresh = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${newPassword.body.token}`);
    expect(fresh.status).toBe(200);
  });

  it('код одноразовий', async () => {
    await reset();
    const again = await reset({ newPassword: 'Another-pass2' });
    expect(again.status).toBe(400);
    expect(again.body).toEqual({ message: 'Недійсний код підтвердження.' });
  });

  it.each([
    ['короткий', 'Ab1'],
    ['без цифри', 'NoDigitsHere'],
    ['без великої літери', 'lowercase123'],
    ['відсутній', undefined],
  ])('слабкий пароль (%s) — 400, код лишається чинним', async (_label, newPassword) => {
    const res = await reset({ newPassword });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Пароль занадто слабкий (мін. 8 символів, цифра, велика літера).' });
    const row = await getUser(user.id);
    expect(row.otp_code).toBe('123456');
    expect(bcrypt.compareSync(PASSWORD, row.password_hash)).toBe(true); // пароль не змінився
    expect(row.token_version).toBe(0);
  });

  // KNOWN-DEFECT D-BIZ-04: те саме правило, що й при реєстрації: мала літера не потрібна, послідовності не відсікаються.
  it('KNOWN-DEFECT D-BIZ-04: пароль без малої літери приймається', async () => {
    const res = await reset({ newPassword: 'ABCDEFG1' });
    expect(res.status).toBe(200);
  });

  it.each([
    ['неправильний код', { code: '654321' }],
    ['невідомий email', { email: 'nobody@test.local' }],
  ])('%s — 400', async (_label, overrides) => {
    const res = await reset(overrides);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Недійсний код підтвердження.' });
  });

  it('код, що сплив, — 400', async () => {
    await setOtp(user, { code: '123456', purpose: 'RESET_PASSWORD', minutes: -1 });
    const res = await reset();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Термін дії коду минув.' });
  });

  it('акаунт без пароля (Google) отримує пароль', async () => {
    await patchUser(user, { password_hash: null });
    const res = await reset();
    expect(res.status).toBe(200);
    const login = await post('login', { loginInput: 'olena', password: NEW_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.has_password).toBe(true);
  });
});

describe('повний шлях відновлення пароля', () => {
  it('лист із кодом → перевірка коду → новий пароль → вхід', async () => {
    await post('forgot-password', { email: 'olena@test.local' });
    const code = out.codeSentTo('olena@test.local');
    expect((await post('verify-reset-code', { email: 'olena@test.local', code })).status).toBe(200);
    expect((await post('reset-password', { email: 'olena@test.local', code, newPassword: NEW_PASSWORD })).status).toBe(200);
    const login = await post('login', { loginInput: 'olena@test.local', password: NEW_PASSWORD });
    expect(login.status).toBe(200);
  });
});

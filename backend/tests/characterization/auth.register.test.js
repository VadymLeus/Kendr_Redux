// Реєстрація й підтвердження пошти (/api/auth/register, /api/auth/verify-email).
// Фіксує D-SEC-12 (одноразовий код від Math.random), D-SEC-20 (кількість спроб введення коду на акаунт не обмежена),
// D-BIZ-04 (правило пароля на сервері слабше за клієнтське), D-BIZ-13 (вхідні дані не валідуються).
// Листи Resend перехоплюються підміною fetch (helpers/outbound.js), код читається і з листа, і з БД.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { captureOutbound, quietly } from '../helpers/outbound.js';
import { fromIp, freshIp } from '../helpers/client.js';
import {
  createUser, patchUser, setOtp, setGlobalSetting, getUserByEmail, countRows,
} from '../helpers/factories.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

useTestDatabase();

let out;
beforeEach(() => {
  out = captureOutbound();
});
afterEach(() => out.restore());

const PASSWORD = 'Strong-pass1';
const newUser = (overrides = {}) => ({ username: 'olena', email: 'olena@test.local', password: PASSWORD, ...overrides });
const register = (body) => fromIp(request(app).post('/api/auth/register')).send(body);
const verifyEmail = (body, ip) => fromIp(request(app).post('/api/auth/verify-email'), ip).send(body);

describe('POST /api/auth/register', () => {
  it('створює непідтверджений акаунт, зберігає хеш пароля й надсилає код на пошту', async () => {
    const res = await register(newUser());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Акаунт створено! Введіть код з пошти.' });

    const row = await getUserByEmail('olena@test.local');
    expect(row).toMatchObject({
      username: 'olena', slug: 'olena', role: 'user', plan: 'FREE', status: 'active',
      is_verified: 0, otp_purpose: 'VERIFY_EMAIL', token_version: 0, google_id: null, avatar_url: null,
    });
    expect(row.password_hash).not.toBe(PASSWORD);
    expect(bcrypt.compareSync(PASSWORD, row.password_hash)).toBe(true);
    expect(row.otp_code).toMatch(/^\d{6}$/);
    // Код дійсний годину (перед повторним надсиланням — 15 хвилин, див. auth.admin.test.js)
    expect(Math.abs(row.otp_expires.getTime() - Date.now() - 60 * 60 * 1000)).toBeLessThan(60 * 1000);

    expect(out.emails).toHaveLength(1);
    expect(out.emails[0]).toMatchObject({ to: 'olena@test.local', subject: 'Підтвердження пошти | Kendr' });
    expect(out.codeSentTo('olena@test.local')).toBe(row.otp_code);
    expect(res.body).not.toHaveProperty('token');
  });

  it("нормалізує ім'я: підкреслення стають пробілами, пробіли стискаються, slug — транслітерація", async () => {
    const res = await register(newUser({ username: '  Іван__Петренко   Старий ' }));
    expect(res.status).toBe(201);
    const row = await getUserByEmail('olena@test.local');
    expect(row.username).toBe('Іван Петренко Старий');
    expect(row.slug).toBe('ivan-petrenko-staryi');
  });

  it('однакові за транслітерацією імена отримують slug із лічильником', async () => {
    await register(newUser({ username: 'Ivan', email: 'a@test.local' }));
    await register(newUser({ username: 'Іван', email: 'b@test.local' }));
    expect((await getUserByEmail('a@test.local')).slug).toBe('ivan');
    expect((await getUserByEmail('b@test.local')).slug).toBe('ivan-1');
  });

  it('зберігає аватар, вибраний із каталогу', async () => {
    await register(newUser({ avatar_url: '/uploads/avatars/default/a1.webp' }));
    expect((await getUserByEmail('olena@test.local')).avatar_url).toBe('/uploads/avatars/default/a1.webp');
  });

  it.each([
    ['зовнішня адреса', 'https://example.test/a.png'],
    ['відносний шлях із «..»', 'uploads/avatars/custom/../../../.env'],
    ['каталог користувацьких файлів', '/uploads/avatars/custom/x.webp'],
  ])('D-SEC-19: аватар «%s» відхиляється — 400 без створення акаунта', async (_label, avatar_url) => {
    const res = await register(newUser({ avatar_url }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Недопустима адреса аватара.' });
    expect(await getUserByEmail('olena@test.local')).toBeUndefined();
  });

  it.each([
    ['коротший за 8 символів', 'Short1A'],
    ['без великої літери', 'alllowercase1'],
    ['без цифри', 'NoDigitsHere'],
    ['порожній', ''],
  ])('слабкий пароль (%s) — 400 без створення акаунта', async (_label, password) => {
    const res = await register(newUser({ password }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Пароль занадто слабкий.' });
    expect(await countRows('users')).toBe(0);
    expect(out.emails).toHaveLength(0);
  });

  it('пароль не вказано — 400', async () => {
    const res = await register({ username: 'olena', email: 'olena@test.local' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Пароль занадто слабкий.');
  });

  // KNOWN-DEFECT D-BIZ-04: клієнт вимагає й малу літеру та відсікає прості послідовності, сервер — лише велику літеру, цифру й 8 символів.
  it.each([
    ['ABCDEFG1', 'без малої літери'],
    ['12345678A', 'проста послідовність цифр'],
  ])('KNOWN-DEFECT D-BIZ-04: сервер приймає пароль %s (%s)', async (password, _label) => {
    const res = await register(newUser({ password }));
    expect(res.status).toBe(201);
  });

  it('email, що вже існує, — 400 (без урахування регістру)', async () => {
    await createUser({ email: 'olena@test.local', username: 'first' });
    const res = await register(newUser({ email: 'OLENA@test.local' }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Користувач з таким email вже існує.' });
  });

  it("ім'я, що вже існує, — 400; порівнюється нормалізоване ім'я", async () => {
    await createUser({ username: 'john doe' });
    const res = await register(newUser({ username: 'john_doe' }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Це ім'я користувача вже зайняте." });
    expect(await countRows('users', 'email = ?', ['olena@test.local'])).toBe(0);
  });

  it('реєстрацію вимкнено в налаштуваннях платформи — 403', async () => {
    await setGlobalSetting('registration_enabled', 0);
    const res = await register(newUser());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Реєстрація тимчасово призупинена з технічних причин.' });
    expect(await countRows('users')).toBe(0);
  });

  // KNOWN-DEFECT D-SEC-12: код будується з Math.random(), тож не є криптографічно стійким. Підміна генератора повністю визначає код.
  it.each([
    [0, '100000'],
    [0.999999, '999999'],
  ])('KNOWN-DEFECT D-SEC-12: Math.random() = %s дає код %s', async (random, expected) => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(random);
    let res;
    try {
      res = await register(newUser());
    } finally {
      spy.mockRestore();
    }
    expect(res.status).toBe(201);
    expect((await getUserByEmail('olena@test.local')).otp_code).toBe(expected);
    expect(out.codeSentTo('olena@test.local')).toBe(expected);
  });

  // KNOWN-DEFECT D-BIZ-13: обов'язкові поля й формат не перевіряються.
  it("KNOWN-DEFECT D-BIZ-13: без username — 500 (TypeError на username.replace), а не 400", async () => {
    const res = await quietly(() => register({ email: 'olena@test.local', password: PASSWORD }));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/replace/);
    expect(await countRows('users')).toBe(0);
  });

  it('KNOWN-DEFECT D-BIZ-13: без email — 500 (порушення NOT NULL у БД), а не 400', async () => {
    const res = await quietly(() => register({ username: 'olena', password: PASSWORD }));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/email/i);
    expect(await countRows('users')).toBe(0);
  });

  it("KNOWN-DEFECT D-BIZ-13: ім'я з одних пробілів нормалізується до порожнього й створює акаунт без імені", async () => {
    const res = await register(newUser({ username: '   ' }));
    expect(res.status).toBe(201);
    const row = await getUserByEmail('olena@test.local');
    expect(row.username).toBe('');
    expect(row.slug).toBe('user');
  });

  it('KNOWN-DEFECT D-BIZ-13: формат email не перевіряється, лист «надсилається» на довільний рядок', async () => {
    const res = await register(newUser({ email: 'not-an-email' }));
    expect(res.status).toBe(201);
    expect((await getUserByEmail('not-an-email')).email).toBe('not-an-email');
    expect(out.emails[0].to).toBe('not-an-email');
  });
});

describe('POST /api/auth/verify-email', () => {
  let user;
  beforeEach(async () => {
    user = await createUser({ email: 'olena@test.local', username: 'olena' });
    await patchUser(user, { is_verified: 0 });
    await setOtp(user, { code: '123456', purpose: 'VERIFY_EMAIL', minutes: 30 });
  });

  it('правильний код підтверджує пошту й стирає код', async () => {
    const res = await verifyEmail({ email: 'olena@test.local', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Email успішно підтверджено! Тепер ви можете увійти.' });
    const row = await getUserByEmail('olena@test.local');
    expect(row).toMatchObject({ is_verified: 1, otp_code: null, otp_expires: null, otp_purpose: null });
  });

  it('код одноразовий: повторне введення — 400', async () => {
    await verifyEmail({ email: 'olena@test.local', code: '123456' });
    const again = await verifyEmail({ email: 'olena@test.local', code: '123456' });
    expect(again.status).toBe(400);
    expect(again.body).toEqual({ message: 'Недійсний код підтвердження' });
  });

  it("без email або коду — 400", async () => {
    const res = await verifyEmail({ email: 'olena@test.local' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Email та код обов'язкові" });
  });

  it.each([
    ['неправильний код', { email: 'olena@test.local', code: '654321' }],
    ['невідомий email', { email: 'nobody@test.local', code: '123456' }],
    ['код числом, а не рядком (порівняння !==)', { email: 'olena@test.local', code: 123456 }],
  ])('%s — 400 без змін у БД', async (_label, body) => {
    const res = await verifyEmail(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Недійсний код підтвердження' });
    expect(await getUserByEmail('olena@test.local')).toMatchObject({ is_verified: 0, otp_code: '123456' });
  });

  it('код з іншим призначенням не підтверджує пошту', async () => {
    await setOtp(user, { code: '123456', purpose: 'RESET_PASSWORD', minutes: 30 });
    const res = await verifyEmail({ email: 'olena@test.local', code: '123456' });
    expect(res.status).toBe(400);
    expect((await getUserByEmail('olena@test.local')).is_verified).toBe(0);
  });

  it('код, що сплив, — 400 і код у БД лишається', async () => {
    await setOtp(user, { code: '123456', purpose: 'VERIFY_EMAIL', minutes: -1 });
    const res = await verifyEmail({ email: 'olena@test.local', code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Термін дії коду минув' });
    expect(await getUserByEmail('olena@test.local')).toMatchObject({ is_verified: 0, otp_code: '123456' });
  });

  // KNOWN-DEFECT D-SEC-20: лічильника хибних спроб на акаунт немає, є лише ліміт на IP (див. auth.guards.test.js).
  // З різних адрес код підбирається без блокування, і правильний код після 15 промахів усе ще діє.
  it('KNOWN-DEFECT D-SEC-20: 15 хибних спроб з різних адрес не блокують акаунт, правильний код після них приймається', async () => {
    for (let guess = 0; guess < 15; guess++) {
      const wrong = await verifyEmail({ email: 'olena@test.local', code: String(100000 + guess) }, freshIp());
      expect(wrong.status).toBe(400);
    }
    expect((await getUserByEmail('olena@test.local')).otp_code).toBe('123456');
    const right = await verifyEmail({ email: 'olena@test.local', code: '123456' }, freshIp());
    expect(right.status).toBe(200);
  });
});

describe('повний шлях: реєстрація → код з листа → підтвердження → вхід', () => {
  it('новий користувач входить лише після підтвердження пошти', async () => {
    await register(newUser());
    const credentials = { loginInput: 'olena@test.local', password: PASSWORD };

    const before = await fromIp(request(app).post('/api/auth/login')).send(credentials);
    expect(before.status).toBe(403);
    expect(before.body).toMatchObject({ message: 'Ваша пошта не підтверджена.', isNotVerified: true, email: 'olena@test.local' });

    const verified = await verifyEmail({ email: 'olena@test.local', code: out.codeSentTo('olena@test.local') });
    expect(verified.status).toBe(200);

    const after = await fromIp(request(app).post('/api/auth/login')).send(credentials);
    expect(after.status).toBe(200);
    expect(after.body.user).toMatchObject({ username: 'olena', email: 'olena@test.local', role: 'user', plan: 'FREE' });

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${after.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('olena');
  });
});

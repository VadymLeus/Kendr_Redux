// Захист маршрутів автентифікації: обмежувачі частоти (express-rate-limit) і перевірка Cloudflare Turnstile.
// Фіксує D-SEC-20 (ліміт діє на IP, а не на акаунт). D-SEC-25 виправлено: Turnstile вимикає змінна середовища, а не ім'я хоста.
// Лічильники обмежувачів живуть у пам'яті процесу й ключуються за req.ip; кожен тест бере власну адресу (helpers/client.js).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { captureOutbound, quietly } from '../helpers/outbound.js';
import { freshIp, fromIp, onPublicHost } from '../helpers/client.js';
import { createUser, setOtp, countRows } from '../helpers/factories.js';

useTestDatabase();

let out;
beforeEach(() => {
  out = captureOutbound();
});
afterEach(() => out.restore());

const send = (url, body, ip) => fromIp(request(app).post(`/api/auth/${url}`), ip).send(body);

// Надсилає запити з однієї адреси й повертає відповіді в порядку відправлення.
async function burst(ip, calls) {
  const responses = [];
  for (const [url, body] of calls) responses.push(await send(url, body, ip));
  return responses;
}
const repeat = (count, call) => Array.from({ length: count }, () => call);

describe('обмежувачі частоти', () => {
  const LOGIN = ['login', { loginInput: 'nobody', password: 'Wrong-pass1' }];
  const REGISTER = ['register', { username: 'olena', email: 'olena@test.local', password: 'weak' }];

  it('вхід: 5 спроб за 15 хвилин з однієї адреси, шоста — 429', async () => {
    const ip = freshIp();
    const responses = await burst(ip, repeat(6, LOGIN));
    expect(responses.slice(0, 5).map((res) => res.status)).toEqual([401, 401, 401, 401, 401]);
    expect(responses[5].status).toBe(429);
    expect(responses[5].body).toEqual({ message: 'Забагато спроб входу. Спробуйте пізніше через 15 хвилин.' });
  });

  it('лічильник рахує всі спроби, а не лише невдалі', async () => {
    const ip = freshIp();
    await createUser({ username: 'olena', email: 'olena@test.local', password: 'Strong-pass1' });
    const good = ['login', { loginInput: 'olena', password: 'Strong-pass1' }];
    const responses = await burst(ip, repeat(6, good));
    expect(responses.slice(0, 5).map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
    expect(responses[5].status).toBe(429);
  });

  it('ліміт діє на адресу: інша адреса не заблокована', async () => {
    const blocked = freshIp();
    await burst(blocked, repeat(5, LOGIN));
    expect((await send(...LOGIN, blocked)).status).toBe(429);
    expect((await send(...LOGIN, freshIp())).status).toBe(401);
  });

  it('реєстрація: 5 спроб за годину, шоста — 429', async () => {
    const responses = await burst(freshIp(), repeat(6, REGISTER));
    expect(responses.slice(0, 5).map((res) => res.status)).toEqual([400, 400, 400, 400, 400]);
    expect(responses[5].status).toBe(429);
    expect(responses[5].body).toEqual({ message: 'Забагато спроб реєстрації з вашого IP. Спробуйте пізніше.' });
  });

  it('forgot-password і reset-password ділять один ліміт: 3 запити за годину', async () => {
    const responses = await burst(freshIp(), [
      ['forgot-password', { email: 'a@test.local' }],
      ['forgot-password', { email: 'b@test.local' }],
      ['reset-password', { email: 'a@test.local', code: '123456', newPassword: 'Brand-new1' }],
      ['forgot-password', { email: 'c@test.local' }],
    ]);
    expect(responses.slice(0, 3).map((res) => res.status)).toEqual([200, 200, 400]);
    expect(responses[3].status).toBe(429);
    expect(responses[3].body).toEqual({ message: 'Забагато запитів на відновлення пароля. Спробуйте пізніше.' });
  });

  it('verify-email, verify-2fa і verify-reset-code ділять один ліміт: 5 спроб за 15 хвилин', async () => {
    const empty = {};
    const responses = await burst(freshIp(), [
      ['verify-email', empty],
      ['verify-2fa', empty],
      ['verify-reset-code', empty],
      ['verify-email', empty],
      ['verify-2fa', empty],
      ['verify-reset-code', empty],
    ]);
    expect(responses.slice(0, 5).map((res) => res.status)).toEqual([400, 400, 400, 400, 400]);
    expect(responses[5].status).toBe(429);
    expect(responses[5].body).toEqual({ message: 'Забагато спроб введення коду. Спробуйте пізніше через 15 хвилин.' });
  });

  it('resend-otp: 10 запитів за 15 хвилин, одинадцятий — 429', async () => {
    const responses = await burst(freshIp(), repeat(11, ['resend-otp', { email: 'nobody@test.local', purpose: 'RESET_PASSWORD' }]));
    expect(responses.slice(0, 10).every((res) => res.status === 200)).toBe(true);
    expect(responses[10].status).toBe(429);
    expect(responses[10].body).toEqual({ message: 'Забагато запитів на відправку коду. Спробуйте пізніше.' });
  });

  it('вхід до адмін-панелі: 3 спроби за годину, четверта — 429', async () => {
    const responses = await burst(freshIp(), repeat(4, ['admin/login', { loginInput: 'nobody', password: 'x' }]));
    expect(responses.slice(0, 3).map((res) => res.status)).toEqual([401, 401, 401]);
    expect(responses[3].status).toBe(429);
    expect(responses[3].body).toEqual({
      message: 'Забагато спроб входу до панелі керування. Ваша IP адреса тимчасово заблокована.',
    });
  });

  it('обмежувачі незалежні: вичерпаний ліміт входу не блокує введення коду з тієї самої адреси', async () => {
    const ip = freshIp();
    await burst(ip, repeat(5, LOGIN));
    expect((await send(...LOGIN, ip)).status).toBe(429);
    const code = await send('verify-email', {}, ip);
    expect(code.status).toBe(400);
  });

  // KNOWN-DEFECT D-SEC-20: ліміт прив'язаний до адреси, а не до акаунта. Скільки б спроб не зробили з однієї адреси,
  // з наступної той самий код підбирається далі, а код у БД не знецінюється.
  it('KNOWN-DEFECT D-SEC-20: після блокування адреси підбір коду того самого акаунта триває з іншої адреси', async () => {
    const user = await createUser({ username: 'olena', email: 'olena@test.local' });
    await setOtp(user, { code: '123456', purpose: 'RESET_PASSWORD', minutes: 10 });
    const guess = (code) => ['verify-reset-code', { email: 'olena@test.local', code }];

    const first = freshIp();
    const attempts = await burst(first, ['000001', '000002', '000003', '000004', '000005', '000006'].map(guess));
    expect(attempts.map((res) => res.status)).toEqual([400, 400, 400, 400, 400, 429]);

    const second = await send(...guess('000007'), freshIp());
    expect(second.status).toBe(400);
    const right = await send(...guess('123456'), freshIp());
    expect(right.status).toBe(200);
  });
});

describe('Cloudflare Turnstile', () => {
  const TOKEN_REQUIRED = { message: "Перевірка безпеки (Turnstile) обов'язкова." };
  const onSite = (url, body, ip = freshIp()) => fromIp(request(app).post(`/api/auth/${url}`), ip).send(body);

  let savedDisabled;
  beforeEach(() => {
    savedDisabled = process.env.TURNSTILE_DISABLED;
    process.env.TURNSTILE_DISABLED = 'false';
  });
  afterEach(() => {
    process.env.TURNSTILE_DISABLED = savedDisabled;
  });

  it.each([
    ['register', { username: 'olena', email: 'olena@test.local', password: 'Strong-pass1' }],
    ['login', { loginInput: 'olena', password: 'Strong-pass1' }],
    ['admin/login', { loginInput: 'root', password: 'Strong-pass1' }],
    ['forgot-password', { email: 'olena@test.local' }],
  ])('POST /api/auth/%s без токена Turnstile — 400', async (url, body) => {
    const res = await onSite(url, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(TOKEN_REQUIRED);
    expect(out.turnstile).toHaveLength(0);
    expect(await countRows('users')).toBe(0);
  });

  // Ці маршрути Turnstile не вимагають: код з пошти можна замовляти й вгадувати без перевірки на робота.
  it.each([
    ['verify-2fa', {}],
    ['verify-email', {}],
    ['verify-reset-code', {}],
    ['reset-password', {}],
    ['resend-otp', { email: 'nobody@test.local', purpose: 'RESET_PASSWORD' }],
  ])('POST /api/auth/%s не вимагає токена Turnstile', async (url, body) => {
    const res = await onSite(url, body);
    expect(res.body.message).not.toBe(TOKEN_REQUIRED.message);
    expect(out.turnstile).toHaveLength(0);
  });

  it('токен передається в Cloudflare разом із секретом і адресою клієнта; успішна перевірка пропускає запит до контролера', async () => {
    const ip = freshIp();
    const res = await onSite('login', { loginInput: 'nobody', password: 'x', turnstileToken: 'token-123' }, ip);
    expect(res.status).toBe(401);
    expect(out.turnstile).toHaveLength(1);
    expect(out.turnstile[0].method).toBe('POST');
    expect(Object.fromEntries(out.turnstile[0].form)).toEqual({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: 'token-123',
      remoteip: ip,
    });
  });

  it('Cloudflare відхилив токен — 403, контролер не викликається', async () => {
    out.setTurnstileVerdict({ success: false, 'error-codes': ['invalid-input-response'] });
    const res = await quietly(() =>
      onSite('register', { username: 'olena', email: 'olena@test.local', password: 'Strong-pass1', turnstileToken: 'bad' })
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Перевірка на робота не пройдена. Спробуйте ще раз.' });
    expect(await countRows('users')).toBe(0);
  });

  it('Cloudflare недоступний — 500', async () => {
    out.failTurnstile();
    const res = await quietly(() => onSite('login', { loginInput: 'olena', password: 'x', turnstileToken: 'tok' }));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Помилка сервера при перевірці безпеки.' });
  });

  it('TURNSTILE_DISABLED=true вимикає перевірку: токен не потрібен і до Cloudflare запит не йде', async () => {
    process.env.TURNSTILE_DISABLED = 'true';
    const res = await onSite('login', { loginInput: 'nobody', password: 'x' });
    expect(res.status).toBe(401);
    expect(out.turnstile).toHaveLength(0);
  });

  it('у виробничому режимі TURNSTILE_DISABLED ігнорується', async () => {
    process.env.TURNSTILE_DISABLED = 'true';
    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await onSite('login', { loginInput: 'nobody', password: 'x' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(TOKEN_REQUIRED);
    } finally {
      process.env.NODE_ENV = savedEnv;
    }
  });

  it.each([
    ['localhost', 'localhost'],
    ['127.0.0.1', '127.0.0.1'],
  ])('D-SEC-25: ім\'я хоста %s із запиту не вимикає Turnstile', async (_label, host) => {
    const res = await onPublicHost(fromIp(request(app).post('/api/auth/login')), host).send({ loginInput: 'nobody', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(TOKEN_REQUIRED);
    expect(out.turnstile).toHaveLength(0);
  });

  it('D-SEC-25: заголовок X-Forwarded-Host: localhost не вимикає Turnstile на публічному домені', async () => {
    const res = await fromIp(request(app).post('/api/auth/login'))
      .set('Host', 'kendr.test')
      .set('X-Forwarded-Host', 'localhost')
      .send({ loginInput: 'nobody', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(TOKEN_REQUIRED);
    expect(out.turnstile).toHaveLength(0);
  });
});

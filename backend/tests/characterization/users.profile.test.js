// Профіль користувача (/api/users): публічний профіль, редагування, зміна пароля, аватар.
// Фіксує D-BIZ-04 (зміна пароля без перевірки складності), D-BIZ-13 (немає валідації), D-BIZ-15 (slug мінливий при збереженні),
// D-SEC-19 (довільне видалення файлів через avatar-url), виправлення D-SEC-21 (зміна пароля відкликає сесії), D-CON-05, D-ARC-12.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import { quietly } from '../helpers/outbound.js';
import { fromIp, freshIp } from '../helpers/client.js';
import { query } from '../helpers/testDb.js';
import {
  createUser, createSite, createWarning, patchUser, getUser,
} from '../helpers/factories.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

useTestDatabase();

const PASSWORD = 'Strong-pass1';
const BACKEND_ROOT = fileURLToPath(new URL('../../', import.meta.url));

let owner, other, admin, moderator;
beforeEach(async () => {
  owner = await createUser({ username: 'olena', email: 'olena@test.local', password: PASSWORD });
  await patchUser(owner, {
    slug: 'olena', phone_number: '+380501234567', bio: 'Привіт', social_telegram: '@olena',
    social_instagram: 'olena_ig', social_website: 'https://olena.test',
  });
  other = await createUser({ username: 'other', email: 'other@test.local' });
  admin = await createUser({ role: 'admin', username: 'root', email: 'admin@test.local' });
  moderator = await createUser({ role: 'moderator', username: 'mod', email: 'mod@test.local' });
});

const as = (req, user) => (user ? req.set(authHeader(user)) : req);
const getProfile = (name, viewer) => as(request(app).get(`/api/users/${name}`), viewer);
const putProfile = (body, user = owner) => as(request(app).put('/api/users/profile'), user).send(body);
const changePassword = (body, { user = owner, ip = freshIp() } = {}) =>
  fromIp(as(request(app).put('/api/users/profile/password'), user), ip).send(body);

describe('GET /api/users/:username (публічний профіль)', () => {
  const ANONYMOUS_KEYS = [
    'id', 'username', 'slug', 'createdAt', 'created_at', 'siteCount', 'totalViews', 'avatar_url', 'bio',
    'is_profile_public', 'status', 'warning_count', 'socials', 'warnings',
  ];

  it('знаходить за slug і за іменем; анонім бачить лише публічні поля', async () => {
    await patchUser(owner, { slug: 'olena-slug' });
    for (const name of ['olena-slug', 'olena']) {
      const res = await getProfile(name);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual([...ANONYMOUS_KEYS].sort());
      expect(res.body).toMatchObject({
        id: owner.id, username: 'olena', bio: 'Привіт', status: 'active', warning_count: 0, warnings: [],
        socials: { telegram: '@olena', instagram: 'olena_ig', website: 'https://olena.test' },
      });
    }
  });

  it.each([
    ['власник', () => owner],
    ['адміністратор', () => admin],
    ['модератор', () => moderator],
  ])('%s додатково бачить пошту, телефон, роль, тариф і last_login_at', async (_label, viewer) => {
    const res = await getProfile('olena', viewer());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: 'olena@test.local', phone_number: '+380501234567', role: 'user', plan: 'FREE',
    });
    expect(res.body).toHaveProperty('last_login_at');
  });

  it('інший користувач бачить те саме, що й анонім', async () => {
    const res = await getProfile('olena', other);
    expect(Object.keys(res.body).sort()).toEqual([...ANONYMOUS_KEYS].sort());
  });

  it('невідомий користувач — 404 з кодом USER_NOT_FOUND', async () => {
    const res = await getProfile('nobody');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Користувача не знайдено', code: 'USER_NOT_FOUND' });
  });

  it('профіль адміністратора приховано від усіх, модератора — видно', async () => {
    const hidden = await getProfile('root', admin);
    expect(hidden.status).toBe(404);
    expect(hidden.body.code).toBe('USER_NOT_FOUND');
    const visible = await getProfile('mod');
    expect(visible.status).toBe(200);
    expect(visible.body).not.toHaveProperty('role');
  });

  it('приватний профіль: 403 для аноніма й сторонніх, відкритий для власника й персоналу', async () => {
    await patchUser(owner, { is_profile_public: 0 });
    const anonymous = await getProfile('olena');
    expect(anonymous.status).toBe(403);
    expect(anonymous.body).toEqual({ message: 'Цей профіль є приватним.', code: 'PROFILE_PRIVATE' });
    expect((await getProfile('olena', other)).status).toBe(403);
    expect((await getProfile('olena', owner)).status).toBe(200);
    expect((await getProfile('olena', admin)).status).toBe(200);
    expect((await getProfile('olena', moderator)).status).toBe(200);
  });

  it('недійсний токен не дає 401: користувач вважається анонімним', async () => {
    await patchUser(owner, { is_profile_public: 0 });
    const res = await request(app).get('/api/users/olena').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_PRIVATE');
  });

  it('лічильники рахують лише опубліковані сайти', async () => {
    const first = await createSite(owner, { status: 'published' });
    const second = await createSite(owner, { status: 'published' });
    const hidden = await createSite(owner, { status: 'private' });
    for (const [site, views] of [[first, 10], [second, 5], [hidden, 100]]) {
      await query('UPDATE sites SET view_count = ? WHERE id = ?', [views, site.id]);
    }
    const res = await getProfile('olena');
    expect(res.body.siteCount).toBe(2);
    // SUM у MySQL повертається як DECIMAL, mysql2 віддає його рядком: порівнюємо як число
    expect(Number(res.body.totalViews)).toBe(15);
  });

  // KNOWN-DEFECT D-CON-05: список попереджень публічний, але Warning.findForUser вибирає лише id, site_id і created_at.
  // Причина (reason_note), яку очікує сторінка профілю, ніколи не надходить.
  it('KNOWN-DEFECT D-CON-05: попередження видно всім, але без причини', async () => {
    const site = await createSite(owner);
    await createWarning(owner, site, 'Порушення правил');
    await createWarning(owner, null, 'Спам');
    const res = await getProfile('olena');
    expect(res.body.warning_count).toBe(2);
    expect(res.body.warnings).toHaveLength(2);
    expect(Object.keys(res.body.warnings[0]).sort()).toEqual(['created_at', 'id', 'site_id']);
    expect(JSON.stringify(res.body.warnings)).not.toMatch(/Порушення|Спам|reason_note/);
  });

  it('GET /api/users/default-avatars віддає перелік шляхів до стандартних аватарів (маршрут стоїть перед /:username)', async () => {
    const res = await request(app).get('/api/users/default-avatars');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const url of res.body) expect(url.startsWith('/uploads/avatars/default/')).toBe(true);
  });
});

describe('PUT /api/users/profile', () => {
  it('без токена — 401', async () => {
    const res = await request(app).put('/api/users/profile').send({ bio: 'x' });
    expect(res.status).toBe(401);
  });

  it('оновлює дозволені поля й повертає профіль зі статистикою', async () => {
    const res = await putProfile({ bio: 'Нове біо', phone_number: '+380 (50) 111-22-33', platform_theme_mode: 'dark', platform_theme_accent: 'green' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Профіль успішно оновлено!');
    expect(Object.keys(res.body.user).sort()).toEqual([
      'id', 'username', 'slug', 'email', 'phone_number', 'avatar_url', 'role', 'plan', 'platform_theme_mode',
      'platform_theme_accent', 'bio', 'social_telegram', 'social_instagram', 'social_website', 'is_profile_public',
      'has_password', 'created_at', 'stats',
    ].sort());
    expect(res.body.user).toMatchObject({
      bio: 'Нове біо', phone_number: '+380 (50) 111-22-33', platform_theme_mode: 'dark', platform_theme_accent: 'green',
      has_password: true,
    });
    expect(res.body.user.stats).toMatchObject({ siteCount: 0, siteLimit: 3, mediaCount: 0, mediaLimit: 50, warningCount: 0 });
    expect(Number(res.body.user.stats.totalViews)).toBe(0);
  });

  it('поля поза білим списком ігноруються (роль, тариф, email, статус, версія токена)', async () => {
    const res = await putProfile({
      bio: 'Нове', role: 'admin', plan: 'PLUS', email: 'hacker@test.local', status: 'suspended', token_version: 9, password_hash: 'x',
    });
    expect(res.status).toBe(200);
    expect(await getUser(owner.id)).toMatchObject({
      bio: 'Нове', role: 'user', plan: 'FREE', email: 'olena@test.local', status: 'active', token_version: 0,
    });
  });

  it('жодного дозволеного поля — 400', async () => {
    const res = await putProfile({ role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Немає даних для оновлення' });
  });

  it("зміна імені: зайняте — 400, вільне — оновлює ім'я й slug", async () => {
    const taken = await putProfile({ username: 'other' });
    expect(taken.status).toBe(400);
    expect(taken.body).toEqual({ message: "Це ім'я користувача вже зайнято." });

    const changed = await putProfile({ username: 'Mykola' });
    expect(changed.status).toBe(200);
    expect(changed.body.user).toMatchObject({ username: 'Mykola', slug: 'mykola' });
    expect(await getUser(owner.id)).toMatchObject({ username: 'Mykola', slug: 'mykola' });
  });

  it("при зміні імені підкреслення й пробіли не нормалізуються (на відміну від реєстрації)", async () => {
    const res = await putProfile({ username: 'Mykola_Bondar' });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('Mykola_Bondar');
  });

  // KNOWN-DEFECT D-BIZ-15: форма профілю надсилає username при кожному збереженні, а slug перевипускається щоразу;
  // власний slug вважається зайнятим, тож публічна адреса профілю чергується між olena і olena-1.
  it('KNOWN-DEFECT D-BIZ-15: повторне збереження того самого імені змінює slug (olena → olena-1 → olena)', async () => {
    const first = await putProfile({ username: 'olena', bio: 'один' });
    expect(first.body.user.slug).toBe('olena-1');
    const second = await putProfile({ username: 'olena', bio: 'два' });
    expect(second.body.user.slug).toBe('olena');
    expect((await getProfile('olena-1')).status).toBe(404);
  });

  it('телефон: допускає цифри й символи + - ( ), інше — 400', async () => {
    const bad = await putProfile({ phone_number: '050-abc' });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ message: 'Некоректний формат телефону. Використовуйте лише цифри та символи + ( ) -' });
    expect((await getUser(owner.id)).phone_number).toBe('+380501234567');

    const cleared = await putProfile({ phone_number: '' });
    expect(cleared.status).toBe(200);
    expect((await getUser(owner.id)).phone_number).toBe('');
  });

  it('біо: прибираються < і >, обрізаються пробіли, довжина до 300 символів', async () => {
    const tags = await putProfile({ bio: '  <b>Привіт</b>  ' });
    expect(tags.body.user.bio).toBe('bПривіт/b');
    const long = await putProfile({ bio: 'x'.repeat(400) });
    expect(long.body.user.bio).toHaveLength(300);
  });

  it('сайт у профілі має починатися з http:// або https://; javascript: відхиляється', async () => {
    for (const website of ['olena.test', 'javascript:alert(1)', 'ftp://olena.test']) {
      const res = await putProfile({ social_website: website });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Посилання на сайт має починатися з http:// або https://' });
    }
    const ok = await putProfile({ social_website: '  https://olena.dev  ' });
    expect(ok.body.user.social_website).toBe('https://olena.dev');
    const cleared = await putProfile({ social_website: '' });
    expect(cleared.status).toBe(200);
  });

  it('telegram і instagram: прибираються < і >, пробіли обрізаються', async () => {
    const res = await putProfile({ social_telegram: ' <@olena_tg> ', social_instagram: '<ig>' });
    expect(res.body.user).toMatchObject({ social_telegram: '@olena_tg', social_instagram: 'ig' });
  });

  it('is_profile_public = 0 робить профіль приватним для інших', async () => {
    await putProfile({ is_profile_public: 0 });
    expect((await getProfile('olena')).status).toBe(403);
  });

  // KNOWN-DEFECT D-BIZ-13: сервер не перевіряє довжину й тип полів, а клієнтські правила (мінімум 3 символи в імені) на сервері відсутні.
  it("KNOWN-DEFECT D-BIZ-13: порожнє ім'я зберігається (клієнт вимагає мінімум 3 символи)", async () => {
    const res = await putProfile({ username: '' });
    expect(res.status).toBe(200);
    expect((await getUser(owner.id)).username).toBe('');
  });

  it('KNOWN-DEFECT D-BIZ-13: біо не рядком — 500 (TypeError на replace), а не 400', async () => {
    const res = await quietly(() => putProfile({ bio: 12345 }));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/replace/);
  });

  it('KNOWN-DEFECT D-BIZ-13: тема поза переліком — 500 із текстом SQL', async () => {
    const res = await quietly(() => putProfile({ platform_theme_mode: 'neon' }));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/platform_theme_mode/);
  });
});

describe('PUT /api/users/profile/password', () => {
  it('без токена — 401', async () => {
    const res = await request(app).put('/api/users/profile/password').send({ newPassword: 'Brand-new1' });
    expect(res.status).toBe(401);
  });

  it('змінює пароль після підтвердження поточного', async () => {
    const res = await changePassword({ currentPassword: PASSWORD, newPassword: 'Brand-new1' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Пароль успішно змінено.');
    expect(res.body.user).toMatchObject({ id: owner.id, has_password: true });
    expect(res.body.user).not.toHaveProperty('password_hash');
    const row = await getUser(owner.id);
    expect(bcrypt.compareSync('Brand-new1', row.password_hash)).toBe(true);

    const login = await fromIp(request(app).post('/api/auth/login')).send({ loginInput: 'olena', password: 'Brand-new1' });
    expect(login.status).toBe(200);
  });

  it('без поточного пароля — 400, неправильний поточний — 401, пароль не змінюється', async () => {
    const missing = await changePassword({ newPassword: 'Brand-new1' });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ message: 'Введіть поточний пароль для підтвердження.' });
    const wrong = await changePassword({ currentPassword: 'Wrong-pass1', newPassword: 'Brand-new1' });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ message: 'Невірний поточний пароль.' });
    expect(bcrypt.compareSync(PASSWORD, (await getUser(owner.id)).password_hash)).toBe(true);
  });

  it('акаунт без пароля (Google) встановлює його без поточного', async () => {
    await patchUser(owner, { password_hash: null });
    const res = await changePassword({ newPassword: 'Brand-new1' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Пароль успішно встановлено.');
    expect(res.body.user.has_password).toBe(true);
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET)).toMatchObject({ id: owner.id, token_version: 1 });
  });

  // KNOWN-DEFECT D-BIZ-04: складність нового пароля не перевіряється зовсім.
  it.each(['1', 'abc', 'password'])('KNOWN-DEFECT D-BIZ-04: новий пароль «%s» приймається', async (newPassword) => {
    const res = await changePassword({ currentPassword: PASSWORD, newPassword });
    expect(res.status).toBe(200);
    expect(bcrypt.compareSync(newPassword, (await getUser(owner.id)).password_hash)).toBe(true);
  });

  it('KNOWN-DEFECT D-BIZ-13: без нового пароля — 500 (виняток bcryptjs), а не 400', async () => {
    const res = await quietly(() => changePassword({ currentPassword: PASSWORD }));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/illegal arguments/i);
  });

  it('D-SEC-21: зміна пароля збільшує token_version, відкликає старі токени й видає новий токен у відповіді', async () => {
    const stolen = authHeader(owner);
    const res = await changePassword({ currentPassword: PASSWORD, newPassword: 'Brand-new1' });
    expect(res.status).toBe(200);
    expect((await getUser(owner.id)).token_version).toBe(1);
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET)).toMatchObject({ id: owner.id, role: 'user', plan: 'FREE', token_version: 1 });

    const old = await request(app).get('/api/auth/me').set(stolen);
    expect(old.status).toBe(401);
    const fresh = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(fresh.status).toBe(200);
  });

  it('невдала зміна пароля токени не відкликає', async () => {
    const res = await changePassword({ currentPassword: 'Wrong-pass1', newPassword: 'Brand-new1' });
    expect(res.status).toBe(401);
    expect((await getUser(owner.id)).token_version).toBe(0);
    expect((await request(app).get('/api/auth/me').set(authHeader(owner))).status).toBe(200);
  });

  it('обмежувач: 3 спроби на годину з однієї адреси, четверта — 429', async () => {
    const ip = freshIp();
    const attempts = [];
    for (let i = 0; i < 4; i++) {
      attempts.push(await changePassword({ currentPassword: 'Wrong-pass1', newPassword: 'Brand-new1' }, { ip }));
    }
    expect(attempts.map((res) => res.status)).toEqual([401, 401, 401, 429]);
    expect(attempts[3].body).toEqual({ message: 'Забагато спроб зміни пароля. Спробуйте пізніше через годину.' });
  });
});

describe('аватар', () => {
  const sentinels = [];
  const writeSentinel = (...segments) => {
    const file = path.join(BACKEND_ROOT, ...segments);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'sentinel');
    sentinels.push(file);
    return file;
  };
  afterEach(() => {
    for (const file of sentinels.splice(0)) fs.rmSync(file, { force: true });
  });

  it('PUT /profile/avatar-url зберігає адресу, DELETE /profile/avatar очищає', async () => {
    const set = await as(request(app).put('/api/users/profile/avatar-url'), owner).send({ avatar_url: '/uploads/avatars/default/a1.webp' });
    expect(set.status).toBe(200);
    expect(set.body.message).toBe('Аватар оновлено!');
    expect(set.body.user.avatar_url).toBe('/uploads/avatars/default/a1.webp');

    const removed = await as(request(app).delete('/api/users/profile/avatar'), owner);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('Аватар видалено');
    expect((await getUser(owner.id)).avatar_url).toBeNull();
  });

  it('POST /profile/avatar без файлу — 400', async () => {
    const res = await as(request(app).post('/api/users/profile/avatar'), owner).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Файл не завантажено.' });
  });

  // KNOWN-DEFECT D-ARC-12: deleteFile вважає шлях зі слешем на початку абсолютним (path.isAbsolute), тож гілка, що знімає
  // початковий слеш, недосяжна, а штатний шлях аватара /uploads/avatars/custom/... відхиляється як вихід за межі каталогу.
  it('KNOWN-DEFECT D-ARC-12: файл за штатним шляхом /uploads/avatars/custom/… при заміні аватара не видаляється', async () => {
    const name = `d-arc-12-${Date.now()}.webp`;
    const file = writeSentinel('uploads', 'avatars', 'custom', name);
    await patchUser(owner, { avatar_url: `/uploads/avatars/custom/${name}` });
    const res = await quietly(() =>
      as(request(app).put('/api/users/profile/avatar-url'), owner).send({ avatar_url: 'https://example.test/new.png' })
    );
    expect(res.status).toBe(200);
    expect(fs.existsSync(file)).toBe(true);
  });

  // KNOWN-DEFECT D-SEC-19: avatar-url зберігає довільний рядок, а при наступній заміні він передається в deleteFile. Перевірка в
  // deleteFile лише вимагає, щоб підсумковий шлях був у каталозі backend, тож відносний шлях із «..» видаляє будь-який файл у ньому
  // (конфіги, .env, файли інших користувачів). У тесті видаляється власний файл-мітка в backend/tests/.tmp.
  it('KNOWN-DEFECT D-SEC-19: відносний шлях із «..» у avatar-url дозволяє видалити довільний файл у каталозі backend', async () => {
    const name = `d-sec-19-${Date.now()}.txt`;
    const file = writeSentinel('tests', '.tmp', name);
    const stored = await as(request(app).put('/api/users/profile/avatar-url'), owner)
      .send({ avatar_url: `uploads/avatars/custom/../../../tests/.tmp/${name}` });
    expect(stored.status).toBe(200);
    expect(fs.existsSync(file)).toBe(true);

    const replaced = await as(request(app).put('/api/users/profile/avatar-url'), owner).send({ avatar_url: 'https://example.test/new.png' });
    expect(replaced.status).toBe(200);
    expect(fs.existsSync(file)).toBe(false);
  });
});

// Каркас застосунку: середовище працює, спільні middleware поводяться як у v0.
// Запускайте цей файл першим: npm test -- app.smoke
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { query } from '../helpers/testDb.js';
import { createUser } from '../helpers/factories.js';
import { authHeader } from '../helpers/auth.js';

useTestDatabase();

describe('каркас застосунку', () => {
  it('тестова БД створена зі схеми проєкту', async () => {
    const tables = await query(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`
    );
    expect(tables[0].count).toBe(28);
    const settings = await query('SELECT id, billing_enabled FROM global_settings');
    expect(settings).toEqual([{ id: 1, billing_enabled: 1 }]);
  });

  it('GET / повертає привітання', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toBe('Welcome to Kendr API');
  });

  it('helmet прибирає X-Powered-By і додає заголовки безпеки', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('checkMaintenance додає службові заголовки в звичайному режимі', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-maintenance-mode']).toBe('false');
    expect(res.headers['x-editor-locked']).toBe('false');
  });

  it('невідомий маршрут повертає 404', async () => {
    const res = await request(app).get('/api/no-such-route');
    expect(res.status).toBe(404);
  });
});

describe('verifyToken (на прикладі GET /api/orders/my)', () => {
  it('без заголовка Authorization — 401', async () => {
    const res = await request(app).get('/api/orders/my');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Відмовлено у доступі. Токен не надано.');
  });

  it('із довільним рядком замість токена — 401', async () => {
    const res = await request(app).get('/api/orders/my').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Недійсний токен авторизації.');
  });

  it('із простроченим токеном — 401', async () => {
    const user = await createUser();
    const res = await request(app).get('/api/orders/my').set(authHeader(user, { expiresIn: -10 }));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Час дії сесії минув. Будь ласка, увійдіть знову.');
  });

  it('для користувача, якого немає в БД — 401', async () => {
    const res = await request(app).get('/api/orders/my').set(authHeader({ id: 999999 }));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Користувача не знайдено.');
  });

  it('для заблокованого акаунта — 403 ACCOUNT_SUSPENDED', async () => {
    const user = await createUser({ status: 'suspended' });
    const res = await request(app).get('/api/orders/my').set(authHeader(user));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('для видаленого акаунта — 403 ACCOUNT_DELETED', async () => {
    const user = await createUser({ status: 'deleted' });
    const res = await request(app).get('/api/orders/my').set(authHeader(user));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DELETED');
  });

  it('при розбіжності token_version — 401 (сесія застаріла)', async () => {
    const user = await createUser();
    await query('UPDATE users SET token_version = 1 WHERE id = ?', [user.id]);
    const res = await request(app).get('/api/orders/my').set(authHeader(user));
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Сесія застаріла');
  });

  it('із дійсним токеном пропускає запит', async () => {
    const user = await createUser();
    const res = await request(app).get('/api/orders/my').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

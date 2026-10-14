// backend/tests/unit/authTokens.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const { signAccessToken } = require('../../utils/authTokens');

const user = { id: 7, role: 'user', plan: 'PLUS', token_version: 3 };
const decode = (token) => jwt.verify(token, process.env.JWT_SECRET);

describe('signAccessToken', () => {
  it('кладе в токен id, роль, тариф і token_version; строк дії — 24 години', () => {
    const payload = decode(signAccessToken(user));
    expect(payload).toMatchObject({ id: 7, role: 'user', plan: 'PLUS', token_version: 3 });
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
  });

  it('тариф за замовчуванням — FREE', () => {
    expect(decode(signAccessToken({ ...user, plan: null })).plan).toBe('FREE');
  });

  it('токен лише для відновлення: інша роль і строк дії', () => {
    const payload = decode(signAccessToken(user, { role: 'RESTORE_ONLY', expiresIn: '1h' }));
    expect(payload).toMatchObject({ id: 7, role: 'RESTORE_ONLY', token_version: 3 });
    expect(payload.exp - payload.iat).toBe(60 * 60);
  });

  it('token_version = 0 допустима версія', () => {
    expect(decode(signAccessToken({ ...user, token_version: 0 })).token_version).toBe(0);
  });

  it.each([[undefined], [null]])('без token_version (%s) токен не видається', (version) => {
    expect(() => signAccessToken({ ...user, token_version: version })).toThrow(/token_version/);
  });
});

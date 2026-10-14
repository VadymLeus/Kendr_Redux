// backend/tests/unit/authTokens.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const { signAccessToken, verifyAccessToken } = require('../../utils/authTokens');
const { isMissingSecretError } = require('../../config/jwtSecret');

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

// Тимчасово прибирає JWT_SECRET (D-SEC-09): запасного секрету немає.
const withoutSecret = (action) => {
  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    return action();
  } finally {
    process.env.JWT_SECRET = saved;
  }
};

describe('verifyAccessToken', () => {
  it('повертає вміст токена, виданого signAccessToken', () => {
    expect(verifyAccessToken(signAccessToken(user))).toMatchObject({ id: 7, role: 'user', plan: 'PLUS', token_version: 3 });
  });

  it('токен, підписаний іншим секретом, відхиляється', () => {
    const forged = jwt.sign({ id: 7 }, 'secret_key');
    expect(() => verifyAccessToken(forged)).toThrow(/invalid signature/);
  });
});

describe('D-SEC-09: без JWT_SECRET запасного секрету немає', () => {
  it('signAccessToken не видає токен', () => {
    withoutSecret(() => {
      let error;
      try {
        signAccessToken(user);
      } catch (e) {
        error = e;
      }
      expect(isMissingSecretError(error)).toBe(true);
    });
  });

  it("verifyAccessToken не приймає токен, підписаний 'secret_key'", () => {
    const forged = jwt.sign({ id: 7 }, 'secret_key');
    withoutSecret(() => {
      let error;
      try {
        verifyAccessToken(forged);
      } catch (e) {
        error = e;
      }
      expect(isMissingSecretError(error)).toBe(true);
    });
  });
});

// backend/tests/unit/jwtSecret.test.js
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getJwtSecret, isMissingSecretError, MISSING_CODE, MISSING_MESSAGE } = require('../../config/jwtSecret');

const saved = process.env.JWT_SECRET;
afterEach(() => {
  process.env.JWT_SECRET = saved;
});

const failure = () => {
  try {
    getJwtSecret();
  } catch (error) {
    return error;
  }
  throw new Error('Очікувалася помилка');
};

describe('getJwtSecret (D-SEC-09)', () => {
  it('повертає значення змінної середовища як є', () => {
    process.env.JWT_SECRET = 'my-secret-value';
    expect(getJwtSecret()).toBe('my-secret-value');
  });

  it.each([[undefined], [''], ['   '], ['\t\n']])('незадане значення %j → помилка без запасного секрету', (value) => {
    if (value === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = value;
    const error = failure();
    expect(error.code).toBe(MISSING_CODE);
    expect(error.message).toBe(MISSING_MESSAGE);
    expect(isMissingSecretError(error)).toBe(true);
  });

  it("запасний секрет 'secret_key' не підставляється", () => {
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
  });
});

describe('isMissingSecretError', () => {
  it.each([[null], [undefined], [new Error('інша помилка')], [{ code: 'ER_DUP_ENTRY' }]])('%j → false', (error) => {
    expect(isMissingSecretError(error)).toBe(false);
  });
});

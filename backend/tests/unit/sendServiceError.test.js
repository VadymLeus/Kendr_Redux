// backend/tests/unit/sendServiceError.test.js
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sendServiceError = require('../../utils/sendServiceError');
const { ServiceError } = require('../../services/ServiceError');

function fakeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('ServiceError', () => {
  it('зберігає код і повідомлення, є нащадком Error', () => {
    const error = new ServiceError(403, 'Немає прав.');
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(403);
    expect(error.message).toBe('Немає прав.');
    expect(error.name).toBe('ServiceError');
  });
});

describe('sendServiceError', () => {
  it('ServiceError → res.status(status).json({ message }), next не викликається', () => {
    const res = fakeRes();
    const next = vi.fn();

    sendServiceError(new ServiceError(404, 'Товар не знайдено.'), res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Товар не знайдено.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('будь-яка інша помилка передається в next без відповіді', () => {
    const res = fakeRes();
    const next = vi.fn();
    const error = new Error('db down');

    sendServiceError(error, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('об\'єкт із полем status, але не ServiceError, не вважається помилкою сервісу', () => {
    const res = fakeRes();
    const next = vi.fn();
    const error = Object.assign(new Error('x'), { status: 418 });

    sendServiceError(error, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});

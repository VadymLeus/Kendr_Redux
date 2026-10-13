// backend/tests/unit/siteAccess.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { requireSiteAccess, hasSiteAccess } = require('../../services/siteAccess');
const SiteRepository = require('../../repositories/SiteRepository');
const { ServiceError } = require('../../services/ServiceError');

let find;

beforeEach(() => {
  find = vi.spyOn(SiteRepository, 'findByIdAndUserId').mockResolvedValue({ id: 3 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requireSiteAccess', () => {
  it('повертає сайт, якщо власник або співавтор', async () => {
    expect(await requireSiteAccess(3, 11, 'нема')).toEqual({ id: 3 });
    expect(find).toHaveBeenCalledWith(3, 11);
  });

  it('403 з переданим повідомленням за замовчуванням', async () => {
    find.mockResolvedValue(null);
    const error = await requireSiteAccess(3, 11, 'нема').catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect([error.status, error.message]).toEqual([403, 'нема']);
  });

  it('код відмови можна змінити', async () => {
    find.mockResolvedValue(null);
    const error = await requireSiteAccess(3, 11, 'нема', 404).catch((e) => e);
    expect(error.status).toBe(404);
  });

  it('помилка репозиторію передається без змін', async () => {
    const boom = new Error('db down');
    find.mockImplementation(async () => { throw boom; });
    await expect(requireSiteAccess(3, 11, 'нема')).rejects.toBe(boom);
  });
});

describe('hasSiteAccess', () => {
  it('true, якщо сайт знайдено', async () => {
    expect(await hasSiteAccess(3, 11)).toBe(true);
    expect(find).toHaveBeenCalledWith(3, 11);
  });

  it('false, якщо ні', async () => {
    find.mockResolvedValue(null);
    expect(await hasSiteAccess(3, 11)).toBe(false);
  });
});

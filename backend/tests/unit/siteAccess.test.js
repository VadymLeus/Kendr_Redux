// backend/tests/unit/siteAccess.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { requireSiteAccess, hasSiteAccess, isAllowed, OWNER, read, write } = require('../../services/siteAccess');
const SiteRepository = require('../../repositories/SiteRepository');
const { ServiceError } = require('../../services/ServiceError');

const collaborator = (role, permissions) => ({ role, permissions });

describe('isAllowed', () => {
  it('власник має доступ до будь-якої вимоги', () => {
    expect(isAllowed(5, null, 5, OWNER)).toBe(true);
    expect(isAllowed(5, null, 5, write('commerce'))).toBe(true);
    expect(isAllowed('5', null, 5, read())).toBe(true);
  });

  it('сторонній користувач не має доступу', () => {
    expect(isAllowed(5, null, 9, read())).toBe(false);
    expect(isAllowed(5, null, 9, write('editor'))).toBe(false);
    expect(isAllowed(5, null, 9, OWNER)).toBe(false);
  });

  it('вимога OWNER закрита для співавторів', () => {
    expect(isAllowed(5, collaborator('editor', ['editor', 'settings']), 9, OWNER)).toBe(false);
  });

  it('редактор з потрібною секцією може читати і писати', () => {
    const editor = collaborator('editor', ['commerce']);
    expect(isAllowed(5, editor, 9, read('commerce'))).toBe(true);
    expect(isAllowed(5, editor, 9, write('commerce'))).toBe(true);
  });

  it('редактор без потрібної секції відхиляється', () => {
    const editor = collaborator('editor', ['editor']);
    expect(isAllowed(5, editor, 9, read('commerce'))).toBe(false);
    expect(isAllowed(5, editor, 9, write('commerce'))).toBe(false);
  });

  it('глядач може лише читати дозволені секції', () => {
    const viewer = collaborator('viewer', ['commerce', 'overview']);
    expect(isAllowed(5, viewer, 9, read('commerce'))).toBe(true);
    expect(isAllowed(5, viewer, 9, read('overview'))).toBe(true);
    expect(isAllowed(5, viewer, 9, write('commerce'))).toBe(false);
    expect(isAllowed(5, viewer, 9, read('editor'))).toBe(false);
  });

  it('вимога без секцій відкрита для співавтора з будь-яким дозволом', () => {
    expect(isAllowed(5, collaborator('viewer', ['theme']), 9, read())).toBe(true);
    expect(isAllowed(5, collaborator('editor', ['theme']), 9, write())).toBe(true);
  });

  it('співавтор без дозволів не має доступу навіть до вимоги без секцій', () => {
    expect(isAllowed(5, collaborator('editor', []), 9, read())).toBe(false);
    expect(isAllowed(5, collaborator('viewer', []), 9, read())).toBe(false);
  });

  it('вимога з кількома секціями виконується, якщо є хоча б одна', () => {
    const editor = collaborator('editor', ['theme']);
    expect(isAllowed(5, editor, 9, write('editor', 'theme'))).toBe(true);
    expect(isAllowed(5, editor, 9, write('editor', 'commerce'))).toBe(false);
  });

  it('дозволи у вигляді JSON-рядка розбираються', () => {
    expect(isAllowed(5, collaborator('editor', '["commerce"]'), 9, write('commerce'))).toBe(true);
    expect(isAllowed(5, collaborator('editor', '["commerce"]'), 9, write('theme'))).toBe(false);
  });

  it('пошкоджені або нетипові дозволи рахуються порожніми', () => {
    expect(isAllowed(5, collaborator('editor', '{oops'), 9, read())).toBe(false);
    expect(isAllowed(5, collaborator('editor', {}), 9, read())).toBe(false);
    expect(isAllowed(5, collaborator('editor', null), 9, read())).toBe(false);
    expect(isAllowed(5, collaborator('editor', '"commerce"'), 9, read('commerce'))).toBe(false);
  });

  it('невідома роль не може писати', () => {
    expect(isAllowed(5, collaborator('guest', ['commerce']), 9, write('commerce'))).toBe(false);
  });
});

describe('requireSiteAccess', () => {
  let find;

  beforeEach(() => {
    find = vi.spyOn(SiteRepository, 'findWithCollaborator').mockResolvedValue({
      id: 3, user_id: 11, collaborator_role: null, collaborator_permissions: null
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('повертає сайт для власника', async () => {
    const site = await requireSiteAccess(3, 11, OWNER, 'нема');
    expect(site.id).toBe(3);
    expect(find).toHaveBeenCalledWith(3, 11);
  });

  it('повертає сайт для співавтора з дозволом', async () => {
    find.mockResolvedValue({ id: 3, user_id: 1, collaborator_role: 'editor', collaborator_permissions: '["commerce"]' });
    const site = await requireSiteAccess(3, 11, write('commerce'), 'нема');
    expect(site.id).toBe(3);
  });

  it('403 з переданим повідомленням для стороннього', async () => {
    find.mockResolvedValue({ id: 3, user_id: 1, collaborator_role: null, collaborator_permissions: null });
    const error = await requireSiteAccess(3, 11, read(), 'нема').catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect([error.status, error.message]).toEqual([403, 'нема']);
  });

  it('403 для співавтора без потрібної секції', async () => {
    find.mockResolvedValue({ id: 3, user_id: 1, collaborator_role: 'editor', collaborator_permissions: '["theme"]' });
    const error = await requireSiteAccess(3, 11, write('commerce'), 'нема').catch((e) => e);
    expect([error.status, error.message]).toEqual([403, 'нема']);
  });

  it('403 для глядача при вимозі запису', async () => {
    find.mockResolvedValue({ id: 3, user_id: 1, collaborator_role: 'viewer', collaborator_permissions: '["commerce"]' });
    const error = await requireSiteAccess(3, 11, write('commerce'), 'нема').catch((e) => e);
    expect(error.status).toBe(403);
  });

  it('403 для співавтора при вимозі власника', async () => {
    find.mockResolvedValue({ id: 3, user_id: 1, collaborator_role: 'editor', collaborator_permissions: '["settings"]' });
    const error = await requireSiteAccess(3, 11, OWNER, 'нема').catch((e) => e);
    expect(error.status).toBe(403);
  });

  it('відсутній сайт дає відмову з тим самим кодом і повідомленням', async () => {
    find.mockResolvedValue(null);
    const error = await requireSiteAccess(3, 11, read(), 'нема').catch((e) => e);
    expect([error.status, error.message]).toEqual([403, 'нема']);
  });

  it('код відмови можна змінити', async () => {
    find.mockResolvedValue(null);
    const error = await requireSiteAccess(3, 11, OWNER, 'нема', 404).catch((e) => e);
    expect(error.status).toBe(404);
  });

  it('помилка репозиторію передається без змін', async () => {
    const boom = new Error('db down');
    find.mockImplementation(async () => { throw boom; });
    await expect(requireSiteAccess(3, 11, read(), 'нема')).rejects.toBe(boom);
  });
});

describe('hasSiteAccess', () => {
  let find;

  beforeEach(() => {
    find = vi.spyOn(SiteRepository, 'findWithCollaborator').mockResolvedValue({
      id: 3, user_id: 11, collaborator_role: null, collaborator_permissions: null
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('true для власника', async () => {
    expect(await hasSiteAccess(3, 11, write('commerce'))).toBe(true);
    expect(find).toHaveBeenCalledWith(3, 11);
  });

  it('true для співавтора з дозволом', async () => {
    find.mockResolvedValue({ id: 3, user_id: 1, collaborator_role: 'editor', collaborator_permissions: ['commerce'] });
    expect(await hasSiteAccess(3, 11, write('commerce'))).toBe(true);
  });

  it('false для співавтора без дозволу', async () => {
    find.mockResolvedValue({ id: 3, user_id: 1, collaborator_role: 'editor', collaborator_permissions: ['theme'] });
    expect(await hasSiteAccess(3, 11, write('commerce'))).toBe(false);
  });

  it('false, якщо сайт не знайдено', async () => {
    find.mockResolvedValue(null);
    expect(await hasSiteAccess(3, 11, read())).toBe(false);
  });
});

// backend/tests/unit/PageService.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PageService = require('../../services/PageService');
const PageRepository = require('../../repositories/PageRepository');
const SiteRepository = require('../../repositories/SiteRepository');
const { read, write } = require('../../services/siteAccess');
const { ServiceError } = require('../../services/ServiceError');

const PAGE = { is_homepage: 0, site_id: 3 };
const OWNER_SITE = { id: 3, user_id: 11, collaborator_role: null, collaborator_permissions: null };
const collaboratorSite = (role, permissions) => ({
  id: 3, user_id: 1, collaborator_role: role, collaborator_permissions: permissions,
});

async function failure(fn) {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    return error;
  }
  throw new Error('Очікувалася ServiceError');
}

let repo;
let site;

beforeEach(() => {
  repo = {
    findSiteInfo: vi.spyOn(PageRepository, 'findSiteInfo').mockResolvedValue(PAGE),
    findById: vi.spyOn(PageRepository, 'findById').mockResolvedValue({ id: 5, block_content: [] }),
    findBySiteId: vi.spyOn(PageRepository, 'findBySiteId').mockResolvedValue([{ id: 5 }]),
    create: vi.spyOn(PageRepository, 'create').mockResolvedValue({ id: 9 }),
    updateContent: vi.spyOn(PageRepository, 'updateContent').mockResolvedValue({}),
    updateSettings: vi.spyOn(PageRepository, 'updateSettings').mockResolvedValue({}),
    delete: vi.spyOn(PageRepository, 'delete').mockResolvedValue({}),
    countBySiteId: vi.spyOn(PageRepository, 'countBySiteId').mockResolvedValue(3),
    setHomepage: vi.spyOn(PageRepository, 'setHomepage').mockResolvedValue(true),
  };
  site = vi.spyOn(SiteRepository, 'findWithCollaborator').mockResolvedValue(OWNER_SITE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getAccessible', () => {
  it('повертає рядок сторінки для власника', async () => {
    expect(await PageService.getAccessible(5, 11, 'нема', write('editor'))).toBe(PAGE);
    expect(repo.findSiteInfo).toHaveBeenCalledWith(5);
    expect(site).toHaveBeenCalledWith(3, 11);
  });

  it('403 із переданим повідомленням, якщо сторінки немає', async () => {
    repo.findSiteInfo.mockResolvedValue(null);
    const error = await failure(() => PageService.getAccessible(5, 11, 'нема', read()));
    expect(error.status).toBe(403);
    expect(error.message).toBe('нема');
    expect(site).not.toHaveBeenCalled();
  });

  it('403 із переданим повідомленням, якщо немає доступу до сайту сторінки', async () => {
    site.mockResolvedValue(collaboratorSite(null, null));
    const error = await failure(() => PageService.getAccessible(5, 11, 'нема', read()));
    expect(error.status).toBe(403);
    expect(error.message).toBe('нема');
  });
});

describe('D-SEC-06: права співавторів на сторінки', () => {
  const EDIT_DENIED = 'У вас немає прав на редагування цієї сторінки.';
  const ACCESS_DENIED = 'Доступ заборонено.';

  const writes = [
    ['updateContent', () => PageService.updateContent(5, 11, []), EDIT_DENIED],
    ['updateSettings', () => PageService.updateSettings(5, 11, { name: 'Нова', slug: 'new' }), ACCESS_DENIED],
    ['remove', () => PageService.remove(5, 11), ACCESS_DENIED],
    ['setHomepage', () => PageService.setHomepage(5, 11), ACCESS_DENIED],
    ['create', () => PageService.create(3, 11, { name: 'Про нас', slug: 'about' }), ACCESS_DENIED],
  ];

  it.each(writes)('%s: редактор з секцією editor дозволений', async (name, call) => {
    site.mockResolvedValue(collaboratorSite('editor', '["editor"]'));
    await call();
  });

  it.each(writes)('%s: редактор без секції editor отримує 403', async (name, call, message) => {
    site.mockResolvedValue(collaboratorSite('editor', '["commerce","theme"]'));
    const error = await failure(call);
    expect(error.status).toBe(403);
    expect(error.message).toBe(message);
  });

  it.each(writes)('%s: глядач з секцією editor отримує 403', async (name, call, message) => {
    site.mockResolvedValue(collaboratorSite('viewer', '["editor"]'));
    const error = await failure(call);
    expect(error.status).toBe(403);
    expect(error.message).toBe(message);
  });

  it('жодна заборонена операція не змінює дані', async () => {
    site.mockResolvedValue(collaboratorSite('viewer', '["editor"]'));
    for (const [, call] of writes) {
      await call().catch(() => {});
    }
    expect(repo.updateContent).not.toHaveBeenCalled();
    expect(repo.updateSettings).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
    expect(repo.setHomepage).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('читання списку сторінок: глядач із будь-яким дозволом допускається', async () => {
    site.mockResolvedValue(collaboratorSite('viewer', '["overview"]'));
    expect(await PageService.listForSite(3, 11)).toEqual([{ id: 5 }]);
  });

  it('читання списку сторінок: співавтор без дозволів отримує 403', async () => {
    site.mockResolvedValue(collaboratorSite('editor', '[]'));
    const error = await failure(() => PageService.listForSite(3, 11));
    expect(error.status).toBe(403);
    expect(error.message).toBe(ACCESS_DENIED);
  });

  it('читання сторінки за id: глядач із будь-яким дозволом допускається', async () => {
    site.mockResolvedValue(collaboratorSite('viewer', '["theme"]'));
    expect(await PageService.getById(5, 11)).toEqual({ id: 5, block_content: [] });
  });

  it('читання сторінки за id: співавтор без дозволів отримує 403', async () => {
    site.mockResolvedValue(collaboratorSite('editor', '[]'));
    const error = await failure(() => PageService.getById(5, 11));
    expect(error.status).toBe(403);
    expect(error.message).toBe(EDIT_DENIED);
  });
});

describe('listForSite', () => {
  it('403 «Доступ заборонено.», якщо немає доступу до сайту', async () => {
    site.mockResolvedValue(null);
    const error = await failure(() => PageService.listForSite(3, 11));
    expect(error.status).toBe(403);
    expect(error.message).toBe('Доступ заборонено.');
    expect(repo.findBySiteId).not.toHaveBeenCalled();
  });

  it('повертає сторінки сайту', async () => {
    expect(await PageService.listForSite(3, 11)).toEqual([{ id: 5 }]);
    expect(site).toHaveBeenCalledWith(3, 11);
    expect(repo.findBySiteId).toHaveBeenCalledWith(3);
  });
});

describe('create', () => {
  it.each([
    [{}], [{ name: 'Про нас' }], [{ slug: 'about' }], [{ name: '', slug: 'about' }],
  ])('тіло %j → 400 до перевірки сайту', async (body) => {
    const error = await failure(() => PageService.create(3, 11, body));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Назва (name) та шлях (slug) є обов\'язковими.');
    expect(site).not.toHaveBeenCalled();
  });

  it('403, якщо немає доступу до сайту', async () => {
    site.mockResolvedValue(null);
    const error = await failure(() => PageService.create(3, 11, { name: 'Про нас', slug: 'about' }));
    expect(error.status).toBe(403);
    expect(error.message).toBe('Доступ заборонено.');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('створює порожню неголовну сторінку', async () => {
    const result = await PageService.create('3', 11, { name: 'Про нас', slug: 'about' });
    expect(result).toEqual({ id: 9 });
    expect(repo.create).toHaveBeenCalledWith({
      site_id: '3', name: 'Про нас', slug: 'about', block_content: [], is_homepage: 0,
    });
  });

  it('дубль slug → 400 з окремим повідомленням', async () => {
    repo.create.mockImplementation(async () => { throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }); });
    const error = await failure(() => PageService.create(3, 11, { name: 'Про нас', slug: 'about' }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Сторінка з таким slug вже існує на цьому сайті.');
  });

  it('інша помилка репозиторію передається без змін', async () => {
    const boom = new Error('db down');
    repo.create.mockImplementation(async () => { throw boom; });
    await expect(PageService.create(3, 11, { name: 'Про нас', slug: 'about' })).rejects.toBe(boom);
  });
});

describe('getById', () => {
  it('403 з текстом про редагування, якщо доступу немає', async () => {
    repo.findSiteInfo.mockResolvedValue(null);
    const error = await failure(() => PageService.getById(5, 11));
    expect(error.status).toBe(403);
    expect(error.message).toBe('У вас немає прав на редагування цієї сторінки.');
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('404, якщо сторінка зникла між перевіркою доступу й читанням', async () => {
    repo.findById.mockResolvedValue(undefined);
    const error = await failure(() => PageService.getById(5, 11));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Сторінку не знайдено.');
  });

  it('повертає сторінку', async () => {
    expect(await PageService.getById(5, 11)).toEqual({ id: 5, block_content: [] });
  });
});

describe('updateContent', () => {
  it('403 з текстом про редагування (доступ перевіряється раніше за вміст)', async () => {
    repo.findSiteInfo.mockResolvedValue(null);
    const error = await failure(() => PageService.updateContent(5, 11, [{ type: 'text' }]));
    expect(error.status).toBe(403);
    expect(error.message).toBe('У вас немає прав на редагування цієї сторінки.');
    expect(repo.updateContent).not.toHaveBeenCalled();
  });

  it('зберігає перевірені блоки без змін', async () => {
    const blocks = [{ block_id: 'b1', type: 'text', data: {} }];
    await PageService.updateContent(5, 11, blocks);
    expect(repo.updateContent).toHaveBeenCalledWith(5, blocks);
  });

  it('порожній масив дозволено: редактор очищає сторінку', async () => {
    await PageService.updateContent(5, 11, []);
    expect(repo.updateContent).toHaveBeenCalledWith(5, []);
  });

  it.each([[undefined], [null], [0], [''], ['не JSON'], [{ foo: 'bar' }]])('D-BLK-05: вміст %j → 400, сторінка не змінюється', async (value) => {
    const error = await failure(() => PageService.updateContent(5, 11, value));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Вміст сторінки (block_content) має бути масивом блоків.');
    expect(repo.updateContent).not.toHaveBeenCalled();
  });

  it.each([
    [[{ type: 'text', data: {} }]],
    [[{ block_id: 'b1', type: 'no-such-block', data: {} }]],
    [[{ block_id: 'b1', type: 'text', data: 'not-an-object' }]],
    [[42]],
  ])('D-BLK-05: некоректний блок %j → 400, сторінка не змінюється', async (blocks) => {
    const error = await failure(() => PageService.updateContent(5, 11, blocks));
    expect(error.status).toBe(400);
    expect(repo.updateContent).not.toHaveBeenCalled();
  });
});

describe('updateSettings', () => {
  const body = { name: 'Нова', slug: 'new', seo_title: 't', seo_description: 'd', seo_keywords: 'k' };

  it.each([[{}], [{ name: 'Нова' }], [{ slug: 'new' }]])('тіло %j → 400 до перевірки доступу', async (input) => {
    const error = await failure(() => PageService.updateSettings(5, 11, input));
    expect(error.status).toBe(400);
    expect(repo.findSiteInfo).not.toHaveBeenCalled();
  });

  it('403 «Доступ заборонено.»', async () => {
    repo.findSiteInfo.mockResolvedValue(null);
    const error = await failure(() => PageService.updateSettings(5, 11, body));
    expect(error.status).toBe(403);
    expect(error.message).toBe('Доступ заборонено.');
    expect(repo.updateSettings).not.toHaveBeenCalled();
  });

  it('передає в репозиторій лише п\'ять полів налаштувань', async () => {
    await PageService.updateSettings(5, 11, { ...body, is_homepage: 1, site_id: 99 });
    expect(repo.updateSettings).toHaveBeenCalledWith(5, body);
  });

  it('дубль slug → 400, інша помилка передається без змін', async () => {
    repo.updateSettings.mockImplementation(async () => { throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }); });
    const error = await failure(() => PageService.updateSettings(5, 11, body));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Сторінка з таким slug вже існує на цьому сайті.');

    const boom = new Error('db down');
    repo.updateSettings.mockImplementation(async () => { throw boom; });
    await expect(PageService.updateSettings(5, 11, body)).rejects.toBe(boom);
  });
});

describe('remove', () => {
  it('403 «Доступ заборонено.»', async () => {
    repo.findSiteInfo.mockResolvedValue(null);
    const error = await failure(() => PageService.remove(5, 11));
    expect(error.status).toBe(403);
    expect(error.message).toBe('Доступ заборонено.');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('головну сторінку видалити не можна, кількість сторінок навіть не читається', async () => {
    repo.findSiteInfo.mockResolvedValue({ ...PAGE, is_homepage: 1 });
    const error = await failure(() => PageService.remove(5, 11));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Неможливо видалити головну сторінку.');
    expect(repo.countBySiteId).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it.each([[0], [1]])('якщо на сайті %i сторінка — 400 «останню сторінку»', async (count) => {
    repo.countBySiteId.mockResolvedValue(count);
    const error = await failure(() => PageService.remove(5, 11));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Неможливо видалити останню сторінку сайту.');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('при двох і більше сторінках видаляє, лічильник береться за site_id зі сторінки', async () => {
    repo.countBySiteId.mockResolvedValue(2);
    await PageService.remove(5, 11);
    expect(repo.countBySiteId).toHaveBeenCalledWith(3);
    expect(repo.delete).toHaveBeenCalledWith(5);
  });
});

describe('setHomepage', () => {
  it('403 «Доступ заборонено.»', async () => {
    repo.findSiteInfo.mockResolvedValue(null);
    const error = await failure(() => PageService.setHomepage(5, 11));
    expect(error.status).toBe(403);
    expect(repo.setHomepage).not.toHaveBeenCalled();
  });

  it('призначає головною сторінку у сайті, до якого вона належить', async () => {
    await PageService.setHomepage(5, 11);
    expect(repo.setHomepage).toHaveBeenCalledWith(3, 5);
  });
});

// backend/tests/unit/SiteService.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SiteService = require('../../services/SiteService');
const SiteRepository = require('../../repositories/SiteRepository');
const PageRepository = require('../../repositories/PageRepository');
const TemplateRepository = require('../../repositories/TemplateRepository');
const UserRepository = require('../../repositories/UserRepository');
const CollaboratorRepository = require('../../repositories/CollaboratorRepository');
const GlobalSettingsRepository = require('../../repositories/GlobalSettingsRepository');
const OrderRepository = require('../../repositories/OrderRepository');
const { ServiceError } = require('../../services/ServiceError');

const CONN = { name: 'connection' };
const NO_ACCESS = 'Сайт не знайдено або у вас немає прав (тільки власник).';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function failure(fn) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error('Очікувалася помилка');
}

async function serviceFailure(fn) {
  const error = await failure(fn);
  expect(error).toBeInstanceOf(ServiceError);
  return error;
}

const makeSite = (overrides = {}) => ({
  id: 7,
  user_id: 1,
  title: 'Сайт',
  status: 'published',
  logo_url: '/logos/logo1.png',
  liqpay_private_key: null,
  header_content: [],
  footer_content: [],
  theme_settings: {},
  dashboard_config: {},
  site_theme_mode: 'light',
  site_theme_accent: 'blue',
  currency: 'UAH',
  ...overrides,
});

const makeTemplate = (content, overrides = {}) => ({
  id: 3,
  type: 'system',
  user_id: null,
  default_block_content: typeof content === 'string' ? content : JSON.stringify(content),
  ...overrides,
});

let repo;
let pages;
let templates;
let users;
let collaborators;
let globalSettings;
let orders;
let log;

beforeEach(() => {
  log = [];
  repo = {
    transaction: vi.spyOn(SiteRepository, 'transaction').mockImplementation(async (work) => work(CONN)),
    existsByPath: vi.spyOn(SiteRepository, 'existsByPath').mockResolvedValue(false),
    findInfoById: vi.spyOn(SiteRepository, 'findInfoById').mockResolvedValue(null),
    findLock: vi.spyOn(SiteRepository, 'findLock').mockResolvedValue({ locked_by_user_id: null, locked_until: null }),
    findOwnerAndStats: vi.spyOn(SiteRepository, 'findOwnerAndStats').mockResolvedValue(null),
    findTags: vi.spyOn(SiteRepository, 'findTags').mockResolvedValue([]),
    applyContent: vi.spyOn(SiteRepository, 'applyContent').mockImplementation(async () => { log.push('apply'); }),
    create: vi.spyOn(SiteRepository, 'create').mockResolvedValue({ id: 50 }),
    rename: vi.spyOn(SiteRepository, 'rename').mockResolvedValue({ affectedRows: 1 }),
    findSuspendedWithAppeals: vi.spyOn(SiteRepository, 'findSuspendedWithAppeals').mockResolvedValue([]),
    findAllAccessible: vi.spyOn(SiteRepository, 'findAllAccessible').mockResolvedValue([]),
    findByPath: vi.spyOn(SiteRepository, 'findByPath').mockResolvedValue(null),
    findByIdAndUserId: vi.spyOn(SiteRepository, 'findByIdAndUserId').mockResolvedValue(makeSite()),
    getPublic: vi.spyOn(SiteRepository, 'getPublic').mockResolvedValue([]),
    updateSettings: vi.spyOn(SiteRepository, 'updateSettings').mockResolvedValue({}),
    updateTags: vi.spyOn(SiteRepository, 'updateTags').mockResolvedValue(undefined),
    togglePin: vi.spyOn(SiteRepository, 'togglePin').mockResolvedValue(true),
    deleteByPathAndUserId: vi.spyOn(SiteRepository, 'deleteByPathAndUserId').mockResolvedValue({ affectedRows: 1 }),
  };
  pages = {
    createFromTemplate: vi.spyOn(PageRepository, 'createFromTemplate').mockImplementation(async (page) => { log.push(`page:${page.slug}`); }),
    deleteBySiteId: vi.spyOn(PageRepository, 'deleteBySiteId').mockImplementation(async () => { log.push('delete'); }),
    findBySiteIdAndSlug: vi.spyOn(PageRepository, 'findBySiteIdAndSlug').mockResolvedValue(undefined),
    findHomepageBySiteId: vi.spyOn(PageRepository, 'findHomepageBySiteId').mockResolvedValue(undefined),
  };
  templates = {
    findPublicSystem: vi.spyOn(TemplateRepository, 'findPublicSystem').mockResolvedValue([]),
    findById: vi.spyOn(TemplateRepository, 'findById').mockResolvedValue(undefined),
  };
  users = {
    findRole: vi.spyOn(UserRepository, 'findRole').mockResolvedValue('user'),
    findIdByUsername: vi.spyOn(UserRepository, 'findIdByUsername').mockResolvedValue(null),
    findAuthor: vi.spyOn(UserRepository, 'findAuthor').mockResolvedValue(null),
  };
  collaborators = {
    findBySiteAndUser: vi.spyOn(CollaboratorRepository, 'findBySiteAndUser').mockResolvedValue(null),
  };
  globalSettings = {
    findSiteCreation: vi.spyOn(GlobalSettingsRepository, 'findSiteCreation').mockResolvedValue({ site_creation_enabled: 1 }),
  };
  orders = {
    findStatsBySite: vi.spyOn(OrderRepository, 'findStatsBySite').mockResolvedValue({ totalOrders: 0, completedOrders: 0, revenue: null }),
    findRecentBySite: vi.spyOn(OrderRepository, 'findRecentBySite').mockResolvedValue([]),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getDefaultLogos', () => {
  it('віддає три стандартні логотипи', () => {
    expect(SiteService.getDefaultLogos()).toEqual(['/logos/logo1.png', '/logos/logo2.png', '/logos/logo3.png']);
  });

  it('повертає копію, зміна якої не впливає на наступні виклики', () => {
    SiteService.getDefaultLogos().push('/x.png');
    expect(SiteService.getDefaultLogos()).toHaveLength(3);
  });
});

describe('isStaff', () => {
  it.each([['admin', true], ['moderator', true], ['user', false], [null, false]])('роль %s → %s', async (role, expected) => {
    users.findRole.mockResolvedValue(role);
    expect(await SiteService.isStaff(5)).toBe(expected);
    expect(users.findRole).toHaveBeenCalledWith(5);
  });
});

describe('getInfoById', () => {
  it('404, якщо сайту немає', async () => {
    const error = await serviceFailure(() => SiteService.getInfoById(9));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Сайт не знайдено');
    expect(repo.findInfoById).toHaveBeenCalledWith(9);
  });

  it('повертає лише публічні поля разом з даними автора (KNOWN-DEFECT D-SEC-05: email віддається без автентифікації)', async () => {
    repo.findInfoById.mockResolvedValue({
      site_path: 'shop', title: 'Магазин', is_online_payment_enabled: 1, is_cod_enabled: 0,
      author: 'ann', author_email: 'ann@test.local', author_avatar: '/a.png', secret: 'не віддається',
    });
    const info = await SiteService.getInfoById(9);
    expect(info).toEqual({
      site_path: 'shop', title: 'Магазин', is_online_payment_enabled: 1, is_cod_enabled: 0,
      author: 'ann', author_email: 'ann@test.local', author_avatar: '/a.png',
    });
    expect(Object.keys(info)).toHaveLength(7);
  });
});

describe('listTemplates', () => {
  it('рядковий вміст шаблону розбирається, об\'єкт лишається', async () => {
    templates.findPublicSystem.mockResolvedValue([
      { id: 1, default_block_content: '{"pages":[]}' },
      { id: 2, default_block_content: { pages: [1] } },
    ]);
    const result = await SiteService.listTemplates(false);
    expect(result).toEqual([
      { id: 1, default_block_content: { pages: [] } },
      { id: 2, default_block_content: { pages: [1] } },
    ]);
  });

  it.each([true, false])('прапорець чернеток %s передається в репозиторій', async (flag) => {
    await SiteService.listTemplates(flag);
    expect(templates.findPublicSystem).toHaveBeenCalledWith(flag);
  });

  it('некоректний JSON передається нагору як SyntaxError', async () => {
    templates.findPublicSystem.mockResolvedValue([{ id: 1, default_block_content: '{oops' }]);
    const error = await failure(() => SiteService.listTemplates(false));
    expect(error).toBeInstanceOf(SyntaxError);
  });
});

describe('isSiteCreationEnabled', () => {
  it('1 → дозволено', async () => {
    expect(await SiteService.isSiteCreationEnabled()).toBe(true);
  });

  it('0 → заборонено', async () => {
    globalSettings.findSiteCreation.mockResolvedValue({ site_creation_enabled: 0 });
    expect(await SiteService.isSiteCreationEnabled()).toBe(false);
  });

  it('немає рядка налаштувань → дозволено', async () => {
    globalSettings.findSiteCreation.mockResolvedValue(null);
    expect(await SiteService.isSiteCreationEnabled()).toBe(true);
  });

  it('помилка читання налаштувань → дозволено, у журнал іде попередження', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalSettings.findSiteCreation.mockImplementation(async () => { throw new Error('no table'); });
    expect(await SiteService.isSiteCreationEnabled()).toBe(true);
    expect(warn).toHaveBeenCalledWith('Таблиця global_settings не знайдена або порожня.');
  });
});

describe('createSite: відмови до транзакції', () => {
  it('створення вимкнене адміністратором → 403, транзакція не відкривається', async () => {
    globalSettings.findSiteCreation.mockResolvedValue({ site_creation_enabled: 0 });
    const error = await serviceFailure(() => SiteService.createSite(1, { title: 'Сайт', sitePath: 'my-shop', isBlank: true }));
    expect(error.status).toBe(403);
    expect(error.message).toBe('Створення нових сайтів тимічасово призупинено адміністрацією.');
    expect(repo.transaction).not.toHaveBeenCalled();
  });

  it('некоректна назва → 400 із текстом перевірки', async () => {
    const error = await serviceFailure(() => SiteService.createSite(1, { title: 'a', sitePath: 'my-shop', isBlank: true }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Назва сайту має бути від 2 до 60 символів');
    expect(repo.transaction).not.toHaveBeenCalled();
  });

  it('некоректна адреса → 400', async () => {
    const error = await serviceFailure(() => SiteService.createSite(1, { title: 'Сайт', sitePath: 'admin', isBlank: true }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Цей URL зарезервовано системою');
  });
});

describe('createSite: перевірки всередині транзакції', () => {
  it('KNOWN-DEFECT D-ARC-10: без templateId і isBlank — 500 «ID шаблону не було надано.»', async () => {
    const error = await serviceFailure(() => SiteService.createSite(1, { title: 'Сайт', sitePath: 'my-shop' }));
    expect(error.status).toBe(500);
    expect(error.message).toBe('ID шаблону не було надано.');
    expect(repo.existsByPath).not.toHaveBeenCalled();
  });

  it('адреса зайнята → 400, шаблон не завантажується', async () => {
    repo.existsByPath.mockResolvedValue(true);
    const error = await serviceFailure(() => SiteService.createSite(1, { title: 'Сайт', sitePath: 'my-shop', templateId: 3 }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Ця адреса сайту вже зайнята.');
    expect(templates.findById).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('шаблон не знайдено → 400', async () => {
    const error = await serviceFailure(() => SiteService.createSite(1, { title: 'Сайт', sitePath: 'my-shop', templateId: 3 }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Шаблон не знайдено.');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('чужий особистий шаблон → 400', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [] }, { type: 'personal', user_id: 2 }));
    const error = await serviceFailure(() => SiteService.createSite(1, { title: 'Сайт', sitePath: 'my-shop', templateId: 3 }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('У вас немає доступу до цього приватного шаблону.');
  });

  it('власний особистий шаблон дозволений', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [] }, { type: 'personal', user_id: 1 }));
    const result = await SiteService.createSite(1, { title: 'Сайт', sitePath: 'my-shop', templateId: 3 });
    expect(result).toEqual({ id: 50, site_path: 'my-shop' });
  });

  it('KNOWN-DEFECT D-SEC-17: системний шаблон береться без перевірки is_ready та access_level', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [] }, { is_ready: 0, access_level: 'admin_only' }));
    const result = await SiteService.createSite(1, { title: 'Сайт', sitePath: 'my-shop', templateId: 3 });
    expect(result.id).toBe(50);
  });

  it('KNOWN-DEFECT D-BIZ-03: кількість сайтів користувача не перевіряється', async () => {
    await SiteService.createSite(1, { title: 'Сайт', sitePath: 'my-shop', isBlank: true });
    expect(repo.findAllAccessible).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalled();
  });

  it('помилка репозиторію всередині транзакції передається нагору без змін', async () => {
    const dbError = new Error('deadlock');
    repo.create.mockImplementation(async () => { throw dbError; });
    const error = await failure(() => SiteService.createSite(1, { title: 'Сайт', sitePath: 'my-shop', isBlank: true }));
    expect(error).toBe(dbError);
    expect(pages.createFromTemplate).not.toHaveBeenCalled();
  });
});

describe('createSite: порожній сайт', () => {
  const body = { title: 'Сайт', sitePath: 'my-shop', isBlank: true };

  it('створює сайт зі стандартною шапкою, темою за замовчуванням і однією порожньою сторінкою home', async () => {
    const result = await SiteService.createSite(1, body);

    expect(result).toEqual({ id: 50, site_path: 'my-shop' });
    expect(templates.findById).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(1, 'my-shop', 'Сайт', '/logos/logo1.png', CONN);
    const [siteId, content, connection] = repo.applyContent.mock.calls[0];
    expect(siteId).toBe(50);
    expect(connection).toBe(CONN);
    expect(content.footer).toEqual([]);
    expect(content.themeSettings).toEqual({});
    expect(content.mode).toBe('light');
    expect(content.accent).toBe('blue');
    expect(content.header).toHaveLength(1);
    expect(content.header[0].type).toBe('header');
    expect(content.header[0].block_id).toMatch(UUID);
    expect(content.header[0].data).toMatchObject({
      site_title: 'Сайт', logo_src: '/logos/logo1.png', show_title: true,
      show_profile_icon: true, show_cart_icon: true, block_theme: 'auto',
    });
    expect(content.header[0].data.nav_items).toHaveLength(1);
    expect(content.header[0].data.nav_items[0]).toMatchObject({ label: 'Головна', link: '/' });
    expect(pages.createFromTemplate).toHaveBeenCalledTimes(1);
    expect(pages.createFromTemplate).toHaveBeenCalledWith({
      site_id: 50, name: 'Головна', slug: 'home', block_content: [], is_homepage: 1, seo_title: null, seo_description: null,
    }, CONN);
  });

  it('адреса й назва обрізаються, адреса переводиться в нижній регістр', async () => {
    await SiteService.createSite(1, { title: '  Сайт  ', sitePath: '  My-Shop  ', isBlank: true });
    expect(repo.existsByPath).toHaveBeenCalledWith('my-shop', CONN);
    expect(repo.create).toHaveBeenCalledWith(1, 'my-shop', 'Сайт', '/logos/logo1.png', CONN);
  });

  it('обраний логотип зберігається, префікс локального сервера відрізається', async () => {
    await SiteService.createSite(1, { ...body, selected_logo_url: 'http://localhost:5000/uploads/logo.png' });
    expect(repo.create).toHaveBeenCalledWith(1, 'my-shop', 'Сайт', '/uploads/logo.png', CONN);
    expect(repo.applyContent.mock.calls[0][1].header[0].data.logo_src).toBe('/uploads/logo.png');
  });

  it('логотип без префікса зберігається як є', async () => {
    await SiteService.createSite(1, { ...body, selected_logo_url: '/logos/logo2.png' });
    expect(repo.create.mock.calls[0][3]).toBe('/logos/logo2.png');
  });
});

describe('createSite: із шаблону', () => {
  const content = {
    pages: [
      { title: 'Головна', slug: 'home', blocks: [{ block_id: 'b1', type: 'text' }], seo_title: 'T', seo_description: 'D' },
      { title: 'Про нас', slug: 'about', blocks: [] },
    ],
    header_content: [
      { block_id: 'h', type: 'header', data: { site_title: 'Шаблон', logo_src: '/old.png', nav_items: [] } },
      { block_id: 'x', type: 'text', data: { text: 'поряд із шапкою' } },
    ],
    footer_content: [{ block_id: 'f', type: 'footer' }],
    theme_settings: { mode: 'dark' },
    site_theme_accent: 'green',
  };
  const body = { title: ' Мій сайт ', sitePath: 'my-shop', templateId: 3 };

  beforeEach(() => {
    templates.findById.mockResolvedValue(makeTemplate(content));
  });

  it('завантажує шаблон у транзакції', async () => {
    await SiteService.createSite(1, body);
    expect(templates.findById).toHaveBeenCalledWith(3, CONN);
  });

  it('блок шапки отримує назву й логотип нового сайту, інші блоки не змінюються', async () => {
    await SiteService.createSite(1, { ...body, selected_logo_url: '/logos/logo3.png' });
    const { header } = repo.applyContent.mock.calls[0][1];
    expect(header).toHaveLength(2);
    expect(header[0].data).toMatchObject({ site_title: 'Мій сайт', logo_src: '/logos/logo3.png', show_title: true });
    expect(header[0].block_id).not.toBe('h');
    expect(header[1].type).toBe('text');
    expect(header[1].data).toEqual({ text: 'поряд із шапкою' });
  });

  it('тема, підвал і акцент беруться з шаблону, ідентифікатори блоків підвалу оновлюються', async () => {
    await SiteService.createSite(1, body);
    const applied = repo.applyContent.mock.calls[0][1];
    expect(applied.themeSettings).toEqual({ mode: 'dark' });
    expect(applied.mode).toBe('dark');
    expect(applied.accent).toBe('green');
    expect(applied.footer[0].type).toBe('footer');
    expect(applied.footer[0].block_id).not.toBe('f');
  });

  it('усі сторінки шаблону створюються з новими ідентифікаторами блоків; home стає головною', async () => {
    await SiteService.createSite(1, body);
    expect(pages.createFromTemplate).toHaveBeenCalledTimes(2);
    const [home, homeConn] = pages.createFromTemplate.mock.calls[0];
    const [about, aboutConn] = pages.createFromTemplate.mock.calls[1];
    expect(homeConn).toBe(CONN);
    expect(aboutConn).toBe(CONN);
    expect(home).toMatchObject({ site_id: 50, name: 'Головна', slug: 'home', is_homepage: 1, seo_title: 'T', seo_description: 'D' });
    expect(home.block_content).toHaveLength(1);
    expect(home.block_content[0].block_id).not.toBe('b1');
    expect(about).toMatchObject({ name: 'Про нас', slug: 'about', is_homepage: 0, seo_title: null, seo_description: null, block_content: [] });
  });

  it('сторінка з is_homepage і довільним slug теж стає головною', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [{ title: 'Старт', slug: 'start', is_homepage: 1, blocks: [] }] }));
    await SiteService.createSite(1, body);
    expect(pages.createFromTemplate.mock.calls[0][0]).toMatchObject({ slug: 'start', is_homepage: 1 });
  });

  it('сторінка без slug отримує page-<мітка часу>, без назви — «Нова сторінка»', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    templates.findById.mockResolvedValue(makeTemplate({ pages: [{ blocks: [] }] }));
    await SiteService.createSite(1, body);
    expect(pages.createFromTemplate.mock.calls[0][0]).toMatchObject({ name: 'Нова сторінка', slug: 'page-1700000000000', is_homepage: 0 });
  });

  it('шаблон без шапки отримує стандартну шапку', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [] }));
    await SiteService.createSite(1, body);
    const { header } = repo.applyContent.mock.calls[0][1];
    expect(header).toHaveLength(1);
    expect(header[0].data).toMatchObject({ site_title: 'Мій сайт', show_profile_icon: true, show_cart_icon: true });
    expect(header[0].data.nav_items[0]).toMatchObject({ label: 'Головна', link: '/' });
  });

  it('шаблон без сторінок дає одну порожню сторінку home', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ header_content: [] }));
    await SiteService.createSite(1, body);
    expect(pages.createFromTemplate).toHaveBeenCalledTimes(1);
    expect(pages.createFromTemplate.mock.calls[0][0]).toEqual({
      site_id: 50, name: 'Головна', slug: 'home', block_content: [], is_homepage: 1, seo_title: null, seo_description: null,
    });
  });

  it('шаблон без акценту й режиму дає blue / light', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [] }));
    await SiteService.createSite(1, body);
    const applied = repo.applyContent.mock.calls[0][1];
    expect(applied.accent).toBe('blue');
    expect(applied.mode).toBe('light');
  });

  it('шаблон у вигляді масиву блоків стає сторінкою home', async () => {
    templates.findById.mockResolvedValue(makeTemplate([{ block_id: 'z', type: 'text' }]));
    await SiteService.createSite(1, body);
    expect(pages.createFromTemplate.mock.calls[0][0]).toMatchObject({ slug: 'home', is_homepage: 1 });
    expect(pages.createFromTemplate.mock.calls[0][0].block_content).toHaveLength(1);
  });

  it('усі записи йдуть в одному з\'єднанні й у правильному порядку', async () => {
    await SiteService.createSite(1, body);
    expect(repo.transaction).toHaveBeenCalledTimes(1);
    expect(repo.existsByPath.mock.calls[0][1]).toBe(CONN);
    expect(repo.create.mock.calls[0][4]).toBe(CONN);
    expect(repo.applyContent.mock.calls[0][2]).toBe(CONN);
    expect(log).toEqual(['apply', 'page:home', 'page:about']);
  });

  it('некоректний JSON шаблону передається як SyntaxError, сайт не створюється', async () => {
    templates.findById.mockResolvedValue(makeTemplate('{oops'));
    const error = await failure(() => SiteService.createSite(1, body));
    expect(error).toBeInstanceOf(SyntaxError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('listCatalog', () => {
  const lastQuery = () => repo.getPublic.mock.calls[0][0];

  it('анонімний запит: лише опубліковані сайти, без перевірки ролі', async () => {
    await SiteService.listCatalog({}, undefined);
    expect(users.findRole).not.toHaveBeenCalled();
    expect(lastQuery()).toMatchObject({ userId: null, onlyFavorites: false, currentUserId: null, includeAllStatuses: false });
  });

  it('результат репозиторію повертається без змін', async () => {
    const sites = [{ id: 1 }];
    repo.getPublic.mockResolvedValue(sites);
    expect(await SiteService.listCatalog({}, undefined)).toBe(sites);
  });

  it('параметри пошуку передаються в репозиторій', async () => {
    await SiteService.listCatalog({ search: 'кава', tag: '2', sort: 'popular', onlyFavorites: 'true' }, { id: 1 });
    expect(lastQuery()).toMatchObject({ searchTerm: 'кава', tag: '2', sort: 'popular', onlyFavorites: true, currentUserId: 1 });
  });

  it.each(['false', undefined, '1', true])('onlyFavorites=%j вважається вимкненим', async (value) => {
    await SiteService.listCatalog({ onlyFavorites: value }, { id: 1 });
    expect(lastQuery().onlyFavorites).toBe(false);
  });

  it('scope=my з користувачем: власні сайти в усіх статусах', async () => {
    await SiteService.listCatalog({ scope: 'my', userId: '99' }, { id: 4 });
    expect(lastQuery()).toMatchObject({ userId: 4, includeAllStatuses: true });
  });

  it('scope=my без користувача діє як звичайний запит із userId', async () => {
    await SiteService.listCatalog({ scope: 'my', userId: '99' }, undefined);
    expect(lastQuery()).toMatchObject({ userId: '99', includeAllStatuses: false });
  });

  it('userId з запиту: звичайний користувач бачить лише опубліковані', async () => {
    await SiteService.listCatalog({ userId: '99' }, { id: 4 });
    expect(lastQuery()).toMatchObject({ userId: '99', includeAllStatuses: false });
  });

  it.each(['admin', 'moderator'])('%s з userId бачить сайти в усіх статусах', async (role) => {
    users.findRole.mockResolvedValue(role);
    await SiteService.listCatalog({ userId: '99' }, { id: 4 });
    expect(lastQuery()).toMatchObject({ userId: '99', includeAllStatuses: true });
  });

  it('staff без userId/username не отримує розширеного доступу', async () => {
    users.findRole.mockResolvedValue('admin');
    await SiteService.listCatalog({}, { id: 4 });
    expect(lastQuery()).toMatchObject({ userId: null, includeAllStatuses: false });
  });

  it('username знаходиться в базі', async () => {
    users.findIdByUsername.mockResolvedValue(12);
    await SiteService.listCatalog({ username: 'ann' }, undefined);
    expect(users.findIdByUsername).toHaveBeenCalledWith('ann');
    expect(lastQuery()).toMatchObject({ userId: 12 });
  });

  it('невідомий username не звужує вибірку', async () => {
    await SiteService.listCatalog({ username: 'ghost' }, undefined);
    expect(lastQuery()).toMatchObject({ userId: null });
  });

  it('userId має пріоритет над username', async () => {
    await SiteService.listCatalog({ userId: '5', username: 'ann' }, undefined);
    expect(users.findIdByUsername).not.toHaveBeenCalled();
    expect(lastQuery().userId).toBe('5');
  });
});

describe('getByPath', () => {
  const page = { id: 21, block_content: [{ type: 'text' }] };
  const owner = { id: 1 };
  const visitor = { id: 2 };

  beforeEach(() => {
    repo.findByPath.mockResolvedValue(makeSite({ liqpay_private_key: 'enc' }));
    pages.findHomepageBySiteId.mockResolvedValue(page);
    users.findAuthor.mockResolvedValue({ username: 'ann', email: 'ann@test.local', avatar_url: '/a.png' });
  });

  it('сайту немає → null', async () => {
    repo.findByPath.mockResolvedValue(null);
    expect(await SiteService.getByPath('ghost', undefined, undefined)).toBeNull();
    expect(users.findAuthor).not.toHaveBeenCalled();
  });

  it('повертає сайт зі сторінкою, тегами й даними автора', async () => {
    repo.findTags.mockResolvedValue([{ id: 1, name: 'їжа' }]);
    const result = await SiteService.getByPath('shop', undefined, undefined);
    expect(result).toMatchObject({
      id: 7, author: 'ann', author_email: 'ann@test.local', author_avatar: '/a.png',
      is_collaborator: false, my_permissions: [], page_content: page.block_content, page_id: 21, tags: [{ id: 1, name: 'їжа' }],
    });
    expect(result.page).toBe(page);
    expect(pages.findHomepageBySiteId).toHaveBeenCalledWith(7);
    expect(repo.findTags).toHaveBeenCalledWith(7);
  });

  it('KNOWN-DEFECT D-SEC-05: email автора віддається анонімному відвідувачу', async () => {
    const result = await SiteService.getByPath('shop', undefined, undefined);
    expect(result.author_email).toBe('ann@test.local');
  });

  it('якщо автора не знайдено, поля автора не додаються', async () => {
    users.findAuthor.mockResolvedValue(null);
    const result = await SiteService.getByPath('shop', undefined, undefined);
    expect(result.author).toBeUndefined();
  });

  it('із slug шукається конкретна сторінка', async () => {
    pages.findBySiteIdAndSlug.mockResolvedValue({ id: 22, block_content: [] });
    const result = await SiteService.getByPath('shop', 'about', undefined);
    expect(pages.findBySiteIdAndSlug).toHaveBeenCalledWith(7, 'about');
    expect(pages.findHomepageBySiteId).not.toHaveBeenCalled();
    expect(result.page_id).toBe(22);
  });

  it('сторінки немає → null', async () => {
    pages.findHomepageBySiteId.mockResolvedValue(undefined);
    expect(await SiteService.getByPath('shop', undefined, undefined)).toBeNull();
    pages.findBySiteIdAndSlug.mockResolvedValue(undefined);
    expect(await SiteService.getByPath('shop', 'ghost', undefined)).toBeNull();
  });

  it.each([['enc', '********'], ['', ''], [null, '']])('приватний ключ %j у відповіді → %j', async (stored, shown) => {
    repo.findByPath.mockResolvedValue(makeSite({ liqpay_private_key: stored }));
    const result = await SiteService.getByPath('shop', undefined, undefined);
    expect(result.liqpay_private_key).toBe(shown);
  });

  it('співавтор: права читаються з рядка JSON', async () => {
    collaborators.findBySiteAndUser.mockResolvedValue({ role: 'editor', permissions: '["pages","orders"]' });
    const result = await SiteService.getByPath('shop', undefined, visitor);
    expect(collaborators.findBySiteAndUser).toHaveBeenCalledWith(7, 2);
    expect(result.is_collaborator).toBe(true);
    expect(result.my_permissions).toEqual(['pages', 'orders']);
  });

  it('співавтор: права-масив повертаються як є, порожні — порожнім масивом', async () => {
    collaborators.findBySiteAndUser.mockResolvedValue({ role: 'viewer', permissions: ['pages'] });
    expect((await SiteService.getByPath('shop', undefined, visitor)).my_permissions).toEqual(['pages']);
    collaborators.findBySiteAndUser.mockResolvedValue({ role: 'viewer', permissions: null });
    const result = await SiteService.getByPath('shop', undefined, visitor);
    expect(result.is_collaborator).toBe(true);
    expect(result.my_permissions).toEqual([]);
  });

  describe('статус suspended', () => {
    beforeEach(() => {
      repo.findByPath.mockResolvedValue(makeSite({ status: 'suspended' }));
    });

    it.each([['анонім', undefined], ['власник', owner], ['відвідувач', visitor]])('%s → 403 з isSuspended', async (_, user) => {
      const error = await serviceFailure(() => SiteService.getByPath('shop', undefined, user));
      expect(error.status).toBe(403);
      expect(error.message).toBe('Цей сайт заблоковано за порушення правил платформи.');
      expect(error.extra).toEqual({ isSuspended: true });
    });

    it('співробітник платформи бачить сайт', async () => {
      users.findRole.mockResolvedValue('moderator');
      const result = await SiteService.getByPath('shop', undefined, visitor);
      expect(result.page_id).toBe(21);
    });
  });

  describe('статус probation', () => {
    beforeEach(() => {
      repo.findByPath.mockResolvedValue(makeSite({ status: 'probation' }));
    });

    it.each([['анонім', undefined], ['відвідувач', visitor]])('%s → 403 «на модерації»', async (_, user) => {
      const error = await serviceFailure(() => SiteService.getByPath('shop', undefined, user));
      expect(error.status).toBe(403);
      expect(error.message).toBe('Сайт знаходиться на модерації.');
      expect(error.extra).toBeUndefined();
    });

    it('власник бачить сайт', async () => {
      expect((await SiteService.getByPath('shop', undefined, owner)).page_id).toBe(21);
    });

    it('співавтор бачить сайт', async () => {
      collaborators.findBySiteAndUser.mockResolvedValue({ role: 'viewer', permissions: [] });
      expect((await SiteService.getByPath('shop', undefined, visitor)).page_id).toBe(21);
    });

    it('співробітник платформи бачить сайт', async () => {
      users.findRole.mockResolvedValue('admin');
      expect((await SiteService.getByPath('shop', undefined, visitor)).page_id).toBe(21);
    });
  });

  describe('статус private', () => {
    beforeEach(() => {
      repo.findByPath.mockResolvedValue(makeSite({ status: 'private' }));
    });

    it.each([['анонім', undefined], ['відвідувач', visitor]])('%s → null', async (_, user) => {
      expect(await SiteService.getByPath('shop', undefined, user)).toBeNull();
    });

    it('власник бачить сайт', async () => {
      expect((await SiteService.getByPath('shop', undefined, owner)).page_id).toBe(21);
    });

    it('співавтор бачить сайт', async () => {
      collaborators.findBySiteAndUser.mockResolvedValue({ role: 'viewer', permissions: '[]' });
      expect((await SiteService.getByPath('shop', undefined, visitor)).page_id).toBe(21);
    });
  });

  it.each(['published', 'public', 'maintenance'])('сайт у статусі %s доступний анонімно', async (status) => {
    repo.findByPath.mockResolvedValue(makeSite({ status }));
    expect((await SiteService.getByPath('shop', undefined, undefined)).page_id).toBe(21);
  });
});

describe('updateSettings', () => {
  const site = () => makeSite({ header_content: [{ block_id: 'h', type: 'header', data: {} }] });

  beforeEach(() => {
    repo.findByPath.mockResolvedValue(site());
  });

  it('сайту немає → 404', async () => {
    repo.findByPath.mockResolvedValue(null);
    const error = await serviceFailure(() => SiteService.updateSettings('ghost', 1, {}));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Сайт не знайдено.');
  });

  it('стороння людина → 403', async () => {
    const error = await serviceFailure(() => SiteService.updateSettings('shop', 2, {}));
    expect(error.status).toBe(403);
    expect(error.message).toBe('У вас немає прав редагувати цей сайт.');
    expect(repo.updateSettings).not.toHaveBeenCalled();
  });

  it('співавтор viewer → 403', async () => {
    collaborators.findBySiteAndUser.mockResolvedValue({ role: 'viewer', permissions: [] });
    const error = await serviceFailure(() => SiteService.updateSettings('shop', 2, {}));
    expect(error.status).toBe(403);
  });

  it('KNOWN-DEFECT D-SEC-06: співавтор editor без жодного права змінює налаштування сайту', async () => {
    collaborators.findBySiteAndUser.mockResolvedValue({ role: 'editor', permissions: [] });
    await SiteService.updateSettings('shop', 2, { title: 'Нова' });
    expect(repo.updateSettings).toHaveBeenCalledWith(7, expect.objectContaining({ title: 'Нова' }));
  });

  it('власник зберігає налаштування й отримує оновлені поля', async () => {
    const result = await SiteService.updateSettings('shop', 1, { title: '  Нова  ', status: 'private', currency: 'USD' });
    expect(repo.findByPath).toHaveBeenCalledWith('shop');
    expect(repo.updateSettings).toHaveBeenCalledWith(7, expect.objectContaining({ title: 'Нова', status: 'private', currency: 'USD' }));
    expect(result.title).toBe('Нова');
    expect(result.status).toBe('private');
    expect(result.currency).toBe('USD');
    expect(result.logo_url).toBe('/logos/logo1.png');
    expect(result.header_content[0].data.site_title).toBe('Нова');
    expect(Object.keys(result).sort()).toEqual(['currency', 'header_content', 'logo_url', 'status', 'title']);
  });

  it('теги оновлюються, лише якщо передано масив', async () => {
    await SiteService.updateSettings('shop', 1, { tags: [1, 2] });
    expect(repo.updateTags).toHaveBeenCalledWith(7, [1, 2]);
    repo.updateTags.mockClear();
    await SiteService.updateSettings('shop', 1, { tags: '1,2' });
    await SiteService.updateSettings('shop', 1, {});
    expect(repo.updateTags).not.toHaveBeenCalled();
  });

  it('порожній масив тегів очищає теги', async () => {
    await SiteService.updateSettings('shop', 1, { tags: [] });
    expect(repo.updateTags).toHaveBeenCalledWith(7, []);
  });

  it('блокування іншим користувачем → 423, нічого не зберігається', async () => {
    repo.findLock.mockResolvedValue({ locked_by_user_id: 2, locked_until: new Date(Date.now() + 5 * 60 * 1000) });
    const error = await serviceFailure(() => SiteService.updateSettings('shop', 1, {}));
    expect(error.status).toBe(423);
    expect(error.message).toBe('Сайт зараз редагується іншим користувачем. Зміни не збережено для уникнення конфліктів.');
    expect(repo.findLock).toHaveBeenCalledWith(7);
    expect(repo.updateSettings).not.toHaveBeenCalled();
  });

  it('блокування, що закінчилось, не заважає', async () => {
    repo.findLock.mockResolvedValue({ locked_by_user_id: 2, locked_until: new Date(Date.now() - 60 * 1000) });
    await SiteService.updateSettings('shop', 1, {});
    expect(repo.updateSettings).toHaveBeenCalled();
  });

  it('власне блокування не заважає', async () => {
    repo.findLock.mockResolvedValue({ locked_by_user_id: 1, locked_until: new Date(Date.now() + 5 * 60 * 1000) });
    await SiteService.updateSettings('shop', 1, {});
    expect(repo.updateSettings).toHaveBeenCalled();
  });

  it('блокування перевіряється раніше за зміну статусу', async () => {
    repo.findByPath.mockResolvedValue(makeSite({ status: 'suspended' }));
    repo.findLock.mockResolvedValue({ locked_by_user_id: 2, locked_until: new Date(Date.now() + 5 * 60 * 1000) });
    const error = await serviceFailure(() => SiteService.updateSettings('shop', 1, { status: 'published' }));
    expect(error.status).toBe(423);
  });

  it.each(['suspended', 'probation'])('зміна статусу сайту %s → 403', async (status) => {
    repo.findByPath.mockResolvedValue(makeSite({ status }));
    const error = await serviceFailure(() => SiteService.updateSettings('shop', 1, { status: 'published' }));
    expect(error.status).toBe(403);
    expect(error.message).toBe('Ви не можете змінювати статус сайту, поки він заблокований або на модерації.');
    expect(repo.updateSettings).not.toHaveBeenCalled();
  });

  it('заблокований сайт зберігає решту налаштувань і свій статус', async () => {
    repo.findByPath.mockResolvedValue(makeSite({ status: 'suspended' }));
    const result = await SiteService.updateSettings('shop', 1, { currency: 'EUR' });
    expect(result.status).toBe('suspended');
    expect(result.currency).toBe('EUR');
  });

  it('помилка перевірки назви (400) зупиняє збереження', async () => {
    const error = await serviceFailure(() => SiteService.updateSettings('shop', 1, { title: 'a' }));
    expect(error.status).toBe(400);
    expect(repo.updateSettings).not.toHaveBeenCalled();
    expect(repo.updateTags).not.toHaveBeenCalled();
  });
});

describe('renameSite', () => {
  beforeEach(() => {
    repo.findByPath.mockResolvedValue(makeSite());
  });

  it('некоректна адреса → 400', async () => {
    const error = await serviceFailure(() => SiteService.renameSite('shop', 'admin', 1));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Цей URL зарезервовано системою');
    expect(repo.existsByPath).not.toHaveBeenCalled();
  });

  it('відсутня нова адреса → 400', async () => {
    const error = await serviceFailure(() => SiteService.renameSite('shop', undefined, 1));
    expect(error.status).toBe(400);
    expect(error.message).toBe('URL сайту обов\'язковий');
  });

  it('нова адреса зайнята → 409', async () => {
    repo.existsByPath.mockResolvedValue(true);
    const error = await serviceFailure(() => SiteService.renameSite('shop', 'new-shop', 1));
    expect(error.status).toBe(409);
    expect(error.message).toBe('Ця адреса вже зайнята. Спробуйте іншу.');
    expect(repo.rename).not.toHaveBeenCalled();
  });

  it('сайту немає → 404', async () => {
    repo.findByPath.mockResolvedValue(null);
    const error = await serviceFailure(() => SiteService.renameSite('shop', 'new-shop', 1));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Сайт не знайдено або недостатньо прав (тільки власник).');
  });

  it('не власник → 404', async () => {
    const error = await serviceFailure(() => SiteService.renameSite('shop', 'new-shop', 2));
    expect(error.status).toBe(404);
    expect(repo.rename).not.toHaveBeenCalled();
  });

  it('оновлення не зачепило жодного рядка → 404', async () => {
    repo.rename.mockResolvedValue({ affectedRows: 0 });
    const error = await serviceFailure(() => SiteService.renameSite('shop', 'new-shop', 1));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Сайт не знайдено або недостатньо прав.');
  });

  it('успіх: нова адреса нормалізується й повертається', async () => {
    const result = await SiteService.renameSite('shop', '  New-Shop ', 1);
    expect(result).toBe('new-shop');
    expect(repo.existsByPath).toHaveBeenCalledWith('new-shop');
    expect(repo.findByPath).toHaveBeenCalledWith('shop');
    expect(repo.rename).toHaveBeenCalledWith('shop', 'new-shop', 1);
  });
});

describe('listMySuspended / getUserSites', () => {
  it('призупинені сайти користувача віддаються з репозиторію', async () => {
    const rows = [{ id: 1 }];
    repo.findSuspendedWithAppeals.mockResolvedValue(rows);
    expect(await SiteService.listMySuspended(4)).toBe(rows);
    expect(repo.findSuspendedWithAppeals).toHaveBeenCalledWith(4);
  });

  it('доступні користувачу сайти віддаються з репозиторію', async () => {
    const rows = [{ id: 1 }];
    repo.findAllAccessible.mockResolvedValue(rows);
    expect(await SiteService.getUserSites(4)).toBe(rows);
    expect(repo.findAllAccessible).toHaveBeenCalledWith(4);
  });
});

describe('deleteSite', () => {
  it('нічого не видалено → 404', async () => {
    repo.deleteByPathAndUserId.mockResolvedValue(null);
    const error = await serviceFailure(() => SiteService.deleteSite('shop', 1));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Сайт не знайдено або у вас немає прав на його видалення.');
  });

  it('успіх: видалення за адресою й власником', async () => {
    await SiteService.deleteSite('shop', 1);
    expect(repo.deleteByPathAndUserId).toHaveBeenCalledWith('shop', 1);
  });
});

describe('resetToTemplate: доступ і помилки шаблону', () => {
  it('немає доступу → 403 до будь-якої роботи з шаблоном', async () => {
    repo.findByIdAndUserId.mockResolvedValue(null);
    const error = await serviceFailure(() => SiteService.resetToTemplate('7', 1, { templateId: 3 }));
    expect(error.status).toBe(403);
    expect(error.message).toBe(NO_ACCESS);
    expect(templates.findById).not.toHaveBeenCalled();
    expect(repo.transaction).not.toHaveBeenCalled();
  });

  it('KNOWN-DEFECT D-SEC-06: співавторові без прав доступ до скидання дозволений (перевірка лише наявності доступу)', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [] }));
    await SiteService.resetToTemplate('7', 2, { templateId: 3 });
    expect(repo.findByIdAndUserId).toHaveBeenCalledWith('7', 2);
    expect(repo.transaction).toHaveBeenCalled();
  });

  it('KNOWN-DEFECT D-ARC-10: шаблон не знайдено — звичайна Error (500), а не ServiceError; сторінки не зачіпаються', async () => {
    const error = await failure(() => SiteService.resetToTemplate('7', 1, { templateId: 3 }));
    expect(error).not.toBeInstanceOf(ServiceError);
    expect(error.message).toBe('Шаблон не знайдено.');
    expect(repo.transaction).not.toHaveBeenCalled();
    expect(pages.deleteBySiteId).not.toHaveBeenCalled();
  });

  it('чужий особистий шаблон — звичайна Error', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [] }, { type: 'personal', user_id: 2 }));
    const error = await failure(() => SiteService.resetToTemplate('7', 1, { templateId: 3 }));
    expect(error).not.toBeInstanceOf(ServiceError);
    expect(error.message).toBe('У вас немає доступу до цього шаблону.');
    expect(repo.transaction).not.toHaveBeenCalled();
  });

  it('власний особистий шаблон дозволений', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [] }, { type: 'personal', user_id: 1 }));
    await SiteService.resetToTemplate('7', 1, { templateId: 3 });
    expect(repo.transaction).toHaveBeenCalled();
  });

  it('шаблон завантажується поза транзакцією', async () => {
    templates.findById.mockResolvedValue(makeTemplate({ pages: [] }));
    await SiteService.resetToTemplate('7', 1, { templateId: 3 });
    expect(templates.findById.mock.calls[0]).toEqual([3]);
  });
});

describe('resetToTemplate: запис', () => {
  const content = {
    pages: [
      { title: 'Головна', slug: 'home', blocks: [{ block_id: 'b', type: 'text' }], seo_title: 'T', seo_description: 'D' },
      { title: 'Контакти', slug: 'contacts', block_content: [{ block_id: 'c', type: 'text' }] },
      { slug: 'flag', is_homepage: 1, blocks: [] },
      { blocks: [] },
    ],
    header_content: [{ block_id: 'h', type: 'header', data: {} }],
    footer_content: [{ block_id: 'f', type: 'footer' }],
    theme_settings: { font: 'x' },
    site_theme_mode: 'dark',
  };

  beforeEach(() => {
    templates.findById.mockResolvedValue(makeTemplate(content));
  });

  it('у транзакції: спочатку стираються сторінки, потім оновлюється сайт, потім додаються сторінки', async () => {
    await SiteService.resetToTemplate('7', 1, { templateId: 3 });
    expect(repo.transaction).toHaveBeenCalledTimes(1);
    expect(log.slice(0, 3)).toEqual(['delete', 'apply', 'page:home']);
    expect(log).toHaveLength(2 + 4);
    expect(pages.deleteBySiteId).toHaveBeenCalledWith('7', CONN);
    expect(repo.applyContent.mock.calls[0][2]).toBe(CONN);
    pages.createFromTemplate.mock.calls.forEach(call => expect(call[1]).toBe(CONN));
  });

  it('вміст сайту береться з шаблону; без акценту в шаблоні — orange', async () => {
    await SiteService.resetToTemplate('7', 1, { templateId: 3 });
    const [siteId, applied] = repo.applyContent.mock.calls[0];
    expect(siteId).toBe('7');
    expect(applied.themeSettings).toEqual({ font: 'x' });
    expect(applied.mode).toBe('dark');
    expect(applied.accent).toBe('orange');
    expect(applied.header[0].block_id).not.toBe('h');
    expect(applied.footer[0].block_id).not.toBe('f');
  });

  it('сторінки створюються з правилами slug, головної сторінки й запасних значень', async () => {
    await SiteService.resetToTemplate('7', 1, { templateId: 3 });
    const rows = pages.createFromTemplate.mock.calls.map(call => call[0]);
    expect(rows[0]).toMatchObject({ site_id: '7', name: 'Головна', slug: 'home', is_homepage: 1, seo_title: 'T', seo_description: 'D' });
    expect(rows[0].block_content[0].block_id).not.toBe('b');
    expect(rows[1]).toMatchObject({ name: 'Контакти', slug: 'contacts', is_homepage: 0, seo_title: null, seo_description: null });
    expect(rows[1].block_content).toHaveLength(1);
    expect(rows[2]).toMatchObject({ name: 'Нова сторінка', slug: 'flag', is_homepage: 1 });
    expect(rows[3].name).toBe('Нова сторінка');
    expect(rows[3].slug).toMatch(/^page-[0-9a-f-]{36}$/);
    expect(rows[3].is_homepage).toBe(0);
  });

  it('помилка запису передається нагору (відкат виконує транзакція)', async () => {
    const dbError = new Error('deadlock');
    pages.createFromTemplate.mockImplementation(async () => { throw dbError; });
    const error = await failure(() => SiteService.resetToTemplate('7', 1, { templateId: 3 }));
    expect(error).toBe(dbError);
  });

  it.each([[{ templateId: 'blank' }], [{ templateId: 3, isBlank: true }], [{ isBlank: true }]])('порожній сайт: %j', async (body) => {
    repo.findByIdAndUserId.mockResolvedValue(makeSite({ title: 'Мій сайт', logo_url: '/uploads/mine.png' }));
    await SiteService.resetToTemplate('7', 1, body);
    expect(templates.findById).not.toHaveBeenCalled();
    const applied = repo.applyContent.mock.calls[0][1];
    expect(applied.footer).toEqual([]);
    expect(applied.themeSettings).toEqual({});
    expect(applied.mode).toBe('light');
    expect(applied.accent).toBe('blue');
    expect(applied.header).toHaveLength(1);
    expect(applied.header[0].data).toMatchObject({
      site_title: 'Мій сайт', logo_src: '/uploads/mine.png', show_title: true,
      show_profile_icon: true, show_cart_icon: true, block_theme: 'auto',
    });
    expect(applied.header[0].data.nav_items[0]).toMatchObject({ label: 'Головна', link: '/' });
    expect(pages.createFromTemplate).toHaveBeenCalledTimes(1);
    expect(pages.createFromTemplate.mock.calls[0][0]).toMatchObject({ slug: 'home', name: 'Головна', block_content: [], is_homepage: 1 });
  });

  it('порожній сайт без логотипа отримує стандартний', async () => {
    repo.findByIdAndUserId.mockResolvedValue(makeSite({ logo_url: null }));
    await SiteService.resetToTemplate('7', 1, { isBlank: true });
    expect(repo.applyContent.mock.calls[0][1].header[0].data.logo_src).toBe('/logos/logo1.png');
  });
});

describe('togglePin', () => {
  it('немає доступу → 404', async () => {
    repo.findByIdAndUserId.mockResolvedValue(null);
    const error = await serviceFailure(() => SiteService.togglePin('7', 2));
    expect(error.status).toBe(404);
    expect(error.message).toBe(NO_ACCESS);
    expect(repo.togglePin).not.toHaveBeenCalled();
  });

  it.each([true, false])('повертає новий стан закріплення %s', async (state) => {
    repo.togglePin.mockResolvedValue(state);
    expect(await SiteService.togglePin('7', 1)).toBe(state);
    expect(repo.togglePin).toHaveBeenCalledWith('7');
  });

  it('KNOWN-DEFECT D-SEC-06: співавтор будь-якої ролі перемикає закріплення сайту власника', async () => {
    repo.findByIdAndUserId.mockResolvedValue(makeSite({ user_id: 1 }));
    await SiteService.togglePin('7', 2);
    expect(repo.togglePin).toHaveBeenCalledWith('7');
  });
});

describe('checkSlug', () => {
  it('некоректна адреса → недоступна з текстом помилки, БД не питається', async () => {
    expect(await SiteService.checkSlug('admin')).toEqual({ isAvailable: false, message: 'Цей URL зарезервовано системою' });
    expect(repo.existsByPath).not.toHaveBeenCalled();
  });

  it('відсутня адреса → недоступна', async () => {
    expect(await SiteService.checkSlug(undefined)).toEqual({ isAvailable: false, message: 'URL сайту обов\'язковий' });
  });

  it('зайнята адреса', async () => {
    repo.existsByPath.mockResolvedValue(true);
    expect(await SiteService.checkSlug('my-shop')).toEqual({ isAvailable: false, message: 'Ця адреса вже зайнята.' });
  });

  it('вільна адреса; пошук іде за нормалізованим значенням', async () => {
    expect(await SiteService.checkSlug('  My-Shop ')).toEqual({ isAvailable: true });
    expect(repo.existsByPath).toHaveBeenCalledWith('my-shop');
  });
});

describe('getAnalytics', () => {
  beforeEach(() => {
    repo.findOwnerAndStats.mockResolvedValue({ user_id: 1, view_count: 120, currency: 'USD' });
    orders.findStatsBySite.mockResolvedValue({ totalOrders: 5, completedOrders: 3, revenue: '450.50' });
    orders.findRecentBySite.mockResolvedValue([{ id: 'ORD1' }]);
  });

  it('сайту немає → 404', async () => {
    repo.findOwnerAndStats.mockResolvedValue(null);
    const error = await serviceFailure(() => SiteService.getAnalytics('7', 1));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Сайт не знайдено');
  });

  it('стороння людина → 403, замовлення не читаються', async () => {
    const error = await serviceFailure(() => SiteService.getAnalytics('7', 2));
    expect(error.status).toBe(403);
    expect(error.message).toBe('У вас немає прав доступу до аналітики цього сайту');
    expect(orders.findStatsBySite).not.toHaveBeenCalled();
  });

  it('власник отримує зведення', async () => {
    expect(await SiteService.getAnalytics('7', 1)).toEqual({
      views: 120, totalOrders: 5, completedOrders: 3, revenue: 450.5, currency: 'USD', recentOrders: [{ id: 'ORD1' }],
    });
    expect(orders.findStatsBySite).toHaveBeenCalledWith('7');
    expect(orders.findRecentBySite).toHaveBeenCalledWith('7', 5);
  });

  it('співавтор будь-якої ролі отримує зведення', async () => {
    collaborators.findBySiteAndUser.mockResolvedValue({ role: 'viewer', permissions: [] });
    const result = await SiteService.getAnalytics('7', 2);
    expect(collaborators.findBySiteAndUser).toHaveBeenCalledWith('7', 2);
    expect(result.totalOrders).toBe(5);
  });

  it('порожні значення замінюються нулями й гривнею', async () => {
    repo.findOwnerAndStats.mockResolvedValue({ user_id: 1, view_count: null, currency: null });
    orders.findStatsBySite.mockResolvedValue({ totalOrders: 0, completedOrders: null, revenue: null });
    orders.findRecentBySite.mockResolvedValue([]);
    expect(await SiteService.getAnalytics('7', 1)).toEqual({
      views: 0, totalOrders: 0, completedOrders: 0, revenue: 0, currency: 'UAH', recentOrders: [],
    });
  });

  it('відсутній рядок статистики не ламає відповідь', async () => {
    orders.findStatsBySite.mockResolvedValue(undefined);
    const result = await SiteService.getAnalytics('7', 1);
    expect(result).toMatchObject({ totalOrders: 0, completedOrders: 0, revenue: 0 });
  });
});

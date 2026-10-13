// backend/tests/unit/siteSettings.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSettingsUpdate, assertStatusChangeAllowed } = require('../../services/siteSettings');
const { encrypt, decrypt } = require('../../utils/encryption');
const { ServiceError } = require('../../services/ServiceError');

function failure(fn) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    return error;
  }
  throw new Error('Очікувалася ServiceError');
}

const makeSite = (overrides = {}) => ({
  id: 7,
  title: 'Старий',
  status: 'published',
  logo_url: '/logos/old.png',
  site_theme_mode: 'light',
  site_theme_accent: 'blue',
  theme_settings: { font: 'a' },
  dashboard_config: { hiddenTabs: [] },
  header_content: [{ block_id: 'h1', type: 'header', data: { site_title: 'Старий', logo_src: '/logos/old.png', show_title: true } }],
  footer_content: [{ block_id: 'f1', type: 'footer' }],
  favicon_url: '/fav.ico',
  site_title_seo: 'seo',
  cover_image: '/cover.png',
  cover_layout: 'centered',
  cover_logo_size: 80,
  cover_logo_radius: 4,
  cover_title_size: 24,
  liqpay_public_key: 'pub',
  liqpay_private_key: 'stored-secret',
  is_online_payment_enabled: 1,
  is_cod_enabled: 0,
  currency: 'UAH',
  cookie_banner_enabled: 1,
  cookie_banner_text: 'cookies',
  cookie_banner_size: 'medium',
  cookie_banner_position: 'bottom-center',
  cookie_banner_blur: 0,
  ...overrides,
});

describe('assertStatusChangeAllowed', () => {
  it('без запиту на зміну статусу — дозволено', () => {
    expect(() => assertStatusChangeAllowed(makeSite({ status: 'suspended' }), undefined)).not.toThrow();
  });

  it('той самий статус — дозволено навіть для заблокованого сайту', () => {
    expect(() => assertStatusChangeAllowed(makeSite({ status: 'suspended' }), 'suspended')).not.toThrow();
  });

  it('активний сайт можна перевести в інший статус', () => {
    expect(() => assertStatusChangeAllowed(makeSite({ status: 'published' }), 'private')).not.toThrow();
  });

  it.each(['suspended', 'probation'])('сайт у статусі %s: зміна статусу → 403', (status) => {
    const error = failure(() => assertStatusChangeAllowed(makeSite({ status }), 'published'));
    expect(error.status).toBe(403);
    expect(error.message).toBe('Ви не можете змінювати статус сайту, поки він заблокований або на модерації.');
  });
});

describe('buildSettingsUpdate: збереження поточних значень', () => {
  it('порожнє тіло залишає всі поля такими, як були', () => {
    const site = makeSite();
    const update = buildSettingsUpdate(site, {});
    expect(update).toMatchObject({
      title: 'Старий',
      status: 'published',
      logo_url: '/logos/old.png',
      site_theme_mode: 'light',
      site_theme_accent: 'blue',
      theme_settings: { font: 'a' },
      dashboard_config: { hiddenTabs: [] },
      footer_content: site.footer_content,
      favicon_url: '/fav.ico',
      site_title_seo: 'seo',
      cover_image: '/cover.png',
      cover_layout: 'centered',
      cover_logo_size: 80,
      cover_logo_radius: 4,
      cover_title_size: 24,
      liqpay_public_key: 'pub',
      liqpay_private_key: 'stored-secret',
      is_online_payment_enabled: 1,
      is_cod_enabled: 0,
      currency: 'UAH',
      cookie_banner_enabled: 1,
      cookie_banner_text: 'cookies',
      cookie_banner_size: 'medium',
      cookie_banner_position: 'bottom-center',
      cookie_banner_blur: 0,
    });
    expect(update.header_content).toEqual(site.header_content);
  });

  it('передані поля перекривають поточні', () => {
    const update = buildSettingsUpdate(makeSite(), {
      status: 'private',
      site_theme_mode: 'dark',
      site_theme_accent: 'red',
      favicon_url: '/new.ico',
      site_title_seo: 'new seo',
      cover_image: '/c2.png',
      cover_layout: 'left',
      liqpay_public_key: 'pub2',
      is_online_payment_enabled: 0,
      is_cod_enabled: 1,
      currency: 'USD',
      cookie_banner_enabled: 0,
      cookie_banner_text: 'new',
      cookie_banner_size: 'large',
      cookie_banner_position: 'top',
      cookie_banner_blur: 1,
    });
    expect(update).toMatchObject({
      status: 'private',
      site_theme_mode: 'dark',
      site_theme_accent: 'red',
      favicon_url: '/new.ico',
      site_title_seo: 'new seo',
      cover_image: '/c2.png',
      cover_layout: 'left',
      liqpay_public_key: 'pub2',
      is_online_payment_enabled: 0,
      is_cod_enabled: 1,
      currency: 'USD',
      cookie_banner_enabled: 0,
      cookie_banner_text: 'new',
      cookie_banner_size: 'large',
      cookie_banner_position: 'top',
      cookie_banner_blur: 1,
    });
  });

  it('розміри обкладинки перетворюються на цілі числа', () => {
    const update = buildSettingsUpdate(makeSite(), { cover_logo_size: '120', cover_logo_radius: '8.7', cover_title_size: '30px' });
    expect(update.cover_logo_size).toBe(120);
    expect(update.cover_logo_radius).toBe(8);
    expect(update.cover_title_size).toBe(30);
  });

  it('JSON-поля приймаються рядком чи об\'єктом, некоректний рядок дає поточне значення', () => {
    const site = makeSite();
    const update = buildSettingsUpdate(site, {
      theme_settings: '{"font":"b"}',
      dashboard_config: { hiddenTabs: ['x'] },
      footer_content: '{oops',
    });
    expect(update.theme_settings).toEqual({ font: 'b' });
    expect(update.dashboard_config).toEqual({ hiddenTabs: ['x'] });
    expect(update.footer_content).toEqual(site.footer_content);
  });
});

describe('buildSettingsUpdate: статус', () => {
  it.each(['suspended', 'probation'])('для сайту у статусі %s статус не змінюється', (status) => {
    expect(buildSettingsUpdate(makeSite({ status }), { status: 'published' }).status).toBe(status);
  });

  it('активний сайт отримує переданий статус', () => {
    expect(buildSettingsUpdate(makeSite(), { status: 'maintenance' }).status).toBe('maintenance');
  });
});

describe('buildSettingsUpdate: назва та шапка', () => {
  it('нова назва обрізається й потрапляє в блок шапки', () => {
    const update = buildSettingsUpdate(makeSite(), { title: '  Новий  ' });
    expect(update.title).toBe('Новий');
    expect(update.header_content[0].data.site_title).toBe('Новий');
  });

  it('назва поза межами довжини → 400', () => {
    const error = failure(() => buildSettingsUpdate(makeSite(), { title: 'a' }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Назва сайту має бути від 2 до 60 символів');
  });

  it('назва з < або > → 400', () => {
    const error = failure(() => buildSettingsUpdate(makeSite(), { title: '<b>x' }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Назва сайту містить недопустимі символи (<, >)');
  });

  it('назва не рядок → TypeError, а не ServiceError', () => {
    expect(() => buildSettingsUpdate(makeSite(), { title: 5 })).toThrow(TypeError);
  });

  it('logo_url потрапляє в шапку', () => {
    const update = buildSettingsUpdate(makeSite(), { logo_url: '/logos/new.png' });
    expect(update.logo_url).toBe('/logos/new.png');
    expect(update.header_content[0].data.logo_src).toBe('/logos/new.png');
  });

  it('переданий header_content (рядком) визначає назву й логотип', () => {
    const incoming = [{ block_id: 'h', type: 'header', data: { site_title: '  З шапки  ', logo_src: '/logos/h.png' } }];
    const update = buildSettingsUpdate(makeSite(), { header_content: JSON.stringify(incoming) });
    expect(update.title).toBe('З шапки');
    expect(update.logo_url).toBe('/logos/h.png');
    expect(update.header_content[0].data).toMatchObject({ site_title: 'З шапки', logo_src: '/logos/h.png' });
  });

  it('назва в блоці шапки має перевагу над полем title', () => {
    const incoming = [{ block_id: 'h', type: 'header', data: { site_title: 'Шапка' } }];
    const update = buildSettingsUpdate(makeSite(), { title: 'Поле', header_content: incoming });
    expect(update.title).toBe('Шапка');
  });

  it('назва в блоці шапки з < або > → 400 з власним текстом', () => {
    const incoming = [{ block_id: 'h', type: 'header', data: { site_title: 'a<b' } }];
    const error = failure(() => buildSettingsUpdate(makeSite(), { header_content: incoming }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Назва містить недопустимі символи');
  });

  it('якщо блока header немає, він додається з назвою й логотипом сайту', () => {
    const site = makeSite({ header_content: [{ block_id: 'x', type: 'text' }] });
    const update = buildSettingsUpdate(site, {});
    expect(update.header_content).toHaveLength(2);
    expect(update.header_content[1]).toMatchObject({
      type: 'header',
      data: { site_title: 'Старий', logo_src: '/logos/old.png', show_title: true, nav_items: [], block_theme: 'auto' },
    });
    expect(update.header_content[1].block_id).toEqual(expect.any(String));
  });

  it('header_content сайту у вигляді рядка JSON розбирається', () => {
    const site = makeSite({ header_content: JSON.stringify([{ block_id: 'h', type: 'header', data: { show_title: false } }]) });
    const update = buildSettingsUpdate(site, { title: 'Нова' });
    expect(update.header_content[0].data).toMatchObject({ show_title: false, site_title: 'Нова' });
  });

  it('header_content, що не є масивом, не змінюється', () => {
    const site = makeSite({ header_content: { custom: true } });
    expect(buildSettingsUpdate(site, {}).header_content).toEqual({ custom: true });
  });
});

describe('buildSettingsUpdate: ключ LiqPay', () => {
  it('без поля у тілі залишається збережене значення', () => {
    expect(buildSettingsUpdate(makeSite(), {}).liqpay_private_key).toBe('stored-secret');
  });

  it('маска «********» залишає збережене значення', () => {
    expect(buildSettingsUpdate(makeSite(), { liqpay_private_key: '********' }).liqpay_private_key).toBe('stored-secret');
  });

  it.each(['', '   '])('порожній ключ (%j) стирає збережений', (value) => {
    expect(buildSettingsUpdate(makeSite(), { liqpay_private_key: value }).liqpay_private_key).toBeNull();
  });

  it('новий ключ шифрується', () => {
    const stored = buildSettingsUpdate(makeSite(), { liqpay_private_key: 'fresh-secret' }).liqpay_private_key;
    expect(stored).not.toBe('fresh-secret');
    expect(decrypt(stored)).toBe('fresh-secret');
  });

  it('ключ, що не є рядком, → TypeError', () => {
    expect(() => buildSettingsUpdate(makeSite(), { liqpay_private_key: 123 })).toThrow(TypeError);
  });

  it('шифрування не залежить від збереженого значення', () => {
    const stored = encrypt('old');
    const update = buildSettingsUpdate(makeSite({ liqpay_private_key: stored }), { liqpay_private_key: '********' });
    expect(update.liqpay_private_key).toBe(stored);
  });
});

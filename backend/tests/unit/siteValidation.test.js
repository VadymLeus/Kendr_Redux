// backend/tests/unit/siteValidation.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateSlug, validateTitleText, validateSiteCreation } = require('../../services/siteValidation');

describe('validateSlug', () => {
  it.each([undefined, null, '', 42, {}])('%j → «URL сайту обов\'язковий»', (value) => {
    expect(validateSlug(value)).toBe('URL сайту обов\'язковий');
  });

  it.each(['ab', 'a'.repeat(41)])('довжина поза межами 3–40 (%s)', (slug) => {
    expect(validateSlug(slug)).toBe('URL сайту має бути від 3 до 40 символів');
  });

  it('рівно 40 символів — дозволено (KNOWN-DEFECT D-BIZ-05: поле вводу обмежує 30)', () => {
    expect(validateSlug('ab'.repeat(20))).toBeNull();
  });

  it.each(['my_shop', 'my shop', 'мій-сайт', 'shop!'])('недопустимі символи (%s)', (slug) => {
    expect(validateSlug(slug)).toBe('URL може містити лише малі латинські літери, цифри та дефіс');
  });

  it.each(['-shop', 'shop-'])('дефіс на краю (%s)', (slug) => {
    expect(validateSlug(slug)).toBe('URL не може починатися або закінчуватися дефісом');
  });

  it('два дефіси поспіль', () => {
    expect(validateSlug('my--shop')).toBe('URL не може містити два дефіси підряд');
  });

  it.each(['admin', 'api', 'login', 'create', 'billing', 'ADMIN'])('зарезервовано (%s)', (slug) => {
    expect(validateSlug(slug)).toBe('Цей URL зарезервовано системою');
  });

  it.each(['aaaaa', 'my-qwerty-shop', 'shop12345', 'password1'])('занадто проста послідовність (%s)', (slug) => {
    expect(validateSlug(slug)).toBe('Ця адреса містить заборонену або занадто просту послідовність символів');
  });

  it('чотири однакові символи поспіль ще дозволені', () => {
    expect(validateSlug('aaaab')).toBeNull();
  });

  it.each(['my-shop', 'shop1', 'abc', 'My-Shop', '  my-shop  '])('коректна адреса (%s)', (slug) => {
    expect(validateSlug(slug)).toBeNull();
  });
});

describe('validateTitleText', () => {
  it.each(['a', 'a'.repeat(61), ''])('довжина поза межами 2–60 (%j)', (title) => {
    expect(validateTitleText(title)).toBe('Назва сайту має бути від 2 до 60 символів');
  });

  it.each(['<b>', 'a>b', 'x<y'])('символи < і > заборонені (%s)', (title) => {
    expect(validateTitleText(title)).toBe('Назва сайту містить недопустимі символи (<, >)');
  });

  it.each(['ab', 'Мій магазин', 'a'.repeat(60)])('коректна назва (%s)', (title) => {
    expect(validateTitleText(title)).toBeNull();
  });
});

describe('validateSiteCreation', () => {
  it.each([undefined, null, '', 5])('назва %j обов\'язкова', (title) => {
    expect(validateSiteCreation(title, 'my-shop')).toBe('Назва сайту обов\'язкова');
  });

  it('назва перевіряється раніше за адресу', () => {
    expect(validateSiteCreation('a', 'admin')).toBe('Назва сайту має бути від 2 до 60 символів');
  });

  it('пробіли навколо назви обрізаються перед перевіркою довжини', () => {
    expect(validateSiteCreation('  a  ', 'my-shop')).toBe('Назва сайту має бути від 2 до 60 символів');
    expect(validateSiteCreation('  ab  ', 'my-shop')).toBeNull();
  });

  it('коректна назва + некоректна адреса → помилка адреси', () => {
    expect(validateSiteCreation('Мій сайт', 'admin')).toBe('Цей URL зарезервовано системою');
    expect(validateSiteCreation('Мій сайт', undefined)).toBe('URL сайту обов\'язковий');
  });

  it('усе коректно → null', () => {
    expect(validateSiteCreation('Мій сайт', 'my-shop')).toBeNull();
  });
});

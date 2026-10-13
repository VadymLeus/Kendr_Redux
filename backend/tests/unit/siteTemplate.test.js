// backend/tests/unit/siteTemplate.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { regenerateBlockIds, readTemplate, parseTemplateContent } = require('../../services/siteTemplate');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('regenerateBlockIds', () => {
  it.each([null, undefined, 0, ''])('%j → порожній масив', (value) => {
    expect(regenerateBlockIds(value)).toEqual([]);
  });

  it('значення, що не є масивом, повертається як є', () => {
    const value = { type: 'text' };
    expect(regenerateBlockIds(value)).toBe(value);
  });

  it('кожен блок отримує новий uuid, решта полів зберігається', () => {
    const result = regenerateBlockIds([
      { block_id: 'old-1', type: 'text', data: { text: 'a' } },
      { block_id: 'old-2', type: 'image', data: { src: 'b' } },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].block_id).toMatch(UUID);
    expect(result[1].block_id).toMatch(UUID);
    expect(result[0].block_id).not.toBe('old-1');
    expect(result[0].block_id).not.toBe(result[1].block_id);
    expect(result[0].type).toBe('text');
    expect(result[1].data).toEqual({ src: 'b' });
  });

  it('вкладені блоки колонок теж отримують нові ідентифікатори', () => {
    const result = regenerateBlockIds([
      { block_id: 'p', type: 'columns', data: { columns: [[{ block_id: 'c1', type: 'text' }], [{ block_id: 'c2', type: 'text' }]] } },
    ]);
    const [left, right] = result[0].data.columns;
    expect(left[0].block_id).toMatch(UUID);
    expect(right[0].block_id).toMatch(UUID);
    expect(left[0].block_id).not.toBe('c1');
    expect(right[0].block_id).not.toBe('c2');
  });

  it('елементи items отримують новий id', () => {
    const result = regenerateBlockIds([{ block_id: 'x', type: 'faq', data: { items: [{ id: 'i1', q: 'a' }, { id: 'i2', q: 'b' }] } }]);
    const [first, second] = result[0].data.items;
    expect(first.id).toMatch(UUID);
    expect(second.id).toMatch(UUID);
    expect(first.id).not.toBe('i1');
    expect(first.q).toBe('a');
  });

  it('блок без data обробляється', () => {
    expect(regenerateBlockIds([{ type: 'divider' }])[0].block_id).toMatch(UUID);
  });
});

describe('parseTemplateContent', () => {
  it('рядок розбирається як JSON', () => {
    expect(parseTemplateContent('{"a":1}')).toEqual({ a: 1 });
  });

  it('об\'єкт повертається без змін', () => {
    const value = { a: 1 };
    expect(parseTemplateContent(value)).toBe(value);
  });

  it('некоректний JSON — SyntaxError', () => {
    expect(() => parseTemplateContent('{oops')).toThrow(SyntaxError);
  });
});

describe('readTemplate', () => {
  const full = {
    pages: [{ title: 'Головна', slug: 'home', blocks: [{ type: 'text' }] }],
    header_content: [{ block_id: 'h', type: 'header', data: {} }],
    footer_content: [{ block_id: 'f', type: 'footer', data: {} }],
    theme_settings: { mode: 'dark', accent: 'green', font: 'x' },
    site_theme_mode: 'dark',
    site_theme_accent: 'red',
  };

  it('розбирає рядковий вміст і перегенеровує ідентифікатори шапки й підвалу', () => {
    const result = readTemplate({ default_block_content: JSON.stringify(full) }, 'blue');
    expect(result.pages).toEqual(full.pages);
    expect(result.header[0].block_id).not.toBe('h');
    expect(result.header[0].block_id).toMatch(UUID);
    expect(result.footer[0].block_id).not.toBe('f');
    expect(result.themeSettings).toEqual(full.theme_settings);
    expect(result.mode).toBe('dark');
    expect(result.accent).toBe('red');
  });

  it('приймає вже розібраний об\'єкт', () => {
    const result = readTemplate({ default_block_content: full }, 'blue');
    expect(result.pages).toEqual(full.pages);
  });

  it('режим і акцент беруться з theme_settings, якщо окремих полів немає', () => {
    const result = readTemplate({ default_block_content: { pages: [], theme_settings: { mode: 'dark', accent: 'green' } } }, 'blue');
    expect(result.mode).toBe('dark');
    expect(result.accent).toBe('green');
  });

  it('без акценту в шаблоні діє значення за замовчуванням, яке передав виклик', () => {
    expect(readTemplate({ default_block_content: { pages: [] } }, 'blue').accent).toBe('blue');
    expect(readTemplate({ default_block_content: { pages: [] } }, 'orange').accent).toBe('orange');
  });

  it('без режиму в шаблоні — light, без налаштувань теми — порожній об\'єкт', () => {
    const result = readTemplate({ default_block_content: { pages: [] } }, 'blue');
    expect(result.mode).toBe('light');
    expect(result.themeSettings).toEqual({});
    expect(result.header).toEqual([]);
    expect(result.footer).toEqual([]);
  });

  it('шаблон у вигляді масиву блоків стає однією сторінкою home', () => {
    const blocks = [{ type: 'text' }];
    const result = readTemplate({ default_block_content: blocks }, 'blue');
    expect(result.pages).toEqual([{ title: 'Головна', slug: 'home', blocks }]);
  });

  it('об\'єкт без pages дає порожній список сторінок', () => {
    expect(readTemplate({ default_block_content: { header_content: [] } }, 'blue').pages).toEqual([]);
  });

  it('некоректний JSON передає SyntaxError', () => {
    expect(() => readTemplate({ default_block_content: '{oops' }, 'blue')).toThrow(SyntaxError);
  });
});

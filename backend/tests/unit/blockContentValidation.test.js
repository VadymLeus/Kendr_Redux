// backend/tests/unit/blockContentValidation.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  validateBlockContent, MAX_BLOCKS, MAX_DEPTH, MAX_CONTENT_BYTES, MAX_ID_LENGTH,
} = require('../../services/blockContentValidation');
const { BLOCK_TYPES, LEGACY_BLOCK_TYPES } = require('../../config/blockTypes');
const { ServiceError } = require('../../services/ServiceError');

const refusal = (value) => {
  try {
    validateBlockContent(value);
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    return error;
  }
  throw new Error('Очікувалася ServiceError');
};

const block = (type = 'text', data = {}, id = 'b1') => ({ block_id: id, type, data });
const layout = (columns) => block('layout', { columns }, 'l1');

// layout всередині layout: levels макетів, у найглибшій колонці — текст
const nest = (levels) => {
  let inner = block('text');
  for (let i = 0; i < levels; i += 1) inner = layout([[inner]]);
  return inner;
};

describe('validateBlockContent: допустимий вміст', () => {
  it('порожній масив (редактор очищає сторінку)', () => {
    expect(validateBlockContent([])).toEqual([]);
  });

  it('повертає той самий масив без змін', () => {
    const blocks = [block('hero', { title: 'T' }), block('text', { content: 'x' }, 'b2')];
    expect(validateBlockContent(blocks)).toBe(blocks);
  });

  it.each(BLOCK_TYPES)('тип "%s" приймається', (type) => {
    expect(() => validateBlockContent([block(type)])).not.toThrow();
  });

  it.each(LEGACY_BLOCK_TYPES)('старе ім\'я "%s" приймається', (type) => {
    expect(() => validateBlockContent([block(type)])).not.toThrow();
  });

  it('шапка й підвал із порожнім data (редактор виносить їх у налаштування сайту)', () => {
    expect(() => validateBlockContent([block('global-header', {}, 'h'), block('global-footer', {}, 'f')])).not.toThrow();
  });

  it('макет без колонок і макет із порожніми колонками', () => {
    expect(() => validateBlockContent([block('layout', {}), layout([[], []])])).not.toThrow();
  });

  it('блоки в колонках макета, у тому числі вкладений макет', () => {
    const content = [layout([[block('text'), block('button', {}, 'b3')], [nest(2)]])];
    expect(() => validateBlockContent(content)).not.toThrow();
  });

  it('розмітка й довільні поля в data зберігаються як є', () => {
    expect(() => validateBlockContent([block('text', { content: '<script>alert(1)</script>', extra: [1, { a: 2 }] })])).not.toThrow();
  });
});

describe('validateBlockContent: значення, що не є масивом', () => {
  it.each([[undefined], [null], [0], [42], [''], ['текст'], ['[]'], [true], [{}], [{ foo: 'bar' }]])('%j → 400', (value) => {
    const error = refusal(value);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Вміст сторінки (block_content) має бути масивом блоків.');
  });
});

describe('validateBlockContent: елементи масиву', () => {
  it.each([[42], [null], ['текст'], [[]], [true], [undefined]])('елемент %j → 400', (item) => {
    const error = refusal([block(), item]);
    expect(error.status).toBe(400);
    expect(error.message).toBe("Блок [1] має бути об'єктом.");
  });

  it.each([
    ['відсутній', undefined],
    ['null', null],
    ['порожній', ''],
    ['з пробілів', '   '],
    ['число', 7],
    ['об\'єкт', {}],
    ['завдовжки понад ліміт', 'x'.repeat(MAX_ID_LENGTH + 1)],
  ])('block_id %s → 400', (_name, id) => {
    const error = refusal([{ block_id: id, type: 'text', data: {} }]);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Блок [0] не має коректного block_id.');
  });

  it('block_id завдовжки рівно ліміт приймається', () => {
    expect(() => validateBlockContent([block('text', {}, 'x'.repeat(MAX_ID_LENGTH))])).not.toThrow();
  });

  it.each([
    ['відсутній', undefined], ['невідомий', 'no-such-block'], ['пустий', ''], ['число', 5], ['null', null],
    ['heading', 'heading'], ['регістр', 'Text'], ['constructor', 'constructor'], ['__proto__', '__proto__'],
  ])('type %s → 400', (_name, type) => {
    const error = refusal([{ block_id: 'b1', type, data: {} }]);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Блок [0] має невідомий тип.');
  });

  it.each([['відсутній', undefined], ['null', null], ['рядок', 'not-an-object'], ['масив', []], ['число', 1]])('data %s → 400', (_name, data) => {
    const error = refusal([{ block_id: 'b1', type: 'text', data }]);
    expect(error.status).toBe(400);
    expect(error.message).toBe("Блок [0] не має даних (data має бути об'єктом).");
  });

  it('помилка показує шлях до блока', () => {
    const error = refusal([block(), block('text', {}, 'b2'), block('hero', {}, 'b3'), { block_id: 'b4', type: 'nope', data: {} }]);
    expect(error.message).toBe('Блок [3] має невідомий тип.');
  });
});

describe('validateBlockContent: макет (layout.data.columns)', () => {
  it('columns не масив → 400', () => {
    const error = refusal([block('layout', { columns: { 0: [] } })]);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Колонки макета [0].data.columns мають бути масивом.');
  });

  it('колонка не масив → 400', () => {
    const error = refusal([layout([[], 'текст'])]);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Колонка [0].data.columns[1] має бути масивом блоків.');
  });

  it('некоректний вкладений блок → 400 із повним шляхом', () => {
    const error = refusal([block(), layout([[block('text', {}, 'a')], [block('text', {}, 'b'), { block_id: 'c', type: 'evil', data: {} }]])]);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Блок [1].data.columns[1][1] має невідомий тип.');
  });

  it('вкладений блок без block_id → 400', () => {
    const error = refusal([layout([[{ type: 'text', data: {} }]])]);
    expect(error.message).toBe('Блок [0].data.columns[0][0] не має коректного block_id.');
  });

  it('columns в блоці іншого типу не перевіряються', () => {
    expect(() => validateBlockContent([block('text', { columns: 'будь-що' })])).not.toThrow();
  });
});

describe('validateBlockContent: обмеження', () => {
  it(`вкладеність до ${MAX_DEPTH} макетів приймається`, () => {
    expect(() => validateBlockContent([nest(MAX_DEPTH)])).not.toThrow();
  });

  it(`вкладеність понад ${MAX_DEPTH} макетів → 400`, () => {
    const error = refusal([nest(MAX_DEPTH + 1)]);
    expect(error.status).toBe(400);
    expect(error.message).toBe(`Вкладеність блоків перевищує ${MAX_DEPTH} рівнів.`);
  });

  it(`${MAX_BLOCKS} блоків приймається`, () => {
    const blocks = Array.from({ length: MAX_BLOCKS }, (_, i) => block('text', {}, `b${i}`));
    expect(() => validateBlockContent(blocks)).not.toThrow();
  });

  it(`понад ${MAX_BLOCKS} блоків → 400`, () => {
    const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => block('text', {}, `b${i}`));
    const error = refusal(blocks);
    expect(error.status).toBe(400);
    expect(error.message).toBe(`На сторінці забагато блоків (максимум ${MAX_BLOCKS}).`);
  });

  it('вкладені блоки входять до загальної кількості', () => {
    const column = Array.from({ length: MAX_BLOCKS }, (_, i) => block('text', {}, `c${i}`));
    expect(refusal([layout([column])]).message).toBe(`На сторінці забагато блоків (максимум ${MAX_BLOCKS}).`);
  });

  it('вміст більший за ліміт розміру → 400', () => {
    const error = refusal([block('text', { content: 'x'.repeat(MAX_CONTENT_BYTES) })]);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Вміст сторінки перевищує 2 МБ.');
  });

  it('розмір рахується в байтах, а не в символах', () => {
    const cyrillic = 'ї'.repeat(MAX_CONTENT_BYTES / 2 + 1);
    expect(refusal([block('text', { content: cyrillic })]).status).toBe(400);
  });
});

// backend/tests/unit/productVisibility.test.js
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { withoutDigitalFile, visibleProducts } = require('../../services/productVisibility');

const book = { id: 1, site_id: 3, name: 'Книга', digital_file_url: 'https://files.test/a.pdf' };
const coffee = { id: 2, site_id: 3, name: 'Кава', digital_file_url: null };
const course = { id: 3, site_id: 4, name: 'Курс', digital_file_url: 'https://files.test/b.pdf' };

describe('withoutDigitalFile', () => {
  it('прибирає лише digital_file_url, вихідний об\'єкт не змінює', () => {
    const copy = { ...book };
    expect(withoutDigitalFile(copy)).toEqual({ id: 1, site_id: 3, name: 'Книга' });
    expect(copy).toEqual(book);
  });

  it('товар без поля digital_file_url лишається без змін за складом', () => {
    expect(withoutDigitalFile({ id: 5 })).toEqual({ id: 5 });
  });
});

describe('visibleProducts', () => {
  it('керування дозволено: записи віддаються як є', async () => {
    const result = await visibleProducts([book, coffee], async () => true);
    expect(result).toEqual([book, coffee]);
  });

  it('керування заборонено: файл прибрано в усіх товарів', async () => {
    const result = await visibleProducts([book, coffee], async () => false);
    expect(result.every((product) => !('digital_file_url' in product))).toBe(true);
    expect(result.map((product) => product.id)).toEqual([1, 2]);
  });

  it('рішення приймається один раз на сайт і окремо для кожного сайту', async () => {
    const canManage = vi.fn(async (siteId) => siteId === 3);
    const result = await visibleProducts([book, coffee, course], canManage);
    expect(canManage).toHaveBeenCalledTimes(2);
    expect(canManage.mock.calls.map(([siteId]) => siteId)).toEqual([3, 4]);
    expect(result[0].digital_file_url).toBe(book.digital_file_url);
    expect(result[2]).not.toHaveProperty('digital_file_url');
  });

  it('порожній список не викликає перевірок', async () => {
    const canManage = vi.fn();
    expect(await visibleProducts([], canManage)).toEqual([]);
    expect(canManage).not.toHaveBeenCalled();
  });
});

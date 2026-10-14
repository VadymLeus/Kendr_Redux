// backend/tests/unit/fileUtils.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { deleteFile } = require('../../utils/fileUtils');

const BACKEND_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const stamp = `${process.pid}-${Date.now()}`;
const created = [];
const touch = (...segments) => {
  const file = path.join(BACKEND_ROOT, ...segments);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'sentinel');
  created.push(file);
  return file;
};
const exists = (file) => fs.existsSync(file);

afterEach(() => {
  vi.restoreAllMocks();
  for (const file of created.splice(0)) fs.rmSync(file, { force: true });
});

describe('deleteFile: шляхи всередині каталогу uploads', () => {
  it('веб-шлях зі слешем на початку (так адреси зберігаються в БД) видаляється', async () => {
    const file = touch('uploads', 'avatars', 'custom', `web-${stamp}.webp`);
    await deleteFile(`/uploads/avatars/custom/web-${stamp}.webp`);
    expect(exists(file)).toBe(false);
  });

  it('відносний шлях без слеша видаляється', async () => {
    const file = touch('uploads', 'media', `relative-${stamp}.webp`);
    await deleteFile(`uploads/media/relative-${stamp}.webp`);
    expect(exists(file)).toBe(false);
  });

  it('абсолютний шлях усередині uploads видаляється (так викликає mediaController)', async () => {
    const file = touch('uploads', 'media', `absolute-${stamp}.webp`);
    await deleteFile(file);
    expect(exists(file)).toBe(false);
  });

  it('шлях із «..», що лишається в uploads, видаляється', async () => {
    const file = touch('uploads', 'avatars', 'custom', `inner-${stamp}.webp`);
    await deleteFile(`uploads/media/../avatars/custom/inner-${stamp}.webp`);
    expect(exists(file)).toBe(false);
  });

  it('файлу немає: тиха відповідь без помилки й без запису в журнал помилок', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await deleteFile(`/uploads/avatars/custom/missing-${stamp}.webp`)).toBeUndefined();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('deleteFile: шляхи поза каталогом uploads (D-SEC-19)', () => {
  it.each([
    ['відносний шлях із «..»', (name) => `uploads/avatars/custom/../../../tests/.tmp/${name}`],
    ['абсолютний шлях до файлу в backend', (name) => path.join(BACKEND_ROOT, 'tests', '.tmp', name)],
    ['шлях зі слешем і «..»', (name) => `/uploads/../tests/.tmp/${name}`],
    ['шлях без uploads', (name) => `tests/.tmp/${name}`],
  ])('%s: файл лишається, у журнал іде попередження', async (_label, build) => {
    const name = `outside-${stamp}.txt`;
    const file = touch('tests', '.tmp', name);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await deleteFile(build(name));
    expect(exists(file)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('сусідній каталог із схожою назвою (uploads2) не вважається частиною uploads', async () => {
    const file = touch(`uploads2-${stamp}`, 'x.txt');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await deleteFile(`uploads/../uploads2-${stamp}/x.txt`);
    expect(exists(file)).toBe(true);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('сам каталог uploads видалити не можна', async () => {
    const marker = touch('uploads', `.keep-${stamp}`);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await deleteFile('/uploads');
    await deleteFile('uploads/');
    expect(exists(path.join(BACKEND_ROOT, 'uploads'))).toBe(true);
    expect(exists(marker)).toBe(true);
  });
});

describe('deleteFile: порожні значення й типові файли', () => {
  it.each([[undefined], [null], [''], [42], [{}]])('значення %j ігнорується без винятку', async (value) => {
    expect(await deleteFile(value)).toBeUndefined();
  });

  it('типові аватари (/default/) не видаляються ніколи', async () => {
    const file = touch('uploads', 'avatars', 'default', `keep-${stamp}.webp`);
    await deleteFile(`/uploads/avatars/default/keep-${stamp}.webp`);
    expect(exists(file)).toBe(true);
  });
});

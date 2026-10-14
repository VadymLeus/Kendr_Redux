// backend/tests/unit/avatarUrl.test.js
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isAllowedAvatarUrl } = require('../../utils/avatarUrl');

const saved = process.env.CLOUDINARY_CLOUD_NAME;
afterEach(() => {
  process.env.CLOUDINARY_CLOUD_NAME = saved;
});

describe('isAllowedAvatarUrl', () => {
  it.each([
    '/uploads/avatars/default/a1.webp',
    '/uploads/avatars/default/avatar_3-final.png',
    'https://res.cloudinary.com/test/image/upload/v1/kendr/general/a.webp',
  ])('приймає %s', (value) => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test';
    expect(isAllowedAvatarUrl(value)).toBe(true);
  });

  it.each([
    ['зовнішня адреса', 'https://example.test/a.png'],
    ['Google-аватар', 'https://lh3.googleusercontent.com/a/olena'],
    ['відносний шлях із «..»', 'uploads/avatars/custom/../../../.env'],
    ['«..» у типовому каталозі', '/uploads/avatars/default/../custom/x.webp'],
    ['ім\'я файлу з крапки', '/uploads/avatars/default/.hidden'],
    ['вкладений каталог', '/uploads/avatars/default/sub/a.webp'],
    ['каталог власних файлів', '/uploads/avatars/custom/x.webp'],
    ['порожній рядок', ''],
    ['число', 123],
    ['null', null],
    ['undefined', undefined],
    ['масив', ['/uploads/avatars/default/a1.webp']],
    ['Cloudinary іншого акаунта', 'https://res.cloudinary.com/other/image/upload/a.webp'],
    ['Cloudinary без https', 'http://res.cloudinary.com/test/image/upload/a.webp'],
    ['хост, що лише починається як Cloudinary', 'https://res.cloudinary.com.evil.test/test/a.webp'],
    ['Cloudinary із «..»', 'https://res.cloudinary.com/test/../other/a.webp'],
    ['адреса з логіном у хості', 'https://res.cloudinary.com@evil.test/test/a.webp'],
  ])('відхиляє: %s', (_label, value) => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test';
    expect(isAllowedAvatarUrl(value)).toBe(false);
  });

  it('без CLOUDINARY_CLOUD_NAME ресурси Cloudinary не приймаються, типові аватари — так', () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    expect(isAllowedAvatarUrl('https://res.cloudinary.com/test/image/upload/a.webp')).toBe(false);
    expect(isAllowedAvatarUrl('/uploads/avatars/default/a1.webp')).toBe(true);
  });
});

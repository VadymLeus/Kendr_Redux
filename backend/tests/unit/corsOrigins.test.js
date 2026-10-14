// backend/tests/unit/corsOrigins.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildAllowedOrigins, DEV_ORIGIN } = require('../../config/corsOrigins');

describe('buildAllowedOrigins (D-CFG-02)', () => {
  it('без змінних лишається лише адреса сервера розробки', () => {
    expect(buildAllowedOrigins({})).toEqual([DEV_ORIGIN]);
    expect(DEV_ORIGIN).toBe('http://localhost:5173');
  });

  it('адреси розгортання в коді не зашито', () => {
    const origins = buildAllowedOrigins({});
    expect(origins.join(' ')).not.toMatch(/vercel|onrender/);
  });

  it('CLIENT_URL додається до переліку', () => {
    expect(buildAllowedOrigins({ CLIENT_URL: 'https://kendr.example.com' })).toEqual([DEV_ORIGIN, 'https://kendr.example.com']);
  });

  it('CORS_ORIGINS приймає кілька адрес через кому, пробіли ігноруються', () => {
    const origins = buildAllowedOrigins({ CORS_ORIGINS: ' https://a.example.com , https://b.example.com,, ' });
    expect(origins).toEqual([DEV_ORIGIN, 'https://a.example.com', 'https://b.example.com']);
  });

  it('кінцевий слеш прибирається, бо браузер надсилає origin без нього', () => {
    expect(buildAllowedOrigins({ CLIENT_URL: 'https://kendr.example.com/' })).toEqual([DEV_ORIGIN, 'https://kendr.example.com']);
  });

  it('повтори не потрапляють у перелік двічі', () => {
    const origins = buildAllowedOrigins({ CLIENT_URL: DEV_ORIGIN, CORS_ORIGINS: `${DEV_ORIGIN},https://a.example.com` });
    expect(origins).toEqual([DEV_ORIGIN, 'https://a.example.com']);
  });

  it('читає process.env, коли env не передано', () => {
    const saved = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = 'https://env.example.com';
    try {
      expect(buildAllowedOrigins()).toContain('https://env.example.com');
    } finally {
      if (saved === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = saved;
    }
  });
});

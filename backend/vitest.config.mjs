// backend/vitest.config.mjs
import { defineConfig } from 'vitest/config';
import { testEnv } from './tests/helpers/testEnv.mjs';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Змінні середовища виставляються до завантаження застосунку (config/db.js, encryption.js читають їх при імпорті).
    env: testEnv,
    // Схема БД застосовується один раз перед усіма тестами.
    globalSetup: ['./tests/helpers/globalSetup.mjs'],
    // Усі файли працюють з однією БД, тому виконуються послідовно.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 90000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['app.js', 'config/**', 'controllers/**', 'middleware/**', 'models/**', 'routes/**', 'utils/**'],
    },
  },
});

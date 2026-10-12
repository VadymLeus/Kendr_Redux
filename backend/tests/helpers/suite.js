// backend/tests/helpers/suite.js
import { afterAll, beforeEach } from 'vitest';
import { resetDb, closeDb } from './testDb.js';
import { closeApp } from './app.js';

// Викликається на верхньому рівні тестового файлу: чиста БД перед кожним тестом, закриті з'єднання в кінці.
export function useTestDatabase() {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await closeApp();
    await closeDb();
  });
}

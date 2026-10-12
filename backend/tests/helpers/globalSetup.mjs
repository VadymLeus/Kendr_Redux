// backend/tests/helpers/globalSetup.mjs
// Виконується один раз перед усіма тестами: чекає на MySQL, перестворює базу kendr_test зі схеми проєкту.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { testEnv, assertTestDatabase } from './testEnv.mjs';

const SCHEMA_PATH = fileURLToPath(new URL('../../../db/schema.sql', import.meta.url));

async function connectWithRetry(config, attempts = 90) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await mysql.createConnection(config);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(
    `Тестова MySQL недоступна на ${config.host}:${config.port}. Запустіть "docker compose up -d" ` +
    `у корені репозиторію й дочекайтеся статусу healthy.\n${lastError && lastError.message}`
  );
}

export default async function setup() {
  Object.assign(process.env, testEnv);
  assertTestDatabase(process.env);

  const connection = await connectWithRetry({
    host: testEnv.DB_HOST,
    port: Number(testEnv.DB_PORT),
    user: testEnv.DB_USER,
    password: testEnv.DB_PASSWORD,
    charset: 'utf8mb4',
    multipleStatements: true,
  });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${testEnv.DB_NAME}\``);
    // schema.sql створює й вибирає базу KendrDB; у тестовому контейнері вона називається kendr_test.
    const sql = readFileSync(SCHEMA_PATH, 'utf8').replace(/KendrDB/g, testEnv.DB_NAME);
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

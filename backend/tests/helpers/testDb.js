// backend/tests/helpers/testDb.js
import mysql from 'mysql2/promise';
import { assertTestDatabase } from './testEnv.mjs';

let pool;

export function getPool() {
  assertTestDatabase(process.env);
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: 'utf8mb4',
      connectionLimit: 5,
    });
  }
  return pool;
}

// Виконує SQL і повертає рядки (SELECT) або ResultSetHeader (INSERT/UPDATE/DELETE).
export async function query(sql, params = []) {
  const [result] = await getPool().query(sql, params);
  return result;
}

// Очищає всі таблиці й повертає єдиний рядок global_settings, який очікує застосунок.
export async function resetDb() {
  assertTestDatabase(process.env);
  const tables = await query(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`
  );
  const connection = await getPool().getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) {
      await connection.query(`DELETE FROM \`${name}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.query('INSERT INTO global_settings (id) VALUES (1)');
  } finally {
    connection.release();
  }
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

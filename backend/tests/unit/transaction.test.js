// backend/tests/unit/transaction.test.js
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { appPool } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { createUser, getUser } from '../helpers/factories.js';

const require = createRequire(import.meta.url);
const { makeWithTransaction } = require('../../config/transaction');
function fakePool({ failOn } = {}) {
  const log = [];
  const step = (name) => vi.fn(async () => {
    log.push(name);
    if (failOn === name) throw new Error(`${name} failed`);
  });
  const connection = {
    beginTransaction: step('begin'),
    commit: step('commit'),
    rollback: step('rollback'),
    release: vi.fn(() => { log.push('release'); }),
  };
  const pool = { getConnection: vi.fn(async () => { log.push('getConnection'); return connection; }) };
  return { pool, connection, log };
}

describe('makeWithTransaction (підроблений пул)', () => {
  it('успіх: getConnection → begin → work → commit → release, результат work повертається', async () => {
    const { pool, connection, log } = fakePool();
    const work = vi.fn(async () => { log.push('work'); return 42; });

    const result = await makeWithTransaction(pool)(work);

    expect(result).toBe(42);
    expect(log).toEqual(['getConnection', 'begin', 'work', 'commit', 'release']);
    expect(work).toHaveBeenCalledWith(connection);
  });

  it('помилка в work: rollback, release, та сама помилка, commit не викликається', async () => {
    const { pool, connection, log } = fakePool();
    const boom = new Error('boom');

    await expect(makeWithTransaction(pool)(async () => { log.push('work'); throw boom; })).rejects.toBe(boom);

    expect(log).toEqual(['getConnection', 'begin', 'work', 'rollback', 'release']);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('збій commit: виконується rollback, помилка commit передається далі, з\'єднання повертається', async () => {
    const { pool, log } = fakePool({ failOn: 'commit' });

    await expect(makeWithTransaction(pool)(async () => 1)).rejects.toThrow('commit failed');

    expect(log).toEqual(['getConnection', 'begin', 'commit', 'rollback', 'release']);
  });

  it('збій beginTransaction: rollback, release, помилка begin', async () => {
    const { pool, log } = fakePool({ failOn: 'begin' });
    const work = vi.fn();

    await expect(makeWithTransaction(pool)(work)).rejects.toThrow('begin failed');

    expect(work).not.toHaveBeenCalled();
    expect(log).toEqual(['getConnection', 'begin', 'rollback', 'release']);
  });

  it('збій rollback не приховує першопричину і не залишає з\'єднання', async () => {
    const { pool, connection } = fakePool({ failOn: 'rollback' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('boom');

    try {
      await expect(makeWithTransaction(pool)(async () => { throw boom; })).rejects.toBe(boom);
      expect(connection.release).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('якщо з\'єднання не отримано, помилка передається далі, release не викликається', async () => {
    const pool = { getConnection: vi.fn(async () => { throw new Error('pool exhausted'); }) };

    await expect(makeWithTransaction(pool)(async () => 1)).rejects.toThrow('pool exhausted');
  });
});

describe('pool.withTransaction (тестова БД)', () => {
  useTestDatabase();

  it('config/db.js додає withTransaction до пулу', () => {
    expect(typeof appPool.withTransaction).toBe('function');
  });

  it('зміни фіксуються, якщо work завершився без помилки', async () => {
    const user = await createUser({ username: 'before' });

    const result = await appPool.withTransaction(async (connection) => {
      await connection.query('UPDATE users SET username = ? WHERE id = ?', ['after', user.id]);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect((await getUser(user.id)).username).toBe('after');
  });

  it('зміни відкочуються, якщо work кинув помилку', async () => {
    const user = await createUser({ username: 'before' });

    await expect(appPool.withTransaction(async (connection) => {
      await connection.query('UPDATE users SET username = ? WHERE id = ?', ['after', user.id]);
      throw new Error('abort');
    })).rejects.toThrow('abort');

    expect((await getUser(user.id)).username).toBe('before');
  });

  it('помилка SQL усередині work відкочує попередні запити транзакції', async () => {
    const user = await createUser({ username: 'before' });

    await expect(appPool.withTransaction(async (connection) => {
      await connection.query('UPDATE users SET username = ? WHERE id = ?', ['after', user.id]);
      await connection.query('SELECT * FROM table_that_does_not_exist');
    })).rejects.toThrow();

    expect((await getUser(user.id)).username).toBe('before');
  });

  it('з\'єднання повертається в пул: серія викликів понад розмір пулу не зависає', async () => {
    for (let i = 0; i < 25; i += 1) {
      await appPool.withTransaction(async (connection) => { await connection.query('SELECT 1'); });
    }
    const [rows] = await appPool.query('SELECT 1 AS ok');
    expect(rows[0].ok).toBe(1);
  });
});

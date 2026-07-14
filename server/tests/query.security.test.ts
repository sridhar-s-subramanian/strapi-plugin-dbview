import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, rejected, type Harness } from './helpers/harness';

/**
 * Adversarial suite. Every test here asserts that something which is NOT a
 * plain SELECT — or which tries to reach a protected table by some evasion —
 * is rejected before it touches the database. The guarantee under test:
 * only read-only SELECT/WITH…SELECT statements against allowed tables run.
 */
let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.destroy();
});

const run = (sql: string, limit = 100) => h.service.executeQuery(sql, limit, 1);

describe('only SELECT may run — write/DDL statements', () => {
  it.each([
    ['INSERT', "INSERT INTO users (name) VALUES ('x')"],
    ['UPDATE', "UPDATE users SET name = 'x'"],
    ['DELETE', 'DELETE FROM users'],
    ['REPLACE', "REPLACE INTO users (id, name) VALUES (1, 'x')"],
    ['DROP', 'DROP TABLE users'],
    ['CREATE', 'CREATE TABLE evil (id INT)'],
    ['ALTER', 'ALTER TABLE users ADD COLUMN x INT'],
    ['TRUNCATE', 'TRUNCATE TABLE users'],
    ['ATTACH', "ATTACH DATABASE '/tmp/x.db' AS x"],
    ['PRAGMA', 'PRAGMA table_info(users)'],
    ['VACUUM', 'VACUUM'],
  ])('rejects %s', async (_l, sql) => {
    expect(rejected(await run(sql))).toBe(true);
  });
});

describe('only SELECT may run — non-SELECT read forms are rejected too', () => {
  it.each([
    ['VALUES', 'VALUES (1), (2)'],
    ['TABLE shorthand', 'TABLE users'],
    ['SHOW', 'SHOW TABLES'],
    ['EXPLAIN typed by user', 'EXPLAIN SELECT * FROM users'],
  ])('rejects %s', async (_l, sql) => {
    expect(rejected(await run(sql))).toBe(true);
  });
});

describe('write smuggled inside a CTE', () => {
  it.each([
    ['DELETE…RETURNING', 'WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x'],
    ['INSERT…RETURNING', "WITH x AS (INSERT INTO users(name) VALUES('x') RETURNING *) SELECT * FROM x"],
    ['UPDATE…RETURNING', "WITH x AS (UPDATE users SET name='x' RETURNING *) SELECT * FROM x"],
  ])('rejects %s', async (_l, sql) => {
    expect(rejected(await run(sql))).toBe(true);
  });
});

describe('file / OS access functions', () => {
  it.each([
    ['LOAD_FILE', "SELECT LOAD_FILE('/etc/passwd')"],
    ['INTO OUTFILE', "SELECT * FROM users INTO OUTFILE '/tmp/x'"],
    ['INTO DUMPFILE', "SELECT * FROM users INTO DUMPFILE '/tmp/x'"],
    ['xp_cmdshell', "SELECT xp_cmdshell('whoami')"],
    ['pg_read_file', "SELECT pg_read_file('/etc/passwd')"],
  ])('rejects %s', async (_l, sql) => {
    expect(rejected(await run(sql))).toBe(true);
  });
});

describe('time-based / DoS functions', () => {
  it.each([
    ['SLEEP', 'SELECT SLEEP(5)'],
    ['pg_sleep', 'SELECT pg_sleep(5)'],
    ['BENCHMARK', "SELECT BENCHMARK(100000000, MD5('a'))"],
  ])('rejects %s', async (_l, sql) => {
    expect(rejected(await run(sql))).toBe(true);
  });
});

describe('locking reads that imply write intent', () => {
  it.each([
    ['FOR UPDATE', 'SELECT * FROM users FOR UPDATE'],
    ['SELECT INTO', 'SELECT * INTO backup FROM users'],
  ])('rejects %s', async (_l, sql) => {
    expect(rejected(await run(sql))).toBe(true);
  });
});

describe('stacked statements', () => {
  it.each([
    'SELECT 1; DROP TABLE users',
    "SELECT * FROM users; DELETE FROM users",
    'SELECT 1; SELECT 2',
  ])('rejects %s', async (sql) => {
    expect(rejected(await run(sql))).toBe(true);
  });

  it('leaves data intact after a stacked DELETE attempt', async () => {
    await run('SELECT 1; DELETE FROM users');
    const [{ c }] = await h.db('users').count({ c: '*' });
    expect(Number(c)).toBe(10);
  });
});

describe('comment / whitespace obfuscation', () => {
  it.each([
    ['inline comment split', 'DR/**/OP TABLE users'],
    ['MySQL executable comment', 'SELECT 1 /*! ; DROP TABLE users */'],
    ['keyword after string', "SELECT 'x' FROM users; DROP TABLE users"],
  ])('rejects %s', async (_l, sql) => {
    expect(rejected(await run(sql))).toBe(true);
  });
});

describe('deny-list cannot be evaded', () => {
  it('rejects direct access to admin_users', async () => {
    expect(rejected(await run('SELECT * FROM admin_users'))).toBe(true);
  });

  it('rejects admin_users via UNION', async () => {
    expect(rejected(await run('SELECT id FROM users UNION SELECT id FROM admin_users'))).toBe(true);
  });

  it('rejects admin_users behind a CTE alias', async () => {
    expect(rejected(await run('WITH s AS (SELECT * FROM admin_users) SELECT * FROM s'))).toBe(true);
  });

  it('rejects admin_users by case variation', async () => {
    expect(rejected(await run('SELECT * FROM ADMIN_USERS'))).toBe(true);
  });

  // These parse-defeating forms are valid SQLite that reads admin_users. If the
  // AST parser cannot confirm the statement is a scoped SELECT, it must fail
  // closed — otherwise the deny list (which runs on parsed tables) is skipped.
  it.each([
    ['NOTNULL postfix', 'SELECT * FROM admin_users WHERE id NOTNULL'],
    ['ISNULL postfix', 'SELECT * FROM admin_users WHERE id ISNULL'],
    ['MATCH operator', "SELECT * FROM admin_users WHERE email MATCH 'x'"],
  ])('fails closed on parser-defeating read: %s', async (_l, sql) => {
    const r = await run(sql);
    expect(rejected(r)).toBe(true);
  });

  it('does not leak admin_users rows through any parser-defeating form', async () => {
    for (const sql of [
      'SELECT * FROM admin_users WHERE id NOTNULL',
      'SELECT * FROM admin_users WHERE id ISNULL',
    ]) {
      const r = await run(sql);
      if (!rejected(r)) {
        const leaked = JSON.stringify(r.data.rows);
        expect(leaked).not.toContain('root@example.com');
      }
    }
  });
});

describe('wrapper robustness', () => {
  it('a trailing line comment cannot break the LIMIT wrapper', async () => {
    // Must still return rows, not error, and must still be limited.
    const r = await run('SELECT * FROM users -- trailing', 3);
    expect(rejected(r)).toBe(false);
    if (!rejected(r)) expect(r.data.rowCount).toBe(3);
  });

  it('a trailing block comment cannot break the wrapper', async () => {
    const r = await run('SELECT * FROM users /* trailing */', 3);
    expect(rejected(r)).toBe(false);
  });
});

describe('sensitive column references cannot bypass redaction', () => {
  it.each([
    ['alias', 'SELECT password AS pwd FROM users'],
    ['expression', "SELECT password || '' AS x FROM users"],
    ['function', 'SELECT substr(password, 1, 3) FROM users'],
    ['WHERE', 'SELECT id FROM users WHERE api_token = \'tok0\''],
    ['CTE', 'WITH x AS (SELECT password AS p FROM users) SELECT p FROM x'],
    ['subquery', 'SELECT p FROM (SELECT password AS p FROM users) s'],
  ])('rejects %s exfiltration', async (_label, sql) => {
    const r = await run(sql);
    expect(rejected(r)).toBe(true);
    if (rejected(r)) expect(r.reason).toMatch(/sensitive/i);
    expect(JSON.stringify(r)).not.toMatch(/secret\d/);
    expect(JSON.stringify(r)).not.toMatch(/tok\d/);
  });

  it('SELECT * still returns rows with sensitive values masked', async () => {
    const r = await run('SELECT * FROM users', 1);
    expect(rejected(r)).toBe(false);
    if (rejected(r)) return;
    expect(r.data.rows[0].password).toBe('[REDACTED]');
    expect(r.data.rows[0].api_token).toBe('[REDACTED]');
    expect(r.data.rows[0].name).toBe('user0');
  });
});

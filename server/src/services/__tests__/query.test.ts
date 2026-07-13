import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import knexFactory, { type Knex } from 'knex';
import type { Core } from '@strapi/strapi';
import createQueryService from '../query';

/** Config the fake plugin hands back; individual tests can override these. */
const config: Record<string, unknown> = {
  defaultRowLimit: 100,
  maxRowLimit: 500,
  denyList: [],
  redactedColumnPatterns: ['password', '*_token', '*_secret'],
  queryTimeoutSeconds: 15,
};

let db: Knex;
let service: ReturnType<typeof createQueryService>;

/**
 * A minimal stand-in for the Strapi runtime: just enough surface for the query
 * service (config, the Knex connection, the schema service, and the logger).
 */
function fakeStrapi(): Core.Strapi {
  return {
    db: { connection: db },
    log: { debug() {}, warn() {}, info() {}, error() {} },
    plugin: () => ({
      config: (key: string) => config[key],
      service: () => ({
        listTableNames: async () => {
          const rows = await db.raw(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
          );
          return (rows as Array<{ name: string }>).map((r) => r.name);
        },
      }),
    }),
  } as unknown as Core.Strapi;
}

beforeAll(async () => {
  db = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });

  await db.schema.createTable('users', (t) => {
    t.increments('id');
    t.string('name');
    t.string('password');
    t.string('api_token');
  });

  await db.schema.createTable('admin_users', (t) => {
    t.increments('id');
    t.string('email');
  });

  await db('users').insert(
    Array.from({ length: 10 }, (_, i) => ({
      name: `user${i}`,
      password: `secret${i}`,
      api_token: `tok${i}`,
    }))
  );
  await db('admin_users').insert({ email: 'root@example.com' });

  service = createQueryService({ strapi: fakeStrapi() });
});

afterAll(async () => {
  await db.destroy();
});

const rejected = (r: unknown): r is { rejected: true; reason: string } =>
  typeof r === 'object' && r !== null && 'rejected' in r;

describe('executeQuery — valid reads', () => {
  it('returns rows for a plain SELECT', async () => {
    const r = await service.executeQuery('SELECT * FROM users', 100, 1);
    expect(rejected(r)).toBe(false);
    if (rejected(r)) return;
    expect(r.data.rowCount).toBe(10);
    expect(r.data.columns).toEqual(expect.arrayContaining(['id', 'name']));
  });

  it('supports a WITH…SELECT CTE', async () => {
    const r = await service.executeQuery('WITH c AS (SELECT * FROM users) SELECT * FROM c', 100, 1);
    expect(rejected(r)).toBe(false);
  });
});

describe('executeQuery — write attempts are rejected', () => {
  it.each([
    ['UPDATE', "UPDATE users SET name = 'x'"],
    ['DELETE', 'DELETE FROM users'],
    ['INSERT', "INSERT INTO users (name) VALUES ('x')"],
    ['DROP', 'DROP TABLE users'],
    ['ALTER', 'ALTER TABLE users ADD COLUMN x INT'],
  ])('rejects %s', async (_label, sql) => {
    const r = await service.executeQuery(sql, 100, 1);
    expect(rejected(r)).toBe(true);
  });

  it('leaves the data untouched after a rejected write', async () => {
    await service.executeQuery("UPDATE users SET name = 'hacked'", 100, 1);
    const [{ c }] = await db('users').where({ name: 'hacked' }).count({ c: '*' });
    expect(Number(c)).toBe(0);
  });
});

describe('executeQuery — table scope (layer 2)', () => {
  it('rejects a deny-listed table', async () => {
    const r = await service.executeQuery('SELECT * FROM admin_users', 100, 1);
    expect(rejected(r)).toBe(true);
    if (rejected(r)) expect(r.reason).toMatch(/not accessible/i);
  });

  it('rejects a deny-listed table reached through UNION', async () => {
    const r = await service.executeQuery(
      'SELECT id FROM users UNION SELECT id FROM admin_users',
      100,
      1
    );
    expect(rejected(r)).toBe(true);
  });

  it('rejects a deny-listed table hidden behind a CTE alias', async () => {
    const r = await service.executeQuery(
      'WITH safe AS (SELECT * FROM admin_users) SELECT * FROM safe',
      100,
      1
    );
    expect(rejected(r)).toBe(true);
  });

  it('rejects a table that does not exist', async () => {
    const r = await service.executeQuery('SELECT * FROM nope', 100, 1);
    expect(rejected(r)).toBe(true);
  });

  it('honours a user-supplied deny list entry', async () => {
    config.denyList = ['users'];
    const r = await service.executeQuery('SELECT * FROM users', 100, 1);
    config.denyList = [];
    expect(rejected(r)).toBe(true);
  });
});

describe('executeQuery — enforced LIMIT (layer 3)', () => {
  it('caps rows at the requested limit', async () => {
    const r = await service.executeQuery('SELECT * FROM users', 3, 1);
    if (rejected(r)) throw new Error('unexpectedly rejected');
    expect(r.data.rowCount).toBe(3);
    expect(r.data.truncated).toBe(true);
  });

  it('clamps a limit above maxRowLimit instead of honouring it', async () => {
    const r = await service.executeQuery('SELECT * FROM users', 100_000, 1);
    if (rejected(r)) throw new Error('unexpectedly rejected');
    // Clamped to maxRowLimit (500); only 10 rows exist, so all come back.
    expect(r.data.rowCount).toBe(10);
    expect(r.data.truncated).toBe(false);
  });

  it("overrides a user's own larger LIMIT clause", async () => {
    const r = await service.executeQuery('SELECT * FROM users LIMIT 10', 2, 1);
    if (rejected(r)) throw new Error('unexpectedly rejected');
    expect(r.data.rowCount).toBe(2);
  });
});

describe('executeQuery — redaction', () => {
  it('masks columns matching the redaction patterns', async () => {
    const r = await service.executeQuery('SELECT * FROM users', 1, 1);
    if (rejected(r)) throw new Error('unexpectedly rejected');

    const row = r.data.rows[0];
    expect(row.password).toBe('[REDACTED]');
    expect(row.api_token).toBe('[REDACTED]'); // matched by the *_token glob
    expect(row.name).toBe('user0'); // untouched
  });

  it('reports which columns are redacted', () => {
    expect(service.isRedacted('password')).toBe(true);
    expect(service.isRedacted('reset_token')).toBe(true);
    expect(service.isRedacted('name')).toBe(false);
  });
});

describe('explainQuery', () => {
  it('returns a plan for a valid SELECT', async () => {
    const r = await service.explainQuery('SELECT * FROM users', 'explain', 1);
    expect(rejected(r)).toBe(false);
    if (rejected(r)) return;
    expect(r.rows.length).toBeGreaterThan(0);
  });

  it('applies the same security checks as execute', async () => {
    const r = await service.explainQuery('DROP TABLE users', 'explain', 1);
    expect(rejected(r)).toBe(true);
  });

  it('cannot be used to smuggle a write via EXPLAIN', async () => {
    const r = await service.explainQuery("UPDATE users SET name = 'x'", 'explain-analyze', 1);
    expect(rejected(r)).toBe(true);

    const [{ c }] = await db('users').where({ name: 'x' }).count({ c: '*' });
    expect(Number(c)).toBe(0);
  });
});

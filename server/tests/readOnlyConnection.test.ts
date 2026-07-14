import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import knexFactory, { type Knex } from 'knex';
import type { Core } from '@strapi/strapi';
import {
  normalizeReadOnlyConfig,
  buildReadOnlyKnexConfig,
} from '../src/utils/readOnlyConnection';
import createConnectionService from '../src/services/connection';
import createQueryService from '../src/services/query';
import { rejected } from './helpers/harness';

describe('normalizeReadOnlyConfig', () => {
  it('accepts postgres URLs', () => {
    expect(normalizeReadOnlyConfig('postgres://u:p@localhost:5432/db')).toEqual({
      client: 'pg',
      connection: 'postgres://u:p@localhost:5432/db',
    });
    expect(normalizeReadOnlyConfig('postgresql://u@h/db').client).toBe('pg');
  });

  it('accepts mysql URLs', () => {
    expect(normalizeReadOnlyConfig('mysql://u:p@localhost/db').client).toBe('mysql2');
    expect(normalizeReadOnlyConfig('mysql2://u:p@localhost/db').client).toBe('mysql2');
  });

  it('rejects bare names and empty strings', () => {
    expect(() => normalizeReadOnlyConfig('readonly')).toThrow(/URL/i);
    expect(() => normalizeReadOnlyConfig('')).toThrow(/empty/i);
  });

  it('accepts full Knex config objects', () => {
    const cfg = normalizeReadOnlyConfig({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
    });
    expect(cfg.client).toBe('better-sqlite3');
  });

  it('requires client and connection on objects', () => {
    expect(() =>
      normalizeReadOnlyConfig({ client: 'pg' } as { client: string; connection: string })
    ).toThrow(/connection is required/i);
    expect(() =>
      normalizeReadOnlyConfig({ connection: 'x' } as { client: string; connection: string })
    ).toThrow(/client is required/i);
  });

  it('merges conservative pool defaults', () => {
    const cfg = buildReadOnlyKnexConfig({
      client: 'pg',
      connection: 'postgres://u@h/db',
      pool: { max: 2 },
    });
    expect(cfg.pool).toMatchObject({ min: 0, max: 2 });
  });
});

describe('connection service — lifecycle', () => {
  it('uses the default Strapi connection when readOnlyConnection is unset', async () => {
    const defaultDb = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });

    const strapi = {
      db: { connection: defaultDb },
      log: { debug() {}, warn() {}, info() {}, error() {} },
      plugin: () => ({
        config: () => undefined,
      }),
    } as unknown as Core.Strapi;

    const svc = createConnectionService({ strapi });
    await svc.init();

    expect(svc.isUsingReadOnly()).toBe(false);
    expect(svc.getConnectionLabel()).toBe('default');
    expect(svc.getKnex()).toBe(defaultDb);

    await svc.destroy();
    await defaultDb.destroy();
  });

  it('opens a dedicated pool when readOnlyConnection is a Knex config', async () => {
    const defaultDb = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    // Marker only on the default DB — proves queries can use a different pool.
    await defaultDb.schema.createTable('only_on_default', (t) => {
      t.increments('id');
    });

    const roConfig = {
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    };

    const strapi = {
      db: { connection: defaultDb },
      log: { debug() {}, warn() {}, info() {}, error() {} },
      plugin: () => ({
        config: (key: string) => (key === 'readOnlyConnection' ? roConfig : undefined),
      }),
    } as unknown as Core.Strapi;

    const svc = createConnectionService({ strapi });
    await svc.init();

    expect(svc.isUsingReadOnly()).toBe(true);
    expect(svc.getConnectionLabel()).toBe('read-only');
    expect(svc.getKnex()).not.toBe(defaultDb);

    // Seed the RO pool and confirm the default marker is not visible there.
    const ro = svc.getKnex();
    await ro.schema.createTable('only_on_ro', (t) => {
      t.increments('id');
    });
    const roTables = await ro.raw(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const names = (roTables as Array<{ name: string }>).map((r) => r.name);
    expect(names).toContain('only_on_ro');
    expect(names).not.toContain('only_on_default');

    await svc.destroy();
    await defaultDb.destroy();
  });

  it('fails closed when the RO database is unreachable', async () => {
    const defaultDb = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });

    const strapi = {
      db: { connection: defaultDb },
      log: { debug() {}, warn() {}, info() {}, error() {} },
      plugin: () => ({
        config: () => ({
          // Unknown dialect → Knex fails when creating/using the pool
          client: 'dbview-not-a-real-dialect',
          connection: { host: '127.0.0.1' },
        }),
      }),
    } as unknown as Core.Strapi;

    const svc = createConnectionService({ strapi });
    await expect(svc.init()).rejects.toThrow(/readOnlyConnection|failed|unreachable/i);
    expect(svc.isUsingReadOnly()).toBe(false);

    await defaultDb.destroy();
  });
});

describe('query service uses the connection service pool', () => {
  let defaultDb: Knex;
  let roDb: Knex;
  let service: ReturnType<typeof createQueryService>;

  beforeAll(async () => {
    defaultDb = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    roDb = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });

    await defaultDb.schema.createTable('users', (t) => {
      t.increments('id');
      t.string('name');
    });
    await defaultDb('users').insert({ name: 'default-only' });

    await roDb.schema.createTable('users', (t) => {
      t.increments('id');
      t.string('name');
    });
    await roDb('users').insert({ name: 'readonly-row' });

    const config: Record<string, unknown> = {
      defaultRowLimit: 100,
      maxRowLimit: 500,
      denyList: [],
      redactedColumnPatterns: ['password', '*_token'],
      queryTimeoutSeconds: 15,
    };

    const strapi = {
      db: { connection: defaultDb },
      log: { debug() {}, warn() {}, info() {}, error() {} },
      plugin: () => ({
        config: (key: string) => config[key],
        service: (name: string) => {
          if (name === 'connection') {
            return {
              getKnex: () => roDb,
              getConnectionLabel: () => 'read-only',
              isUsingReadOnly: () => true,
            };
          }
          return {
            listTableNames: async () => {
              const rows = await roDb.raw(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
              );
              return (rows as Array<{ name: string }>).map((r) => r.name);
            },
          };
        },
      }),
    } as unknown as Core.Strapi;

    service = createQueryService({ strapi });
  });

  afterAll(async () => {
    await defaultDb.destroy();
    await roDb.destroy();
  });

  it('reads from the RO pool, not the default Strapi connection', async () => {
    const r = await service.executeQuery('SELECT name FROM users', 10, 1, 'client-said-default');
    expect(rejected(r)).toBe(false);
    if (rejected(r)) return;
    expect(r.data.rows.map((row) => row.name)).toEqual(['readonly-row']);
    expect(r.data.rows.map((row) => row.name)).not.toContain('default-only');
  });
});

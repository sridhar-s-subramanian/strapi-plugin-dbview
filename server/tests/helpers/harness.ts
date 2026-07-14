import knexFactory, { type Knex } from 'knex';
import type { Core } from '@strapi/strapi';
import createQueryService from '../../src/services/query';

export interface HarnessConfig {
  defaultRowLimit: number;
  maxRowLimit: number;
  denyList: string[];
  redactedColumnPatterns: string[];
  queryTimeoutSeconds: number;
}

export interface Harness {
  db: Knex;
  service: ReturnType<typeof createQueryService>;
  config: HarnessConfig;
  destroy: () => Promise<void>;
}

const rejectedGuard = (r: unknown): r is { rejected: true; reason: string } =>
  typeof r === 'object' && r !== null && 'rejected' in r && (r as { rejected: unknown }).rejected === true;

export const rejected = rejectedGuard;

/**
 * Build an in-memory SQLite database plus the real query service wired to a
 * minimal fake Strapi. Seeds a readable `users` table (with sensitive columns)
 * and a `admin_users` table that must never be reachable.
 */
export async function createHarness(overrides: Partial<HarnessConfig> = {}): Promise<Harness> {
  const config: HarnessConfig = {
    defaultRowLimit: 100,
    maxRowLimit: 500,
    denyList: [],
    redactedColumnPatterns: ['password', '*_token', '*_secret'],
    queryTimeoutSeconds: 15,
    ...overrides,
  };

  const db = knexFactory({
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
    t.string('password');
  });

  await db('users').insert(
    Array.from({ length: 10 }, (_, i) => ({
      name: `user${i}`,
      password: `secret${i}`,
      api_token: `tok${i}`,
    }))
  );
  await db('admin_users').insert({ email: 'root@example.com', password: 'toor' });

  const strapi = {
    db: { connection: db },
    log: { debug() {}, warn() {}, info() {}, error() {} },
    plugin: () => ({
      config: (key: string) => (config as unknown as Record<string, unknown>)[key],
      service: (name: string) => {
        if (name === 'connection') {
          return {
            getKnex: () => db,
            getConnectionLabel: () => 'default',
            isUsingReadOnly: () => false,
            init: async () => {},
            destroy: async () => {},
          };
        }
        return {
          listTableNames: async () => {
            const rows = await db.raw(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            );
            return (rows as Array<{ name: string }>).map((r) => r.name);
          },
        };
      },
    }),
  } as unknown as Core.Strapi;

  const service = createQueryService({ strapi });

  return { db, service, config, destroy: () => db.destroy() };
}

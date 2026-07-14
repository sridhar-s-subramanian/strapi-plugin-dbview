import type { Knex } from 'knex';
import type { ReadOnlyConnectionConfig } from '../types';

/**
 * Normalize plugin config into a Knex config object.
 *
 * Supported forms:
 * - Knex config: `{ client, connection, pool?, ... }`
 * - Connection URL string: `postgres://…`, `postgresql://…`, `mysql://…`, `mysql2://…`
 */
export function normalizeReadOnlyConfig(input: ReadOnlyConnectionConfig): Knex.Config {
  if (typeof input === 'string') {
    const url = input.trim();
    if (!url) {
      throw new Error('strapi-dbview: readOnlyConnection string must not be empty');
    }

    const lower = url.toLowerCase();
    if (lower.startsWith('postgres://') || lower.startsWith('postgresql://')) {
      return { client: 'pg', connection: url };
    }
    if (lower.startsWith('mysql://') || lower.startsWith('mysql2://')) {
      return { client: 'mysql2', connection: url };
    }

    throw new Error(
      'strapi-dbview: readOnlyConnection string must be a postgres://, postgresql://, mysql://, or mysql2:// URL. ' +
        'For SQLite or custom clients, pass a full Knex config object: { client, connection }.'
    );
  }

  if (!input || typeof input !== 'object') {
    throw new Error('strapi-dbview: readOnlyConnection must be a connection URL string or a Knex config object');
  }

  const client = input.client;
  const connection = input.connection;

  if (!client || typeof client !== 'string') {
    throw new Error('strapi-dbview: readOnlyConnection.client is required (e.g. "pg", "mysql2", "better-sqlite3")');
  }
  if (connection === undefined || connection === null || connection === '') {
    throw new Error('strapi-dbview: readOnlyConnection.connection is required');
  }

  return { ...input, client, connection };
}

/** Build a Knex config with conservative pool defaults (overridable by the user). */
export function buildReadOnlyKnexConfig(input: ReadOnlyConnectionConfig): Knex.Config {
  const normalized = normalizeReadOnlyConfig(input);
  const userPool = (normalized.pool ?? {}) as Record<string, unknown>;

  return {
    ...normalized,
    pool: {
      min: 0,
      max: 5,
      ...userPool,
    },
  };
}

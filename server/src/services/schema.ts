import type { Core } from '@strapi/strapi';
import type { Knex } from 'knex';
import type { ColumnInfo, IndexInfo, TableInfo, TableStructure } from '../types';
import { BUILT_IN_DENY_LIST } from '../config';
import { matchesAnyPattern } from './redact';

let tableNameCache: { names: string[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

function getPluginKnex(strapi: Core.Strapi): Knex {
  const connection = strapi.plugin('strapi-dbview').service('connection') as {
    getKnex(): Knex;
  };
  return connection.getKnex();
}

type Dialect = 'pg' | 'mysql' | 'sqlite';

function getDialect(knex: Knex): Dialect {
  const client = (knex.client as { config?: { client?: string }; driverName?: string });
  const raw = String(client?.config?.client ?? client?.driverName ?? '').toLowerCase();

  if (raw.includes('pg') || raw.includes('postgres')) return 'pg';
  if (raw.includes('mysql') || raw.includes('maria')) return 'mysql';
  return 'sqlite';
}

function getDatabaseName(knex: Knex): string {
  const conn = (knex.client as { config?: { connection?: { database?: string } } })?.config?.connection;
  return conn?.database ?? '';
}

async function fetchRawTableNames(knex: Knex, dialect: Dialect): Promise<string[]> {
  if (dialect === 'pg') {
    const result = await knex.raw<{ rows: Array<{ tablename: string }> }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    return result.rows.map((r) => r.tablename);
  }

  if (dialect === 'mysql') {
    const db = getDatabaseName(knex);
    const result = await knex.raw<[Array<{ TABLE_NAME: string }>]>(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
      [db]
    );
    return result[0].map((r) => r.TABLE_NAME);
  }

  // SQLite
  const result = await knex.raw<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  // better-sqlite3 returns array directly; sqlite3 returns array in result[0]
  const rows = Array.isArray(result) ? result : (result as { rows?: Array<{ name: string }> }).rows ?? [];
  return rows.map((r) => r.name);
}

function getDenySet(strapi: Core.Strapi): Set<string> {
  const userDeny = (strapi.plugin('strapi-dbview').config('denyList') as string[]) ?? [];
  return new Set([...BUILT_IN_DENY_LIST, ...userDeny].map((t) => t.toLowerCase()));
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * List all table names that are:
   *  - present in the database
   *  - not on the built-in or user-configured deny list
   *
   * Result is cached for 5 seconds to avoid repeated schema queries on every
   * incoming SQL submission (Layer 2 scope check).
   */
  async listTableNames(): Promise<string[]> {
    if (tableNameCache && Date.now() < tableNameCache.expiresAt) {
      return tableNameCache.names;
    }

    const knex = getPluginKnex(strapi);
    const dialect = getDialect(knex);
    const denySet = getDenySet(strapi);
    const raw = await fetchRawTableNames(knex, dialect);
    const names = raw.filter((t) => !denySet.has(t.toLowerCase()));

    tableNameCache = { names, expiresAt: Date.now() + CACHE_TTL_MS };
    return names;
  },

  /** Invalidate the table name cache (called on bootstrap and after schema changes). */
  invalidateCache() {
    tableNameCache = null;
  },

  /** Lightweight summary list for the sidebar. */
  async listTables(): Promise<TableInfo[]> {
    const names = await this.listTableNames();
    return names.map((name) => ({ name, rowCount: null, columnCount: 0 }));
  },

  /** Full column + index introspection for a single table. */
  async getTableStructure(tableName: string): Promise<TableStructure | null> {
    const knex = getPluginKnex(strapi);
    const dialect = getDialect(knex);
    const redactPatterns = (strapi.plugin('strapi-dbview').config('redactedColumnPatterns') as string[]) ?? [];

    // Verify table is accessible
    const allowed = await this.listTableNames();
    if (!allowed.includes(tableName)) return null;

    const columns = await fetchColumns(knex, dialect, tableName, redactPatterns);
    const indexes = await fetchIndexes(knex, dialect, tableName);

    return { table: tableName, columns, indexes };
  },
});

async function fetchColumns(
  knex: Knex,
  dialect: Dialect,
  table: string,
  redactPatterns: string[]
): Promise<ColumnInfo[]> {
  if (dialect === 'pg') {
    const result = await knex.raw<{
      rows: Array<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
        constraint_type: string | null;
        foreign_table_name: string | null;
        foreign_column_name: string | null;
      }>;
    }>(
      `SELECT
         c.column_name,
         c.data_type,
         c.is_nullable,
         c.column_default,
         tc.constraint_type,
         ccu.table_name  AS foreign_table_name,
         ccu.column_name AS foreign_column_name
       FROM information_schema.columns c
       LEFT JOIN information_schema.key_column_usage kcu
         ON kcu.table_name = c.table_name AND kcu.column_name = c.column_name
            AND kcu.table_schema = 'public'
       LEFT JOIN information_schema.table_constraints tc
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = 'public'
       LEFT JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
            AND tc.constraint_type = 'FOREIGN KEY' AND ccu.table_schema = 'public'
       WHERE c.table_name = ? AND c.table_schema = 'public'
       ORDER BY c.ordinal_position`,
      [table]
    );

    return result.rows.map((r) => ({
      name: r.column_name,
      dataType: r.data_type,
      normalizedType: normalizeType(r.data_type),
      isNullable: r.is_nullable === 'YES',
      defaultValue: r.column_default,
      isPrimaryKey: r.constraint_type === 'PRIMARY KEY',
      isSensitive: matchesAnyPattern(r.column_name, redactPatterns),
      foreignKeyTable: r.constraint_type === 'FOREIGN KEY' ? r.foreign_table_name ?? undefined : undefined,
      foreignKeyColumn: r.constraint_type === 'FOREIGN KEY' ? r.foreign_column_name ?? undefined : undefined,
    }));
  }

  if (dialect === 'mysql') {
    const db = getDatabaseName(knex);
    const result = await knex.raw<[Array<{
      COLUMN_NAME: string;
      DATA_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
      COLUMN_KEY: string;
    }>]>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [db, table]
    );

    return result[0].map((r) => ({
      name: r.COLUMN_NAME,
      dataType: r.DATA_TYPE,
      normalizedType: normalizeType(r.DATA_TYPE),
      isNullable: r.IS_NULLABLE === 'YES',
      defaultValue: r.COLUMN_DEFAULT,
      isPrimaryKey: r.COLUMN_KEY === 'PRI',
      isSensitive: matchesAnyPattern(r.COLUMN_NAME, redactPatterns),
    }));
  }

  // SQLite
  const result = await knex.raw<Array<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>>(`PRAGMA table_info(${JSON.stringify(table)})`);

  const rows = Array.isArray(result) ? result : (result as { rows?: typeof result }).rows ?? [];

  return rows.map((r) => ({
    name: r.name,
    dataType: r.type,
    normalizedType: normalizeType(r.type),
    isNullable: r.notnull === 0,
    defaultValue: r.dflt_value,
    isPrimaryKey: r.pk === 1,
    isSensitive: matchesAnyPattern(r.name, redactPatterns),
  }));
}

async function fetchIndexes(knex: Knex, dialect: Dialect, table: string): Promise<IndexInfo[]> {
  try {
    if (dialect === 'pg') {
      const result = await knex.raw<{
        rows: Array<{
          indexname: string;
          indexdef: string;
          indisprimary: boolean;
          indisunique: boolean;
        }>;
      }>(
        `SELECT
           i.relname AS indexname,
           pg_get_indexdef(ix.indexrelid) AS indexdef,
           ix.indisprimary,
           ix.indisunique
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         WHERE t.relname = ?`,
        [table]
      );

      return result.rows.map((r) => {
        const colMatch = r.indexdef.match(/\((.+)\)$/);
        const columns = colMatch ? colMatch[1].split(',').map((c) => c.trim()) : [];
        return {
          name: r.indexname,
          columns,
          isPrimary: r.indisprimary,
          isUnique: r.indisunique,
        };
      });
    }

    if (dialect === 'mysql') {
      const result = await knex.raw<[Array<{
        Key_name: string;
        Column_name: string;
        Non_unique: number;
      }>]>(`SHOW INDEX FROM \`${table}\``);

      const grouped = new Map<string, IndexInfo>();
      for (const r of result[0]) {
        const existing = grouped.get(r.Key_name);
        if (existing) {
          existing.columns.push(r.Column_name);
        } else {
          grouped.set(r.Key_name, {
            name: r.Key_name,
            columns: [r.Column_name],
            isPrimary: r.Key_name === 'PRIMARY',
            isUnique: r.Non_unique === 0,
          });
        }
      }
      return [...grouped.values()];
    }

    // SQLite
    const result = await knex.raw<Array<{
      name: string;
      unique: number;
      origin: string;
    }>>(`PRAGMA index_list(${JSON.stringify(table)})`);

    const rows = Array.isArray(result) ? result : (result as { rows?: typeof result }).rows ?? [];

    return await Promise.all(
      rows.map(async (r) => {
        const infoResult = await knex.raw<Array<{ name: string }>>(
          `PRAGMA index_info(${JSON.stringify(r.name)})`
        );
        const infoRows = Array.isArray(infoResult)
          ? infoResult
          : (infoResult as { rows?: typeof infoResult }).rows ?? [];
        return {
          name: r.name,
          columns: infoRows.map((c) => c.name),
          isPrimary: r.origin === 'pk',
          isUnique: r.unique === 1,
        };
      })
    );
  } catch {
    return [];
  }
}

function normalizeType(rawType: string): ColumnInfo['normalizedType'] {
  const t = rawType.toLowerCase();

  if (t.includes('bool')) return 'boolean';
  if (
    t.includes('int') || t.includes('serial') || t.includes('numeric') ||
    t.includes('decimal') || t.includes('float') || t.includes('double') ||
    t.includes('real') || t.includes('money') || t.includes('number')
  ) return 'number';
  if (
    t.includes('date') || t.includes('time') || t.includes('timestamp') || t.includes('year')
  ) return 'date';
  if (t.includes('json')) return 'json';

  return 'text';
}

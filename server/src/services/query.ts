import type { Core } from '@strapi/strapi';
import type { Knex } from 'knex';
import type { ExplainResult, QueryResult, RejectedResult, ResultSet } from '../types';
import { analyze } from './security/lexer';
import { parseSQL } from './security/parser';
import { BUILT_IN_DENY_LIST } from '../config';
import { redactRows, matchesAnyPattern } from './redact';

/** Internal sentinel thrown inside transactions to force an unconditional rollback. */
class RollbackSignal extends Error {
  constructor() {
    super('__dbview_rollback__');
    this.name = 'RollbackSignal';
  }
}

type Dialect = 'pg' | 'mysql' | 'sqlite';

function getDialect(knex: Knex): Dialect {
  const client = (knex.client as { config?: { client?: string }; driverName?: string });
  const raw = String(client?.config?.client ?? client?.driverName ?? '').toLowerCase();
  if (raw.includes('pg') || raw.includes('postgres')) return 'pg';
  if (raw.includes('mysql') || raw.includes('maria')) return 'mysql';
  return 'sqlite';
}

function normalizeRawRows(raw: unknown, dialect: Dialect): Record<string, unknown>[] {
  if (!raw) return [];

  if (dialect === 'pg') {
    const pg = raw as { rows?: unknown[] };
    return (pg.rows ?? []) as Record<string, unknown>[];
  }

  if (dialect === 'mysql') {
    const [rows] = raw as [unknown[], unknown[]];
    return (rows ?? []) as Record<string, unknown>[];
  }

  // SQLite: result may be the array itself or { rows: [...] }
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  const maybe = raw as { rows?: unknown[] };
  return (maybe.rows ?? []) as Record<string, unknown>[];
}

async function applyStatementTimeout(trx: Knex.Transaction, dialect: Dialect, seconds: number) {
  const ms = seconds * 1000;
  if (dialect === 'pg') {
    await trx.raw(`SET LOCAL statement_timeout = ${ms}`);
  } else if (dialect === 'mysql') {
    await trx.raw(`SET SESSION MAX_EXECUTION_TIME = ${ms}`);
  }
  // SQLite has no SQL-level timeout; the driver-level timeout covers it.
}

function getExplainPrefix(dialect: Dialect, analyze: boolean): string {
  if (dialect === 'pg') return analyze ? 'EXPLAIN ANALYZE' : 'EXPLAIN';
  if (dialect === 'mysql') return analyze ? 'EXPLAIN ANALYZE' : 'EXPLAIN';
  return 'EXPLAIN QUERY PLAN'; // SQLite — no analyze mode
}

export default ({ strapi }: { strapi: Core.Strapi }) => {
  function getConfig() {
    const plugin = strapi.plugin('strapi-dbview');
    return {
      defaultRowLimit: plugin.config<number>('defaultRowLimit') ?? 100,
      maxRowLimit: plugin.config<number>('maxRowLimit') ?? 5000,
      denyList: plugin.config<string[]>('denyList') ?? [],
      redactedColumnPatterns: plugin.config<string[]>('redactedColumnPatterns') ?? [],
      queryTimeoutSeconds: plugin.config<number>('queryTimeoutSeconds') ?? 15,
    };
  }

  function getMergedDenySet(userDenyList: string[]): Set<string> {
    return new Set([...BUILT_IN_DENY_LIST, ...userDenyList].map((t) => t.toLowerCase()));
  }

  async function audit(opts: {
    userId: number | null;
    sql: string;
    connection: string;
    allowed: boolean;
    reason?: string;
    rowCount?: number;
    durationMs?: number;
  }) {
    try {
      await strapi.db
        .query('plugin::strapi-dbview.query-history')
        .create({
          data: {
            userId: opts.userId,
            connection: opts.connection,
            sql: opts.sql,
            allowed: opts.allowed,
            reason: opts.reason ?? null,
            rowCount: opts.rowCount ?? null,
            durationMs: opts.durationMs ? Math.round(opts.durationMs) : null,
          },
        });
    } catch {
      // Audit failures must never block a query
    }
  }

  async function runSecurityChecks(
    sql: string,
    userId: number | null,
    connection: string,
    tableNames: string[],
    denySet: Set<string>
  ): Promise<RejectedResult | null> {
    // ── Layer 1a: Lexical analysis ──────────────────────────────────────────
    const lex = analyze(sql);

    if (lex.hasExecutableComment) {
      const reason = 'Executable SQL comments are not permitted.';
      await audit({ userId, sql, connection, allowed: false, reason });
      return { rejected: true, reason };
    }

    if (lex.hasStackedStatements) {
      const reason = 'Multiple statements are not allowed. Run one SELECT at a time.';
      await audit({ userId, sql, connection, allowed: false, reason });
      return { rejected: true, reason };
    }

    const firstKw = lex.firstKeyword.toUpperCase();
    if (firstKw !== 'SELECT' && firstKw !== 'WITH') {
      const reason = 'Only SELECT (or WITH…SELECT) statements are permitted.';
      await audit({ userId, sql, connection, allowed: false, reason });
      return { rejected: true, reason };
    }

    if (lex.forbidden.length > 0) {
      const reason = `The keyword "${lex.forbidden[0]}" is not permitted in the read-only viewer.`;
      await audit({ userId, sql, connection, allowed: false, reason });
      return { rejected: true, reason };
    }

    // ── Layer 1b: AST verification ──────────────────────────────────────────
    const parsed = parseSQL(sql);

    if (!parsed.isSelectOnly && parsed.tables.length > 0) {
      const reason = 'Only SELECT statements are permitted.';
      await audit({ userId, sql, connection, allowed: false, reason });
      return { rejected: true, reason };
    }

    // ── Layer 2: Table scope ────────────────────────────────────────────────
    const allowedSet = new Set(tableNames.map((t) => t.toLowerCase()));

    for (const table of parsed.tables) {
      const tl = table.toLowerCase();

      if (denySet.has(tl)) {
        const reason = `The table "${table}" is not accessible.`;
        await audit({ userId, sql, connection, allowed: false, reason });
        return { rejected: true, reason };
      }

      if (!allowedSet.has(tl)) {
        const reason = `The table "${table}" is not accessible.`;
        await audit({ userId, sql, connection, allowed: false, reason });
        return { rejected: true, reason };
      }
    }

    return null; // All checks passed
  }

  return {
    /**
     * Execute a user-supplied SELECT. Applies all 5 security layers:
     * 1. Lexical allowlist (custom lexer)
     * 2. AST verification (node-sql-parser)
     * 3. Table scope enforcement
     * 4. Enforced LIMIT wrap
     * 5. Always-rollback transaction
     */
    async executeQuery(
      sql: string,
      limit: number,
      userId: number | null,
      connection = 'default'
    ): Promise<QueryResult | RejectedResult> {
      const cfg = getConfig();
      const knex = strapi.db.connection as unknown as Knex;
      const dialect = getDialect(knex);
      const denySet = getMergedDenySet(cfg.denyList);

      // Lazy-import schema service to avoid circular deps
      const schemaService = strapi.plugin('strapi-dbview').service('schema') as {
        listTableNames(): Promise<string[]>;
      };
      const tableNames = await schemaService.listTableNames();

      const rejection = await runSecurityChecks(sql, userId, connection, tableNames, denySet);
      if (rejection) return rejection;

      // ── Layer 3: Enforced LIMIT wrap ──────────────────────────────────────
      const effectiveLimit = Math.min(Math.max(1, limit || cfg.defaultRowLimit), cfg.maxRowLimit);
      const cleanSql = sql.trimEnd().replace(/;+$/, '');
      const wrappedSql = `SELECT * FROM (${cleanSql}) AS _dbview_sub LIMIT ${effectiveLimit}`;

      // ── Layers 4 + 5: Rollback transaction (+ optional timeout) ──────────
      let rows: Record<string, unknown>[] = [];
      let durationMs = 0;

      try {
        await knex.transaction(async (trx) => {
          await applyStatementTimeout(trx, dialect, cfg.queryTimeoutSeconds);
          const start = Date.now();
          const raw = await trx.raw(wrappedSql);
          durationMs = Date.now() - start;
          rows = normalizeRawRows(raw, dialect);
          throw new RollbackSignal();
        });
      } catch (err) {
        if (!(err instanceof RollbackSignal)) {
          await audit({ userId, sql, connection, allowed: false, reason: 'Query execution error' });
          throw err;
        }
      }

      const redacted = redactRows(rows, cfg.redactedColumnPatterns);
      const columns = redacted.length > 0 ? Object.keys(redacted[0]) : [];

      const result: ResultSet = {
        columns,
        rows: redacted,
        rowCount: redacted.length,
        durationMs,
        truncated: redacted.length >= effectiveLimit,
      };

      await audit({ userId, sql, connection, allowed: true, rowCount: result.rowCount, durationMs });

      return { data: result };
    },

    /**
     * Run EXPLAIN or EXPLAIN ANALYZE on a validated SELECT. The user only
     * types the SELECT — the EXPLAIN prefix is prepended here after all
     * security checks pass. This guarantees `EXPLAIN ANALYZE <write>` can
     * never be constructed. Still runs in a rollback transaction.
     */
    async explainQuery(
      sql: string,
      type: 'explain' | 'explain-analyze',
      userId: number | null,
      connection = 'default'
    ): Promise<ExplainResult | RejectedResult> {
      const cfg = getConfig();
      const knex = strapi.db.connection as unknown as Knex;
      const dialect = getDialect(knex);
      const denySet = getMergedDenySet(cfg.denyList);

      const schemaService = strapi.plugin('strapi-dbview').service('schema') as {
        listTableNames(): Promise<string[]>;
      };
      const tableNames = await schemaService.listTableNames();

      const rejection = await runSecurityChecks(sql, userId, connection, tableNames, denySet);
      if (rejection) return rejection;

      // Wrap with LIMIT so EXPLAIN ANALYZE doesn't scan full tables
      const effectiveLimit = Math.min(cfg.defaultRowLimit, cfg.maxRowLimit);
      const cleanSql = sql.trimEnd().replace(/;+$/, '');
      const wrappedSql = `SELECT * FROM (${cleanSql}) AS _dbview_sub LIMIT ${effectiveLimit}`;
      const prefix = getExplainPrefix(dialect, type === 'explain-analyze');
      const explainSql = `${prefix} ${wrappedSql}`;

      let rows: Record<string, unknown>[] = [];
      let durationMs = 0;

      try {
        await knex.transaction(async (trx) => {
          await applyStatementTimeout(trx, dialect, cfg.queryTimeoutSeconds);
          const start = Date.now();
          const raw = await trx.raw(explainSql);
          durationMs = Date.now() - start;
          rows = normalizeRawRows(raw, dialect);
          throw new RollbackSignal();
        });
      } catch (err) {
        if (!(err instanceof RollbackSignal)) {
          throw err;
        }
      }

      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return { type, columns, rows, durationMs };
    },

    /** Check if a column should be redacted (used by browse service). */
    isRedacted(column: string): boolean {
      const cfg = getConfig();
      return matchesAnyPattern(column, cfg.redactedColumnPatterns);
    },
  };
};

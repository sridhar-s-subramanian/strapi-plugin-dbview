import type { Core } from '@strapi/strapi';
import type { Knex } from 'knex';
import type { ExplainResult, QueryResult, RejectedResult, ResultSet } from '../types';
import { analyze } from './security/lexer';
import { parseSQL } from './security/parser';
import { BUILT_IN_DENY_LIST } from '../config';
import { redactRows, matchesAnyPattern, findSensitiveColumnReference } from './redact';

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

/**
 * Wrap a validated SELECT in an outer LIMIT. The closing paren and LIMIT sit on
 * their own lines so a trailing single-line comment (`-- …`) in the inner query
 * cannot comment them out — otherwise the enforced LIMIT could be silently
 * dropped. `limit` is always an integer constant derived from config.
 */
function wrapWithLimit(sql: string, limit: number): string {
  const cleanSql = sql.trimEnd().replace(/;+$/, '');
  return `SELECT * FROM (\n${cleanSql}\n) AS _dbview_sub LIMIT ${limit}`;
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

  function getConnectionService() {
    return strapi.plugin('strapi-dbview').service('connection') as {
      getKnex(): Knex;
      getConnectionLabel(): string;
    };
  }

  function getPluginKnex(): Knex {
    return getConnectionService().getKnex();
  }

  /** Audit label from plugin config — never from the HTTP client. */
  function getConnectionLabel(): string {
    return getConnectionService().getConnectionLabel();
  }

  function getMergedDenySet(userDenyList: string[]): Set<string> {
    return new Set([...BUILT_IN_DENY_LIST, ...userDenyList].map((t) => t.toLowerCase()));
  }

  /**
   * Audit to the application log rather than the database. A row per query would
   * grow without bound; blocked attempts are the security-relevant signal and are
   * logged at warn level, successful reads at debug.
   */
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
      const who = opts.userId === null ? 'unknown user' : `admin user ${opts.userId}`;
      const sql = opts.sql.replace(/\s+/g, ' ').trim().slice(0, 500);

      if (opts.allowed) {
        strapi.log.debug(
          `[dbview] ${who} ran on "${opts.connection}": ${sql} — ${opts.rowCount ?? 0} rows in ${Math.round(opts.durationMs ?? 0)}ms`
        );
      } else {
        strapi.log.warn(
          `[dbview] blocked query from ${who} on "${opts.connection}": ${opts.reason} — ${sql}`
        );
      }
    } catch {
      // Audit failures must never block a query
    }
  }

  async function runSecurityChecks(
    sql: string,
    userId: number | null,
    connection: string,
    tableNames: string[],
    denySet: Set<string>,
    redactedColumnPatterns: string[]
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
    // Fail closed: the parser must positively confirm the statement is a
    // SELECT. isSelectOnly is false both for detected non-SELECTs *and* for SQL
    // that no dialect could parse. Allowing the latter through would skip the
    // table-scope check below (which only runs on parsed tables), so a query
    // the parser cannot understand could read a deny-listed table.
    const parsed = parseSQL(sql);

    if (!parsed.isSelectOnly) {
      const reason =
        parsed.tables.length > 0
          ? 'Only SELECT statements are permitted.'
          : 'This query could not be verified as a read-only SELECT and was blocked.';
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

    // ── Layer 2b: Sensitive column references ─────────────────────────────
    // Result-column redaction alone is not enough: `SELECT password AS pwd`
    // or expressions like `password || ''` rename the output and bypass
    // name-based masking. The AST column list names source columns (including
    // those inside aliases, functions, WHERE, JOIN, CTEs, and subqueries).
    // Naming a redacted column anywhere in the statement is rejected.
    // `SELECT *` does not list concrete columns here — those values are still
    // masked by result redaction after execution.
    const sensitiveCol = findSensitiveColumnReference(parsed.columns, redactedColumnPatterns);
    if (sensitiveCol) {
      const reason =
        `The column "${sensitiveCol}" is sensitive and cannot be referenced in Query Runner SQL. ` +
        'Use SELECT * (values are redacted in results) or the Database Browser.';
      await audit({ userId, sql, connection, allowed: false, reason });
      return { rejected: true, reason };
    }

    return null; // All checks passed
  }

  return {
    /**
     * Execute a user-supplied SELECT. Applies the security stack:
     * 1. Lexical allowlist (custom lexer)
     * 2. AST verification (node-sql-parser)
     * 3. Table scope enforcement
     * 4. Sensitive column reference blocking (AST column list + redaction patterns)
     * 5. Enforced LIMIT wrap
     * 6. Always-rollback transaction
     * 7. Optional read-only Knex pool (Layer 5 — plugin config only)
     * Plus result-column redaction for SELECT * / remaining sensitive output names.
     */
    async executeQuery(
      sql: string,
      limit: number,
      userId: number | null,
      /** @deprecated Ignored — pool comes from plugin config only. Kept for API compatibility. */
      _connectionIgnored?: string
    ): Promise<QueryResult | RejectedResult> {
      const cfg = getConfig();
      const knex = getPluginKnex();
      const connection = getConnectionLabel();
      const dialect = getDialect(knex);
      const denySet = getMergedDenySet(cfg.denyList);

      // Lazy-import schema service to avoid circular deps
      const schemaService = strapi.plugin('strapi-dbview').service('schema') as {
        listTableNames(): Promise<string[]>;
      };
      const tableNames = await schemaService.listTableNames();

      const rejection = await runSecurityChecks(
        sql,
        userId,
        connection,
        tableNames,
        denySet,
        cfg.redactedColumnPatterns
      );
      if (rejection) return rejection;

      // ── Layer 3: Enforced LIMIT wrap ──────────────────────────────────────
      const effectiveLimit = Math.floor(
        Math.min(Math.max(1, limit || cfg.defaultRowLimit), cfg.maxRowLimit)
      );
      const wrappedSql = wrapWithLimit(sql, effectiveLimit);

      // ── Layer 4: Always-rollback transaction (+ optional timeout) ─────────
      // Layer 5 is the Knex pool selected above (read-only when configured).
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
      /** @deprecated Ignored — pool comes from plugin config only. Kept for API compatibility. */
      _connectionIgnored?: string
    ): Promise<ExplainResult | RejectedResult> {
      const cfg = getConfig();
      const knex = getPluginKnex();
      const connection = getConnectionLabel();
      const dialect = getDialect(knex);
      const denySet = getMergedDenySet(cfg.denyList);

      const schemaService = strapi.plugin('strapi-dbview').service('schema') as {
        listTableNames(): Promise<string[]>;
      };
      const tableNames = await schemaService.listTableNames();

      const rejection = await runSecurityChecks(
        sql,
        userId,
        connection,
        tableNames,
        denySet,
        cfg.redactedColumnPatterns
      );
      if (rejection) return rejection;

      // Wrap with LIMIT so EXPLAIN ANALYZE doesn't scan full tables
      const effectiveLimit = Math.floor(Math.min(cfg.defaultRowLimit, cfg.maxRowLimit));
      const wrappedSql = wrapWithLimit(sql, effectiveLimit);
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

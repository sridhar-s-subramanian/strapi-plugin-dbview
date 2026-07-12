import type { Core } from '@strapi/strapi';
import type { Knex } from 'knex';
import type { BrowseOptions, BrowseResult, ColumnInfo } from '../types';
import { BUILT_IN_DENY_LIST } from '../config';
import { redactRows, matchesAnyPattern } from './redact';

type FilterOp = 'eq' | 'neq' | 'contains' | 'starts_with' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'is_not_null';

const ALLOWED_OPS = new Set<FilterOp>([
  'eq', 'neq', 'contains', 'starts_with', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null',
]);

function isAllowedOp(op: string): op is FilterOp {
  return ALLOWED_OPS.has(op as FilterOp);
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Paginated, filtered, sorted browse of a single database table.
   *
   * Security: table name and column names are validated against the schema
   * service allowlist before being passed to the Knex query builder. User
   * values are always bound as parameters — no raw SQL is assembled from
   * user input here.
   */
  async browseTable(tableName: string, options: BrowseOptions, userId: number | null): Promise<BrowseResult | null> {
    const knex = strapi.db.connection as unknown as Knex;
    const plugin = strapi.plugin('strapi-dbview');
    const redactPatterns = plugin.config<string[]>('redactedColumnPatterns') ?? [];
    const defaultLimit = plugin.config<number>('defaultRowLimit') ?? 100;
    const maxLimit = plugin.config<number>('maxRowLimit') ?? 5000;
    const userDenyList = plugin.config<string[]>('denyList') ?? [];

    // Validate table is in the allowed scope
    const schemaService = plugin.service('schema') as { listTableNames(): Promise<string[]>; getTableStructure(t: string): Promise<{ columns: ColumnInfo[] } | null> };
    const allowedTables = await schemaService.listTableNames();
    const denySet = new Set([...BUILT_IN_DENY_LIST, ...userDenyList].map((t) => t.toLowerCase()));

    if (!allowedTables.includes(tableName) || denySet.has(tableName.toLowerCase())) {
      return null;
    }

    // Get table structure to validate column names for sort/filter
    const structure = await schemaService.getTableStructure(tableName);
    const validColumns = new Set((structure?.columns ?? []).map((c) => c.name));
    const columnInfoMap = new Map((structure?.columns ?? []).map((c) => [c.name, c]));

    const { page = 1, pageSize = defaultLimit, sort, filters } = options;
    const safePageSize = Math.min(Math.max(1, pageSize), maxLimit);
    const offset = (Math.max(1, page) - 1) * safePageSize;

    // Build the base query — table name is validated (not user text)
    const baseQuery = () => knex(tableName);

    // Apply filters — column names validated, values parameterized
    function applyFilters(q: Knex.QueryBuilder) {
      if (!filters) return q;

      for (const [col, { op, value }] of Object.entries(filters)) {
        if (!validColumns.has(col)) continue;
        if (!isAllowedOp(op)) continue;

        const colInfo = columnInfoMap.get(col);
        if (colInfo?.isSensitive) continue; // Never filter on redacted columns

        switch (op) {
          case 'eq':         q = q.where(col, '=', value); break;
          case 'neq':        q = q.whereNot(col, value); break;
          case 'contains':   q = q.whereILike?.(col, `%${value}%`) ?? q.whereLike(col, `%${value}%`); break;
          case 'starts_with': q = q.whereILike?.(col, `${value}%`) ?? q.whereLike(col, `${value}%`); break;
          case 'gt':         q = q.where(col, '>', value); break;
          case 'gte':        q = q.where(col, '>=', value); break;
          case 'lt':         q = q.where(col, '<', value); break;
          case 'lte':        q = q.where(col, '<=', value); break;
          case 'is_null':    q = q.whereNull(col); break;
          case 'is_not_null': q = q.whereNotNull(col); break;
        }
      }
      return q;
    }

    // Count query for pagination
    const start = Date.now();

    let total = 0;
    try {
      const countQuery = applyFilters(baseQuery());
      const countResult = await countQuery.count('* as count').first() as { count: string | number } | undefined;
      total = Number(countResult?.count ?? 0);
    } catch {
      total = 0;
    }

    // Data query
    let dataQuery = applyFilters(baseQuery()).select('*').limit(safePageSize).offset(offset);

    if (sort && validColumns.has(sort.column)) {
      const colInfo = columnInfoMap.get(sort.column);
      if (!colInfo?.isSensitive) {
        dataQuery = dataQuery.orderBy(sort.column, sort.direction === 'desc' ? 'desc' : 'asc');
      }
    }

    const rawRows = await dataQuery as Record<string, unknown>[];
    const durationMs = Date.now() - start;

    const rows = redactRows(rawRows, redactPatterns);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : (structure?.columns.map((c) => c.name) ?? []);

    return {
      data: {
        columns,
        rows,
        rowCount: rows.length,
        durationMs,
        truncated: rows.length >= safePageSize,
      },
      total,
      page: Math.max(1, page),
      pageSize: safePageSize,
      pageCount: Math.ceil(total / safePageSize),
    };
  },

  /** Fetch FK-related rows for a given foreign table + column + value. */
  async relatedRows(
    foreignTable: string,
    foreignColumn: string,
    value: unknown
  ): Promise<Record<string, unknown>[]> {
    const knex = strapi.db.connection as unknown as Knex;
    const plugin = strapi.plugin('strapi-dbview');
    const redactPatterns = plugin.config<string[]>('redactedColumnPatterns') ?? [];
    const limit = Math.min(plugin.config<number>('defaultRowLimit') ?? 100, 100);

    // Validate table
    const schemaService = plugin.service('schema') as { listTableNames(): Promise<string[]> };
    const allowed = await schemaService.listTableNames();
    if (!allowed.includes(foreignTable)) return [];

    const rows = value === null || value === undefined
      ? []
      : await knex(foreignTable).where(foreignColumn, value).limit(limit).select('*') as Record<string, unknown>[];

    return redactRows(rows, redactPatterns);
  },
});

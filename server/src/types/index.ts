export interface ColumnInfo {
  name: string;
  dataType: string;
  normalizedType: 'text' | 'number' | 'date' | 'boolean' | 'json' | 'other';
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isSensitive: boolean;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
}

export interface TableInfo {
  name: string;
  rowCount: number | null;
  columnCount: number;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface TableStructure {
  table: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
}

export interface ResultSet {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
}

export interface LexerResult {
  stripped: string;
  firstKeyword: string;
  forbidden: string[];
  hasStackedStatements: boolean;
  hasExecutableComment: boolean;
}

export interface ParseResult {
  tables: string[];
  columns: string[];
  cteNames: string[];
  isSelectOnly: boolean;
}

export interface BrowseOptions {
  page: number;
  pageSize: number;
  sort?: { column: string; direction: 'asc' | 'desc' };
  filters?: Record<string, { op: string; value: unknown }>;
}

export interface BrowseResult {
  data: ResultSet;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface QueryResult {
  data: ResultSet;
}

export interface RejectedResult {
  rejected: true;
  reason: string;
}

export interface ExplainResult {
  type: 'explain' | 'explain-analyze';
  columns: string[];
  rows: Record<string, unknown>[];
  durationMs: number;
}

/**
 * Optional dedicated connection used for all plugin DB reads (Layer 5).
 *
 * - Connection URL: `postgres://user:pass@host:5432/db` or `mysql://…`
 * - Full Knex config: `{ client: 'pg' | 'mysql2' | 'better-sqlite3' | …, connection: …, pool?: … }`
 *
 * When set, the plugin opens a separate pool and never uses the Strapi app
 * connection for browse / query / schema. The HTTP client cannot choose a pool.
 */
export type ReadOnlyConnectionConfig =
  | string
  | {
      client: string;
      connection: string | Record<string, unknown>;
      pool?: Record<string, unknown>;
      [key: string]: unknown;
    };

export interface DbViewConfig {
  defaultRowLimit: number;
  maxRowLimit: number;
  denyList: string[];
  redactedColumnPatterns: string[];
  queryTimeoutSeconds: number;
  /**
   * Optional SELECT-oriented DB connection (URL or Knex config).
   * Operators must create the DB user and grants themselves.
   */
  readOnlyConnection?: ReadOnlyConnectionConfig;
}

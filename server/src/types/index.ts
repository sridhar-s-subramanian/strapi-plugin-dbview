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

export interface DbViewConfig {
  defaultRowLimit: number;
  maxRowLimit: number;
  denyList: string[];
  redactedColumnPatterns: string[];
  queryTimeoutSeconds: number;
  readOnlyConnection?: string;
}

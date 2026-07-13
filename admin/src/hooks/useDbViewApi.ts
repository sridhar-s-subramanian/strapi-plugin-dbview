import { useFetchClient } from '@strapi/strapi/admin';

const BASE = '/strapi-dbview';

export const useDbViewApi = () => {
  const { get, post, del } = useFetchClient();

  return {
    listTables: () =>
      get<{ tables: Array<{ name: string; rowCount: number | null; columnCount: number }> }>(
        `${BASE}/schema/tables`
      ),

    getStructure: (tableName: string) =>
      get<{ structure: unknown }>(`${BASE}/schema/tables/${encodeURIComponent(tableName)}/structure`),

    browseTable: (tableName: string, params: {
      page?: number;
      pageSize?: number;
      sortColumn?: string;
      sortDirection?: string;
      filters?: string;
    }) =>
      get<{
        data: { columns: string[]; rows: Record<string, unknown>[]; rowCount: number; durationMs: number; truncated: boolean };
        total: number;
        page: number;
        pageSize: number;
        pageCount: number;
      }>(`${BASE}/data/${encodeURIComponent(tableName)}`, { params }),

    relatedRows: (tableName: string, column: string, value: unknown) =>
      get<{ rows: Record<string, unknown>[] }>(
        `${BASE}/data/${encodeURIComponent(tableName)}/related/${encodeURIComponent(column)}`,
        { params: { value: String(value) } }
      ),

    executeQuery: (sql: string, limit: number, connection: string) =>
      post<{
        data?: { columns: string[]; rows: Record<string, unknown>[]; rowCount: number; durationMs: number; truncated: boolean };
        error?: string;
      }>(`${BASE}/query/execute`, { sql, limit, connection }),

    explainQuery: (sql: string, type: 'explain' | 'explain-analyze', connection: string) =>
      post<{
        type?: string;
        columns?: string[];
        rows?: Record<string, unknown>[];
        durationMs?: number;
        error?: string;
      }>(`${BASE}/query/explain`, { sql, type, connection }),

    listHistory: () =>
      get<{ entries: Array<{ id: number; sql: string; connection: string; rowCount: number | null; durationMs: number | null; createdAt: string }> }>(
        `${BASE}/history`
      ),

    listSavedQueries: () =>
      get<{ queries: Array<{ id: number; name: string; sql: string; connection: string }> }>(
        `${BASE}/saved-queries`
      ),

    createSavedQuery: (name: string, sql: string, connection: string) =>
      post<{ query: { id: number; name: string; sql: string } }>(
        `${BASE}/saved-queries`,
        { name, sql, connection }
      ),

    deleteSavedQuery: (id: number) =>
      del<{ success: boolean }>(`${BASE}/saved-queries/${id}`),
  };
};

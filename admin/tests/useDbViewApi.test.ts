import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Strapi's fetch client so we can assert exactly what the hook requests.
const { get, post, del } = vi.hoisted(() => ({
  get: vi.fn((_url: string, _opts?: unknown) => Promise.resolve({ data: {} })),
  post: vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: {} })),
  del: vi.fn((_url: string) => Promise.resolve({ data: {} })),
}));

vi.mock('@strapi/strapi/admin', () => ({
  useFetchClient: () => ({ get, post, del }),
}));

import { useDbViewApi } from '../src/hooks/useDbViewApi';

const BASE = '/strapi-dbview';

beforeEach(() => {
  get.mockClear();
  post.mockClear();
  del.mockClear();
});

describe('useDbViewApi — POST bodies are unwrapped', () => {
  // Regression: useFetchClient.post(url, body) sends its 2nd arg AS the body.
  // Wrapping it in { data: {...} } made the server see { data: {...} } and
  // reject every query with "sql is required".
  it('executeQuery posts a flat { sql, limit, connection } body', () => {
    useDbViewApi().executeQuery('SELECT 1', 50, 'default');
    expect(post).toHaveBeenCalledWith(`${BASE}/query/execute`, {
      sql: 'SELECT 1',
      limit: 50,
      connection: 'default',
    });
  });

  it('explainQuery posts a flat { sql, type, connection } body', () => {
    useDbViewApi().explainQuery('SELECT 1', 'explain-analyze', 'default');
    expect(post).toHaveBeenCalledWith(`${BASE}/query/explain`, {
      sql: 'SELECT 1',
      type: 'explain-analyze',
      connection: 'default',
    });
  });

  it('createSavedQuery posts a flat { name, sql, connection } body', () => {
    useDbViewApi().createSavedQuery('My query', 'SELECT 1', 'default');
    expect(post).toHaveBeenCalledWith(`${BASE}/saved-queries`, {
      name: 'My query',
      sql: 'SELECT 1',
      connection: 'default',
    });
  });

  it('no POST body is wrapped in a { data } envelope', () => {
    const api = useDbViewApi();
    api.executeQuery('SELECT 1', 10, 'default');
    api.explainQuery('SELECT 1', 'explain', 'default');
    api.createSavedQuery('n', 'SELECT 1', 'default');
    for (const call of post.mock.calls) {
      expect(call[1]).not.toHaveProperty('data');
    }
  });
});

describe('useDbViewApi — endpoints and encoding', () => {
  it('listTables hits the schema endpoint', () => {
    useDbViewApi().listTables();
    expect(get).toHaveBeenCalledWith(`${BASE}/schema/tables`);
  });

  it('getStructure URL-encodes the table name', () => {
    useDbViewApi().getStructure('weird/name');
    expect(get).toHaveBeenCalledWith(`${BASE}/schema/tables/weird%2Fname/structure`);
  });

  it('browseTable passes pagination/sort/filter as params', () => {
    useDbViewApi().browseTable('users', { page: 2, pageSize: 25, sortColumn: 'id' });
    expect(get).toHaveBeenCalledWith(`${BASE}/data/users`, {
      params: { page: 2, pageSize: 25, sortColumn: 'id' },
    });
  });

  it('relatedRows encodes table and column and stringifies the value', () => {
    useDbViewApi().relatedRows('users', 'role_id', 7);
    expect(get).toHaveBeenCalledWith(`${BASE}/data/users/related/role_id`, {
      params: { value: '7' },
    });
  });

  it('deleteSavedQuery deletes by id', () => {
    useDbViewApi().deleteSavedQuery(42);
    expect(del).toHaveBeenCalledWith(`${BASE}/saved-queries/42`);
  });

  it('does not call the removed history endpoint', () => {
    const api = useDbViewApi() as Record<string, unknown>;
    expect(api.listHistory).toBeUndefined();
  });
});

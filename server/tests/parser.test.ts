import { describe, it, expect } from 'vitest';
import { parseSQL } from '../src/services/security/parser';

describe('parser — table extraction', () => {
  it('extracts a single table', () => {
    expect(parseSQL('SELECT * FROM users').tables).toEqual(['users']);
  });

  it('extracts tables from a join', () => {
    const { tables } = parseSQL('SELECT * FROM users u JOIN orders o ON o.user_id = u.id');
    expect(tables).toEqual(expect.arrayContaining(['users', 'orders']));
  });

  it('extracts tables from a subquery', () => {
    const { tables } = parseSQL('SELECT * FROM (SELECT id FROM orders) x');
    expect(tables).toContain('orders');
  });

  it('extracts BOTH sides of a UNION — this is what stops UNION exfiltration', () => {
    const { tables } = parseSQL('SELECT id FROM users UNION SELECT id FROM admin_users');
    expect(tables).toEqual(expect.arrayContaining(['users', 'admin_users']));
  });

  it('lowercases table names so the deny list cannot be case-evaded', () => {
    expect(parseSQL('SELECT * FROM ADMIN_USERS').tables).toContain('admin_users');
  });

  it('strips quoting from identifiers', () => {
    expect(parseSQL('SELECT * FROM `users`').tables).toContain('users');
  });

  it('deduplicates repeated tables', () => {
    const { tables } = parseSQL('SELECT * FROM users a JOIN users b ON a.id = b.id');
    expect(tables.filter((t) => t === 'users')).toHaveLength(1);
  });
});

describe('parser — CTEs', () => {
  it('excludes the CTE name from tables (it is not a real table)', () => {
    const { tables, cteNames } = parseSQL('WITH cte AS (SELECT * FROM users) SELECT * FROM cte');
    expect(cteNames).toContain('cte');
    expect(tables).not.toContain('cte');
  });

  it('still reports the real table a CTE reads from', () => {
    const { tables } = parseSQL('WITH cte AS (SELECT * FROM users) SELECT * FROM cte');
    expect(tables).toContain('users');
  });

  it('does not let a CTE alias mask a denied table', () => {
    // Naming a CTE "safe" must not hide that it reads admin_users.
    const { tables } = parseSQL('WITH safe AS (SELECT * FROM admin_users) SELECT * FROM safe');
    expect(tables).toContain('admin_users');
  });
});

describe('parser — statement type', () => {
  it('marks a SELECT as select-only', () => {
    expect(parseSQL('SELECT * FROM users').isSelectOnly).toBe(true);
  });

  it('does not mark an UPDATE as select-only', () => {
    expect(parseSQL('UPDATE users SET name = 1').isSelectOnly).toBe(false);
  });

  it('does not mark an INSERT as select-only', () => {
    expect(parseSQL('INSERT INTO users (id) VALUES (1)').isSelectOnly).toBe(false);
  });

  it('does not mark a DELETE as select-only', () => {
    expect(parseSQL('DELETE FROM users').isSelectOnly).toBe(false);
  });
});

describe('parser — column extraction', () => {
  it('extracts concrete source columns (not aliases)', () => {
    const { columns } = parseSQL('SELECT password AS pwd FROM users');
    expect(columns).toContain('password');
    expect(columns).not.toContain('pwd');
  });

  it('extracts columns inside expressions and WHERE', () => {
    const { columns } = parseSQL("SELECT lower(password) FROM users WHERE api_token IS NOT NULL");
    expect(columns).toEqual(expect.arrayContaining(['password', 'api_token']));
  });

  it('extracts columns from CTEs and subqueries', () => {
    const cte = parseSQL('WITH t AS (SELECT password AS pwd FROM users) SELECT pwd FROM t');
    expect(cte.columns).toContain('password');

    const sub = parseSQL('SELECT * FROM (SELECT password AS pwd FROM users) t');
    expect(sub.columns).toContain('password');
  });

  it('does not treat SELECT * as a concrete column list', () => {
    const { columns } = parseSQL('SELECT * FROM users');
    expect(columns).not.toContain('*');
    expect(columns).not.toContain('(.*)');
  });

  it('strips quoting from column identifiers', () => {
    expect(parseSQL('SELECT "password" FROM users').columns).toContain('password');
  });
});

describe('parser — unparseable input fails closed', () => {
  it('returns isSelectOnly=false when no dialect can parse it', () => {
    const r = parseSQL('%%% not sql at all %%%');
    expect(r.isSelectOnly).toBe(false);
    expect(r.tables).toEqual([]);
    expect(r.columns).toEqual([]);
  });
});

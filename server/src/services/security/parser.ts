import type { ParseResult } from '../../types';

type Dialect = 'MySQL' | 'PostgresQL' | 'SQLite';

const DIALECTS: Dialect[] = ['MySQL', 'PostgresQL', 'SQLite'];

interface AstNode {
  type?: string;
  with?: Array<{ name?: { value?: string } }>;
  [key: string]: unknown;
}

/**
 * Extract CTE names from a parsed AST. CTEs are derived tables and must be
 * excluded from the table scope check (they don't correspond to real tables).
 */
function extractCteNames(ast: AstNode | AstNode[]): string[] {
  const stmts = Array.isArray(ast) ? ast : [ast];
  const names: string[] = [];

  for (const stmt of stmts) {
    if (Array.isArray(stmt.with)) {
      for (const cte of stmt.with) {
        const name = cte?.name?.value;
        if (typeof name === 'string' && name) {
          names.push(name.toLowerCase());
        }
      }
    }
  }

  return names;
}

/**
 * node-sql-parser columnList entries look like `select::table::column` or
 * `select::null::column`. Star projections use `(.*)`. We only care about
 * concrete source column identifiers (aliases of non-sensitive sources are
 * not listed — only the underlying column is).
 */
function extractColumnNames(rawColumnList: string[]): string[] {
  const columns: string[] = [];

  for (const entry of rawColumnList) {
    const parts = entry.split('::');
    const raw = (parts[parts.length - 1] ?? '').toLowerCase().replace(/^[`"']+|[`"']+$/g, '');
    // Skip star expansions and empty fragments
    if (!raw || raw === '(.*)' || raw === '*' || raw === 'null') continue;
    columns.push(raw);
  }

  return [...new Set(columns)];
}

/**
 * Use node-sql-parser as a second opinion after the lexer passes. This
 * provides reliable AST-based table and column extraction (correctly handles
 * CTEs, subqueries, qualified names, and quoted identifiers). Tries multiple
 * SQL dialects to maximise compatibility.
 *
 * On parse failure for all dialects, returns a conservative result with
 * empty tables/columns and isSelectOnly=false — the caller must decide how to
 * handle the ambiguity.
 */
export function parseSQL(sql: string): ParseResult {
  // Lazy-require to avoid bundling issues in environments that don't need it
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Parser } = require('node-sql-parser') as typeof import('node-sql-parser');
  const parser = new Parser();

  for (const dialect of DIALECTS) {
    try {
      const opt = { database: dialect };
      const rawTableList: string[] = parser.tableList(sql, opt);
      const rawColumnList: string[] = parser.columnList(sql, opt);
      const ast = parser.astify(sql, opt) as unknown as AstNode | AstNode[];

      const stmts = Array.isArray(ast) ? ast : [ast];
      const isSelectOnly = stmts.every((s) => s.type === 'select');

      const cteNames = extractCteNames(ast);
      const cteSet = new Set(cteNames);

      const tables = rawTableList
        .map((t) => {
          const parts = t.split('::');
          return (parts[parts.length - 1] ?? '').toLowerCase().replace(/^[`"']+|[`"']+$/g, '');
        })
        .filter((t) => t && t !== 'null' && !cteSet.has(t));

      return {
        tables: [...new Set(tables)],
        columns: extractColumnNames(rawColumnList),
        cteNames,
        isSelectOnly,
      };
    } catch {
      // Try the next dialect
    }
  }

  // All dialects failed — return a conservative result
  return { tables: [], columns: [], cteNames: [], isSelectOnly: false };
}

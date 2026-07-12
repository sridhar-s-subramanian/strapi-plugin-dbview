import type { LexerResult } from '../../types';

type LexerState =
  | 'normal'
  | 'single_quote'
  | 'double_quote'
  | 'backtick'
  | 'line_comment'
  | 'block_comment'
  | 'dollar_quote';

const FORBIDDEN_KEYWORDS = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'DROP', 'CREATE', 'ALTER',
  'REPLACE', 'MERGE', 'UPSERT', 'CALL', 'EXEC', 'EXECUTE', 'GRANT',
  'REVOKE', 'LOAD', 'OUTFILE', 'DUMPFILE', 'INTO', 'ATTACH', 'DETACH',
  'PRAGMA', 'VACUUM', 'REINDEX', 'COPY', 'IMPORT', 'BACKUP', 'RESTORE',
  'DECLARE', 'SET', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'DO', 'LOCK',
  'UNLOCK', 'HANDLER', 'SHUTDOWN', 'KILL',
]);

const FORBIDDEN_FUNCTIONS = new Set([
  'SLEEP', 'BENCHMARK', 'PG_SLEEP', 'PG_READ_FILE', 'PG_WRITE_FILE',
  'PG_RELOAD_CONF', 'PG_TERMINATE_BACKEND', 'PG_CANCEL_BACKEND',
  'PG_LS_DIR', 'PG_READ_BINARY_FILE', 'LOAD_FILE', 'SYSTEM',
  'XP_CMDSHELL', 'SP_EXECUTESQL', 'UTL_FILE', 'UTL_HTTP', 'UTL_SMTP',
  'DBMS_SCHEDULER', 'DBMS_JOB', 'DBMS_SQL', 'DBMS_PIPE',
  'LO_IMPORT', 'LO_EXPORT', 'DBLINK', 'SYS_EXEC', 'SYS_EVAL',
  'RANDOMBLOB', 'ZEROBLOB', 'READFILE', 'WRITEFILE',
]);

/**
 * Walk the raw SQL character-by-character, replacing string literals,
 * quoted identifiers, and comments with spaces. This prevents keywords
 * hidden inside quoted regions from passing the keyword scanner.
 */
function stripQuotedRegions(sql: string): { stripped: string; hasExecutableComment: boolean } {
  let out = '';
  let i = 0;
  const len = sql.length;
  let hasExecutableComment = false;
  let dollarTag = '';
  let state: LexerState = 'normal';

  while (i < len) {
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : '';

    switch (state) {
      case 'normal': {
        if (ch === '-' && next === '-') {
          state = 'line_comment';
          out += '  ';
          i += 2;
        } else if (ch === '/' && next === '*') {
          // Detect MySQL executable comments: /*! ... */ and /*+ ... */
          const peek = i + 2 < len ? sql[i + 2] : '';
          if (peek === '!' || peek === '+') {
            hasExecutableComment = true;
          }
          state = 'block_comment';
          out += '  ';
          i += 2;
        } else if (ch === '#') {
          // MySQL-style line comment
          state = 'line_comment';
          out += ' ';
          i++;
        } else if (ch === "'") {
          state = 'single_quote';
          out += ' ';
          i++;
        } else if (ch === '"') {
          state = 'double_quote';
          out += ' ';
          i++;
        } else if (ch === '`') {
          state = 'backtick';
          out += ' ';
          i++;
        } else if (ch === '$') {
          // PostgreSQL dollar quoting: $$...$$  or  $tag$...$tag$
          const rest = sql.slice(i);
          const tagMatch = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
          if (tagMatch) {
            dollarTag = tagMatch[0];
            state = 'dollar_quote';
            out += ' '.repeat(dollarTag.length);
            i += dollarTag.length;
          } else {
            out += ch;
            i++;
          }
        } else {
          out += ch;
          i++;
        }
        break;
      }

      case 'line_comment': {
        if (ch === '\n') {
          state = 'normal';
          out += '\n';
        } else {
          out += ' ';
        }
        i++;
        break;
      }

      case 'block_comment': {
        if (ch === '*' && next === '/') {
          state = 'normal';
          out += '  ';
          i += 2;
        } else {
          out += ch === '\n' ? '\n' : ' ';
          i++;
        }
        break;
      }

      case 'single_quote': {
        if (ch === '\\' && next !== '') {
          // Backslash escape (MySQL-style) in single-quoted strings
          out += '  ';
          i += 2;
        } else if (ch === "'" && next === "'") {
          // Doubled-quote escape
          out += '  ';
          i += 2;
        } else if (ch === "'") {
          state = 'normal';
          out += ' ';
          i++;
        } else {
          out += ch === '\n' ? '\n' : ' ';
          i++;
        }
        break;
      }

      case 'double_quote': {
        if (ch === '"' && next === '"') {
          out += '  ';
          i += 2;
        } else if (ch === '"') {
          state = 'normal';
          out += ' ';
          i++;
        } else {
          out += ch === '\n' ? '\n' : ' ';
          i++;
        }
        break;
      }

      case 'backtick': {
        if (ch === '`' && next === '`') {
          out += '  ';
          i += 2;
        } else if (ch === '`') {
          state = 'normal';
          out += ' ';
          i++;
        } else {
          out += ' ';
          i++;
        }
        break;
      }

      case 'dollar_quote': {
        if (sql.slice(i).startsWith(dollarTag)) {
          state = 'normal';
          out += ' '.repeat(dollarTag.length);
          i += dollarTag.length;
          dollarTag = '';
        } else {
          out += ch === '\n' ? '\n' : ' ';
          i++;
        }
        break;
      }
    }
  }

  return { stripped: out, hasExecutableComment };
}

function extractFirstKeyword(stripped: string): string {
  const m = stripped.trimStart().match(/^[(\s]*([A-Za-z_]+)/);
  return m ? m[1].toUpperCase() : '';
}

function detectStackedStatements(stripped: string): boolean {
  const trimmed = stripped.trimEnd();
  let semiCount = 0;
  let lastSemiPos = -1;

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === ';') {
      semiCount++;
      lastSemiPos = i;
    }
  }

  if (semiCount > 1) return true;
  if (semiCount === 1 && lastSemiPos !== trimmed.length - 1) return true;
  return false;
}

function findForbiddenTokens(stripped: string): string[] {
  const upper = stripped.toUpperCase();
  const found: string[] = [];

  for (const token of [...FORBIDDEN_KEYWORDS, ...FORBIDDEN_FUNCTIONS]) {
    // Whole-word match: token must not be preceded or followed by a word character
    const pattern = new RegExp(`(?<![A-Z0-9_])${token}(?![A-Z0-9_])`, '');
    if (pattern.test(upper)) {
      found.push(token);
    }
  }

  return found;
}

/**
 * Perform full lexical analysis of a SQL string.
 *
 * Security guarantees:
 *  - All string literals, quoted identifiers, and comments are stripped before
 *    any keyword scanning, preventing keyword injection via quoted regions.
 *  - MySQL executable comments (/*! ... and /*+ ...) are detected and rejected.
 *  - Stacked statements (multiple semicolons) are detected after stripping.
 *  - ~50 forbidden keywords/functions are scanned as whole words (case-insensitive).
 */
export function analyze(sql: string): LexerResult {
  const { stripped, hasExecutableComment } = stripQuotedRegions(sql);
  const firstKeyword = extractFirstKeyword(stripped);
  const hasStackedStatements = detectStackedStatements(stripped);
  const forbidden = findForbiddenTokens(stripped);

  return { stripped, firstKeyword, forbidden, hasStackedStatements, hasExecutableComment };
}

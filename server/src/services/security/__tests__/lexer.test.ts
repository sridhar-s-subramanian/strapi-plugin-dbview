import { describe, it, expect } from 'vitest';
import { analyze } from '../lexer';

describe('lexer — first keyword', () => {
  it('accepts SELECT', () => {
    expect(analyze('SELECT * FROM users').firstKeyword).toBe('SELECT');
  });

  it('accepts WITH (CTE)', () => {
    expect(analyze('WITH c AS (SELECT 1) SELECT * FROM c').firstKeyword).toBe('WITH');
  });

  it('is case-insensitive', () => {
    expect(analyze('sElEcT 1').firstKeyword).toBe('SELECT');
  });

  it('sees past a leading parenthesis', () => {
    expect(analyze('(SELECT 1)').firstKeyword).toBe('SELECT');
  });

  it('reports the real keyword for a write', () => {
    expect(analyze('UPDATE users SET a = 1').firstKeyword).toBe('UPDATE');
  });

  it('is not fooled by a leading comment', () => {
    expect(analyze('/* just a note */ SELECT 1').firstKeyword).toBe('SELECT');
    expect(analyze('-- note\nDELETE FROM users').firstKeyword).toBe('DELETE');
  });
});

describe('lexer — forbidden tokens', () => {
  it.each([
    ['INSERT', 'INSERT INTO users VALUES (1)'],
    ['UPDATE', 'UPDATE users SET a = 1'],
    ['DELETE', 'DELETE FROM users'],
    ['DROP', 'DROP TABLE users'],
    ['TRUNCATE', 'TRUNCATE users'],
    ['ALTER', 'ALTER TABLE users ADD c INT'],
    ['GRANT', 'GRANT ALL ON users TO bob'],
    ['ATTACH', 'ATTACH DATABASE ":memory:" AS x'],
    ['PRAGMA', 'PRAGMA table_info(users)'],
  ])('flags %s', (token, sql) => {
    expect(analyze(sql).forbidden).toContain(token);
  });

  it.each([
    ['SLEEP', 'SELECT SLEEP(5)'],
    ['BENCHMARK', 'SELECT BENCHMARK(1000000, MD5("x"))'],
    ['PG_SLEEP', 'SELECT PG_SLEEP(5)'],
    ['LOAD_FILE', "SELECT LOAD_FILE('/etc/passwd')"],
    ['XP_CMDSHELL', "SELECT XP_CMDSHELL('dir')"],
    ['PG_READ_FILE', "SELECT PG_READ_FILE('/etc/passwd')"],
  ])('flags dangerous function %s', (token, sql) => {
    expect(analyze(sql).forbidden).toContain(token);
  });

  it('matches whole words only — a column named "dropped" is fine', () => {
    expect(analyze('SELECT dropped, updated_at, deleted_at FROM users').forbidden).toEqual([]);
  });

  it('does not flag a table named "inserts"', () => {
    expect(analyze('SELECT * FROM inserts').forbidden).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(analyze('select sleep(1)').forbidden).toContain('SLEEP');
  });
});

describe('lexer — quoted regions cannot hide keywords', () => {
  it('ignores a keyword inside a single-quoted string', () => {
    expect(analyze("SELECT 'DROP TABLE users' AS note FROM t").forbidden).toEqual([]);
  });

  it('ignores a keyword inside a double-quoted identifier', () => {
    expect(analyze('SELECT "DELETE" FROM t').forbidden).toEqual([]);
  });

  it('ignores a keyword inside backticks', () => {
    expect(analyze('SELECT `UPDATE` FROM t').forbidden).toEqual([]);
  });

  it('ignores a keyword inside a comment', () => {
    expect(analyze('SELECT 1 /* DROP TABLE users */ FROM t').forbidden).toEqual([]);
    expect(analyze('SELECT 1 -- DROP TABLE users\nFROM t').forbidden).toEqual([]);
    expect(analyze('SELECT 1 # DROP TABLE users\nFROM t').forbidden).toEqual([]);
  });

  it('ignores a keyword inside a dollar-quoted string', () => {
    expect(analyze('SELECT $$DROP TABLE users$$ FROM t').forbidden).toEqual([]);
    expect(analyze('SELECT $tag$DELETE FROM x$tag$ FROM t').forbidden).toEqual([]);
  });

  it('still catches a keyword AFTER a quoted region closes', () => {
    // The string must not swallow the rest of the statement.
    expect(analyze("SELECT 'safe' FROM t; DROP TABLE users").forbidden).toContain('DROP');
  });

  it('handles doubled-quote escapes without losing the closing quote', () => {
    // 'it''s' is one string; DROP after it must still be seen.
    expect(analyze("SELECT 'it''s' FROM t; DROP TABLE users").forbidden).toContain('DROP');
  });

  it('handles backslash escapes without losing the closing quote', () => {
    expect(analyze("SELECT 'a\\'b' FROM t; DROP TABLE users").forbidden).toContain('DROP');
  });
});

describe('lexer — stacked statements', () => {
  it('allows a single trailing semicolon', () => {
    expect(analyze('SELECT * FROM users;').hasStackedStatements).toBe(false);
  });

  it('allows no semicolon', () => {
    expect(analyze('SELECT * FROM users').hasStackedStatements).toBe(false);
  });

  it('rejects two statements', () => {
    expect(analyze('SELECT 1; DROP TABLE users').hasStackedStatements).toBe(true);
  });

  it('rejects two statements even when both are SELECTs', () => {
    expect(analyze('SELECT 1; SELECT 2').hasStackedStatements).toBe(true);
  });

  it('ignores a semicolon inside a string literal', () => {
    expect(analyze("SELECT 'a;b' FROM t").hasStackedStatements).toBe(false);
  });

  it('ignores a semicolon inside a comment', () => {
    expect(analyze('SELECT 1 /* ; */ FROM t').hasStackedStatements).toBe(false);
  });
});

describe('lexer — MySQL executable comments', () => {
  it('detects /*! ... */', () => {
    expect(analyze('SELECT 1 /*!32302 DROP TABLE users */').hasExecutableComment).toBe(true);
  });

  it('detects optimiser hints /*+ ... */', () => {
    expect(analyze('SELECT /*+ MAX_EXECUTION_TIME(1) */ 1').hasExecutableComment).toBe(true);
  });

  it('does not flag an ordinary comment', () => {
    expect(analyze('SELECT 1 /* ordinary */').hasExecutableComment).toBe(false);
  });
});

describe('lexer — comment-splitting evasion', () => {
  it('does not let an inline comment glue a keyword back together', () => {
    // A stripped comment becomes whitespace, so SEL/**/ECT never re-forms as SELECT.
    const r = analyze('SEL/**/ECT 1');
    expect(r.firstKeyword).not.toBe('SELECT');
  });

  it('catches DROP split across a comment as two non-keywords, not a bypass', () => {
    // DR/**/OP does not re-form into DROP — but neither is it a valid statement;
    // the first-keyword check is what rejects it.
    const r = analyze('DR/**/OP TABLE users');
    expect(r.firstKeyword).toBe('DR');
    expect(r.firstKeyword).not.toBe('SELECT');
  });
});

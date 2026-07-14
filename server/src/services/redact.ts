export const REDACTION_MASK = '[REDACTED]';

/**
 * Match a column name against a glob-style pattern.
 * Supports `*` as a wildcard (e.g. `*_token`, `password`).
 */
export function matchesPattern(pattern: string, name: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(name);
}

export function matchesAnyPattern(name: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(p, name));
}

/**
 * Find the first column identifier that matches a redaction pattern.
 * Used to block Query Runner SQL that names sensitive columns (including
 * under aliases, expressions, WHERE/JOIN clauses) so values cannot be
 * exfiltrated by renaming the result column.
 *
 * Returns the matching column name, or null if none match.
 */
export function findSensitiveColumnReference(
  columnNames: string[],
  patterns: string[]
): string | null {
  if (patterns.length === 0 || columnNames.length === 0) return null;

  for (const col of columnNames) {
    if (matchesAnyPattern(col, patterns)) {
      return col;
    }
  }
  return null;
}

export function redactRow(
  row: Record<string, unknown>,
  patterns: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = matchesAnyPattern(key, patterns) ? REDACTION_MASK : value;
  }
  return out;
}

export function redactRows(
  rows: Record<string, unknown>[],
  patterns: string[]
): Record<string, unknown>[] {
  if (patterns.length === 0) return rows;
  return rows.map((r) => redactRow(r, patterns));
}

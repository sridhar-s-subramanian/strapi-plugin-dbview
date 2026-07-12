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

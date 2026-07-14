import { describe, it, expect } from 'vitest';
import {
  matchesPattern,
  matchesAnyPattern,
  findSensitiveColumnReference,
  redactRows,
  REDACTION_MASK,
} from '../src/services/redact';

const patterns = ['password', '*_token', '*_secret'];

describe('matchesPattern', () => {
  it('matches exact names case-insensitively', () => {
    expect(matchesPattern('password', 'Password')).toBe(true);
    expect(matchesPattern('password', 'name')).toBe(false);
  });

  it('supports glob *', () => {
    expect(matchesPattern('*_token', 'api_token')).toBe(true);
    expect(matchesPattern('*_token', 'token')).toBe(false);
  });
});

describe('findSensitiveColumnReference', () => {
  it('returns the first matching column', () => {
    expect(findSensitiveColumnReference(['id', 'password', 'name'], patterns)).toBe('password');
    expect(findSensitiveColumnReference(['api_token'], patterns)).toBe('api_token');
  });

  it('returns null when none match', () => {
    expect(findSensitiveColumnReference(['id', 'name'], patterns)).toBeNull();
    expect(findSensitiveColumnReference([], patterns)).toBeNull();
  });

  it('returns null when patterns are empty', () => {
    expect(findSensitiveColumnReference(['password'], [])).toBeNull();
  });
});

describe('redactRows', () => {
  it('masks matching keys and leaves others', () => {
    const out = redactRows([{ password: 'x', name: 'a', api_token: 't' }], patterns);
    expect(out[0].password).toBe(REDACTION_MASK);
    expect(out[0].api_token).toBe(REDACTION_MASK);
    expect(out[0].name).toBe('a');
  });
});

describe('matchesAnyPattern', () => {
  it('is true when any pattern hits', () => {
    expect(matchesAnyPattern('reset_token', patterns)).toBe(true);
    expect(matchesAnyPattern('email', patterns)).toBe(false);
  });
});

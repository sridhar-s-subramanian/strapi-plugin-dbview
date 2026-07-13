import { describe, it, expect } from 'vitest';
import { getRequestErrorMessage } from '../src/utils/errors';

describe('getRequestErrorMessage', () => {
  it('returns a policy rejection string from response.data.error', () => {
    // Our controllers return rejections as 200 { error: "<reason>" }; when the
    // status is non-2xx the fetch client throws with the body on response.data.
    const err = { response: { data: { error: 'The table "admin_users" is not accessible.' } } };
    expect(getRequestErrorMessage(err)).toBe('The table "admin_users" is not accessible.');
  });

  it('unwraps a framework error object { message }', () => {
    const err = { response: { data: { error: { status: 400, name: 'BadRequestError', message: 'sql is required' } } } };
    expect(getRequestErrorMessage(err)).toBe('sql is required');
  });

  it('falls back to an Error message when there is no response body', () => {
    expect(getRequestErrorMessage(new Error('Network down'))).toBe('Network down');
  });

  it('returns the default when nothing usable is present', () => {
    expect(getRequestErrorMessage({})).toBe('An error occurred while running the query.');
    expect(getRequestErrorMessage(undefined)).toBe('An error occurred while running the query.');
    expect(getRequestErrorMessage(new Error(''))).toBe('An error occurred while running the query.');
  });

  it('never returns an empty string (the bug that showed a blank error box)', () => {
    for (const input of [{}, null, undefined, { response: {} }, { response: { data: {} } }, new Error('')]) {
      expect(getRequestErrorMessage(input)).not.toBe('');
    }
  });
});

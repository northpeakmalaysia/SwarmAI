import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchJSON } from '../lib/test-helpers.js';

describe('Auth Regression', () => {
  it('Unauthenticated /api/config should not succeed', async () => {
    const res = await fetchJSON('/api/config');
    assert.notStrictEqual(res.status, 200, 'Unauthenticated request should not return 200');
  });

  it('Unauthenticated /api/vault should not succeed', async () => {
    const res = await fetchJSON('/api/vault');
    assert.notStrictEqual(res.status, 200, 'Unauthenticated vault access should not return 200');
  });

  it('Invalid bearer token should be rejected', async () => {
    const res = await fetchJSON('/api/config', {
      headers: { Authorization: 'Bearer totally-invalid-token' },
    });
    assert.notStrictEqual(res.status, 200, 'Invalid token should not grant access');
  });

  it('Dashboard should remain publicly accessible', async () => {
    const res = await fetchJSON('/dashboard/');
    assert.ok(res.status === 200 || res.status === 301 || res.status === 302, 'Dashboard should be publicly accessible');
  });

  it('Base URL should remain publicly accessible', async () => {
    const res = await fetchJSON('/');
    assert.ok(res.status >= 200 && res.status < 500, 'Base URL should respond');
  });
});

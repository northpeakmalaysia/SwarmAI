import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchJSON, expectJSON } from '../lib/test-helpers.js';

describe('Peers API', () => {
  it('GET /api/peers should return peers or 401/403/404', async () => {
    const res = await fetchJSON('/api/peers');
    assert.ok(
      res.status === 200 || res.status === 401 || res.status === 403 || res.status === 404,
      `Unexpected status ${res.status}`
    );
    if (res.status === 200) {
      const body = await expectJSON(res);
      assert.ok(
        Array.isArray(body) || body.peers || Array.isArray(body.data),
        'Peers response should contain a peers array'
      );
    }
  });

  it('GET /api/peers should not return 500', async () => {
    const res = await fetchJSON('/api/peers');
    assert.notStrictEqual(res.status, 500, 'Peers endpoint should not crash with 500');
  });
});

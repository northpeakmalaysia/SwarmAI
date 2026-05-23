import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchJSON, expectJSON } from '../lib/test-helpers.js';

describe('Channels API', () => {
  it('GET /api/channels should return channels or 401/403/404', async () => {
    const res = await fetchJSON('/api/channels');
    assert.ok(
      res.status === 200 || res.status === 401 || res.status === 403 || res.status === 404,
      `Unexpected status ${res.status}`
    );
    if (res.status === 200) {
      const body = await expectJSON(res);
      assert.ok(
        Array.isArray(body) || body.channels || Array.isArray(body.data),
        'Channels response should contain a channels array'
      );
    }
  });

  it('GET /api/channels should not return 500', async () => {
    const res = await fetchJSON('/api/channels');
    assert.notStrictEqual(res.status, 500, 'Channels endpoint should not crash with 500');
  });
});

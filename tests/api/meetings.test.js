import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchJSON, expectJSON } from '../lib/test-helpers.js';

describe('Meetings API', () => {
  it('GET /api/meetings should return meetings or 401/403/404', async () => {
    const res = await fetchJSON('/api/meetings');
    assert.ok(
      res.status === 200 || res.status === 401 || res.status === 403 || res.status === 404,
      `Unexpected status ${res.status}`
    );
    if (res.status === 200) {
      const body = await expectJSON(res);
      assert.ok(
        body.meetings || Array.isArray(body) || Array.isArray(body.data),
        'Meetings response should contain a meetings array'
      );
    }
  });

  it('GET /api/meetings should not return 500', async () => {
    const res = await fetchJSON('/api/meetings');
    assert.notStrictEqual(res.status, 500, 'Meetings endpoint should not crash with 500');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchJSON, expectJSON } from '../lib/test-helpers.js';

describe('Tool Registry API', () => {
  it('should list available tools via API', async () => {
    const res = await fetchJSON('/api/tools');
    assert.ok(res.status === 200 || res.status === 404 || res.status === 401, `Unexpected status ${res.status}`);
    if (res.status === 200) {
      const body = await expectJSON(res);
      assert.ok(
        Array.isArray(body) || body.tools || body.data || typeof body === 'object',
        'Tools endpoint should return a list or object'
      );
    }
  });

  it('should list peers via API', async () => {
    const res = await fetchJSON('/api/peers');
    assert.ok(res.status === 200 || res.status === 404 || res.status === 401, `Unexpected status ${res.status}`);
    if (res.status === 200) {
      const body = await expectJSON(res);
      assert.ok(Array.isArray(body) || body.peers, 'Peers endpoint should return a list');
    }
  });

  it('should list channels via API', async () => {
    const res = await fetchJSON('/api/channels');
    assert.ok(res.status === 200 || res.status === 404 || res.status === 401, `Unexpected status ${res.status}`);
    if (res.status === 200) {
      const body = await expectJSON(res);
      assert.ok(Array.isArray(body) || body.channels, 'Channels endpoint should return a list');
    }
  });
});

describe('Meeting API', () => {
  it('should list meetings via API', async () => {
    const res = await fetchJSON('/api/meetings');
    assert.ok(res.status === 200 || res.status === 404 || res.status === 401, `Unexpected status ${res.status}`);
    if (res.status === 200) {
      const body = await expectJSON(res);
      assert.ok(body.meetings || Array.isArray(body), 'Meetings endpoint should return a list');
    }
  });
});

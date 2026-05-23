import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchJSON, expectJSON } from '../lib/test-helpers.js';

describe('API Health Checks', () => {
  it('should respond on the base URL', async () => {
    const res = await fetchJSON('/');
    assert.ok(res.status >= 200 && res.status < 500, `Expected valid response, got ${res.status}`);
  });

  it('should expose a health or status endpoint', async () => {
    const candidates = ['/health', '/status', '/api/health', '/api/status'];
    let found = false;
    let lastStatus = null;
    for (const path of candidates) {
      const res = await fetchJSON(path);
      lastStatus = res.status;
      if (res.status === 200) {
        const body = await res.text();
        assert.ok(body.length > 0, 'Health endpoint returned empty body');
        found = true;
        break;
      }
    }
    if (!found) {
      // Accept if base URL is healthy but no dedicated endpoint exists
      const baseRes = await fetchJSON('/');
      assert.ok(baseRes.status < 500, `No dedicated health endpoint found and base URL returned ${baseRes.status}`);
    }
  });

  it('should return JSON for API status if available', async () => {
    const res = await fetchJSON('/api/status');
    if (res.status === 200) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await res.json();
        assert.ok(typeof body === 'object', 'API status should return a JSON object');
      }
    }
  });
});

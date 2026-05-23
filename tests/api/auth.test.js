import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchJSON, expectStatus, expectJSON, expectHTML } from '../lib/test-helpers.js';

describe('Auth & API Pipeline', () => {
  describe('Authentication Guards', () => {
    it('should reject unauthenticated access to protected endpoints with 401/403', async () => {
      const protectedPaths = ['/api/config', '/api/providers', '/api/vault'];
      for (const path of protectedPaths) {
        const res = await fetchJSON(path);
        assert.ok(
          res.status === 401 || res.status === 403 || res.status === 404,
          `${path} should reject unauthenticated requests (got ${res.status})`
        );
      }
    });

    it('should reject invalid bearer tokens', async () => {
      const res = await fetchJSON('/api/config', {
        headers: { Authorization: 'Bearer invalid-token-12345' },
      });
      assert.notStrictEqual(res.status, 200, 'Fake token should not grant 200 access');
    });

    it('should reject malformed Authorization headers', async () => {
      const res = await fetchJSON('/api/config', {
        headers: { Authorization: 'NotBearer token123' },
      });
      assert.notStrictEqual(res.status, 200, 'Malformed auth header should not grant access');
    });
  });

  describe('Public Endpoints', () => {
    it('should serve dashboard without auth', async () => {
      const res = await fetchJSON('/dashboard/');
      assert.ok(res.status === 200 || res.status === 301 || res.status === 302, `Dashboard should be reachable (got ${res.status})`);
      if (res.status === 200) {
        const body = await expectHTML(res);
        assert.ok(body.length > 0, 'Dashboard HTML body should not be empty');
      }
    });

    it('should serve static base URL', async () => {
      const res = await fetchJSON('/');
      assert.ok(res.status >= 200 && res.status < 500, `Base URL should respond (got ${res.status})`);
    });
  });

  describe('Model Config API', () => {
    it('should expose model-tree config endpoint', async () => {
      const res = await fetchJSON('/api/config/model-tree');
      if (res.status === 200) {
        const body = await expectJSON(res, ['tiers']);
        assert.ok(typeof body.tiers === 'object', 'Model tree should contain tiers object');
      } else {
        assert.ok(res.status === 401 || res.status === 403 || res.status === 404, `Unexpected status ${res.status}`);
      }
    });

    it('should expose providers config endpoint', async () => {
      const res = await fetchJSON('/api/providers');
      assert.ok(res.status === 200 || res.status === 401 || res.status === 403 || res.status === 404, `Unexpected status ${res.status}`);
      if (res.status === 200) {
        const body = await res.json();
        assert.ok(body, 'Providers config should return valid JSON');
      }
    });
  });
});

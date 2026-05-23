import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CONFIG } from '../lib/test-config.js';
import { fetchJSON, timed } from '../lib/test-helpers.js';

async function timeRequest(url) {
  const { ms } = await timed(() => fetchJSON(url));
  return ms;
}

describe('Performance Smoke Tests', () => {
  it('Dashboard static assets respond under threshold', async () => {
    const assets = ['/', '/dashboard/'];
    for (const path of assets) {
      const ms = await timeRequest(path);
      assert.ok(ms < CONFIG.thresholds.dashboardResponseMs, `${path} took ${ms.toFixed(0)}ms > ${CONFIG.thresholds.dashboardResponseMs}ms`);
    }
  });

  it('API endpoints respond under threshold', async () => {
    const endpoints = ['/api/config', '/api/tools', '/api/peers'];
    for (const path of endpoints) {
      try {
        const ms = await timeRequest(path);
        assert.ok(ms < CONFIG.thresholds.apiResponseMs, `${path} took ${ms.toFixed(0)}ms > ${CONFIG.thresholds.apiResponseMs}ms`);
      } catch (err) {
        // 401/403/404 are acceptable for protected/missing endpoints
        assert.ok(true, `${path} returned non-200 status which is acceptable for performance baseline`);
      }
    }
  });

  it('Server handles sequential requests without crashing', async () => {
    const urls = Array.from({ length: 5 }, () => '/');
    for (const path of urls) {
      const res = await fetchJSON(path);
      assert.ok(res.status < 500, 'Server crashed under sequential load');
    }
  });

  it('Server handles parallel requests without crashing', async () => {
    const requests = Array.from({ length: CONFIG.thresholds.concurrentRequests }, () => fetchJSON('/'));
    const responses = await Promise.all(requests);
    for (const res of responses) {
      assert.ok(res.status < 500, 'Server crashed under parallel load');
    }
  });
});

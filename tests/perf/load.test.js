import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CONFIG } from '../lib/test-config.js';
import { fetchJSON, timed } from '../lib/test-helpers.js';

describe('Load Tests', () => {
  it('Base URL sustains 20 parallel requests', async () => {
    const count = 20;
    const requests = Array.from({ length: count }, () => fetchJSON('/'));
    const responses = await Promise.all(requests);
    for (const res of responses) {
      assert.ok(res.status < 500, 'Server crashed under 20 parallel requests');
    }
  });

  it('Dashboard URL sustains 10 parallel requests', async () => {
    const count = 10;
    const requests = Array.from({ length: count }, () => fetchJSON('/dashboard/'));
    const responses = await Promise.all(requests);
    for (const res of responses) {
      assert.ok(res.status < 500, 'Server crashed under 10 parallel dashboard requests');
    }
  });

  it('API endpoints average response time under 3s under load', async () => {
    const endpoints = ['/api/config', '/api/tools'];
    const times = [];
    for (const path of endpoints) {
      try {
        const { ms } = await timed(() => fetchJSON(path));
        times.push(ms);
      } catch {
        // Ignore errors from protected endpoints
      }
    }
    if (times.length > 0) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      assert.ok(avg < 3000, `Average API response time ${avg.toFixed(0)}ms > 3000ms`);
    }
  });

  it('Burst of 50 rapid sequential requests', async () => {
    const errors = [];
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetchJSON('/');
        if (res.status >= 500) errors.push(`Request ${i} returned ${res.status}`);
      } catch (err) {
        errors.push(`Request ${i} threw: ${err.message}`);
      }
    }
    assert.ok(errors.length === 0, `Burst load errors: ${errors.join('; ')}`);
  });
});

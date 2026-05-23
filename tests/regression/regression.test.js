import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchJSON, expectHTML } from '../lib/test-helpers.js';

describe('Regression Suite — Core Endpoints', () => {
  const endpoints = [
    { path: '/', name: 'Base URL' },
    { path: '/dashboard/', name: 'Dashboard' },
    { path: '/api/config', name: 'Config API' },
    { path: '/api/tools', name: 'Tools API' },
    { path: '/api/peers', name: 'Peers API' },
    { path: '/api/channels', name: 'Channels API' },
    { path: '/api/meetings', name: 'Meetings API' },
  ];

  for (const { path, name } of endpoints) {
    it(`GET ${path} should not return 500`, async () => {
      const res = await fetchJSON(path);
      assert.notStrictEqual(res.status, 500, `${name} endpoint returned 500`);
    });
  }

  it('GET /dashboard/ should return HTML', async () => {
    const res = await fetchJSON('/dashboard/');
    const body = await expectHTML(res);
    assert.ok(body.length > 0, 'Dashboard HTML body should not be empty');
  });

  it('GET /api/config should return JSON or 401/403', async () => {
    const res = await fetchJSON('/api/config');
    assert.ok(
      res.status === 200 || res.status === 401 || res.status === 403 || res.status === 404,
      `Unexpected status ${res.status}`
    );
  });

  it('Server should handle sequential requests without crashing', async () => {
    const requests = Array.from({ length: 5 }, () => fetchJSON('/'));
    const responses = await Promise.all(requests);
    for (const res of responses) {
      assert.ok(res.status < 500, 'Server crashed under sequential load');
    }
  });
});

describe('Regression Suite — Headers & CORS', () => {
  it('Responses should include content-type header', async () => {
    const res = await fetchJSON('/');
    assert.ok(res.headers.has('content-type'), 'Response missing content-type header');
  });
});

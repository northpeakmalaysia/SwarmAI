// SwarmAI Test Helpers
// Shared utilities for API integration, regression, and performance tests

import assert from 'node:assert';
import { CONFIG, getFullUrl } from './test-config.js';

/**
 * Perform a fetch with automatic timeout and basic validation.
 */
export async function fetchJSON(path, options = {}) {
  const url = getFullUrl(path);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeouts.request);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Assert that a response status is in an expected set.
 */
export function expectStatus(response, expectedStatuses, context = '') {
  const msg = context
    ? `${context}: expected status in [${expectedStatuses.join(', ')}], got ${response.status}`
    : `Expected status in [${expectedStatuses.join(', ')}], got ${response.status}`;
  assert.ok(expectedStatuses.includes(response.status), msg);
}

/**
 * Assert that a response is JSON and optionally validate keys.
 */
export async function expectJSON(response, requiredKeys = []) {
  assert.ok(
    response.headers.get('content-type')?.includes('application/json'),
    `Expected JSON response, got content-type: ${response.headers.get('content-type')}`
  );
  const body = await response.json();
  for (const key of requiredKeys) {
    assert.ok(key in body, `Expected response body to contain key "${key}"`);
  }
  return body;
}

/**
 * Assert that a response is HTML.
 */
export async function expectHTML(response) {
  const body = await response.text();
  assert.ok(
    response.headers.get('content-type')?.includes('text/html') || body.includes('<!DOCTYPE html>') || body.includes('<html'),
    'Expected HTML response'
  );
  return body;
}

/**
 * Time an async function and return { result, ms }.
 */
export async function timed(fn) {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  return { result, ms };
}

/**
 * Retry an async assertion up to N times with backoff.
 */
export async function retry(fn, { maxAttempts = CONFIG.retries.api, backoffMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, backoffMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/**
 * Generate a unique test identifier.
 */
export function generateTestId(prefix = 'test') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Verify server is reachable before running tests.
 */
export async function assertServerReachable() {
  try {
    const res = await fetch(CONFIG.baseURL, { signal: AbortSignal.timeout(CONFIG.timeouts.request) });
    assert.ok(res.status < 500, `Server is unreachable or returning 5xx at ${CONFIG.baseURL}`);
  } catch (err) {
    throw new Error(`Server not reachable at ${CONFIG.baseURL}: ${err.message}`);
  }
}

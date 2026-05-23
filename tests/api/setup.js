// SwarmAI API Test Setup
// Global lifecycle hooks for API integration tests

import { before, after } from 'node:test';
import { CONFIG } from '../lib/test-config.js';
import { assertServerReachable } from '../lib/test-helpers.js';

let serverReady = false;

before(async () => {
  if (!serverReady) {
    await assertServerReachable();
    serverReady = true;
  }
});

after(() => {
  // Optional: cleanup tasks (e.g., drop test data, revoke test tokens)
});

export { CONFIG };

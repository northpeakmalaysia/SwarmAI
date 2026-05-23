// SwarmAI Test Configuration
// Centralized config for all test suites

export const CONFIG = {
  baseURL: process.env.SWARMAI_TEST_URL || 'http://localhost:7910',
  frontendURL: process.env.FRONTEND_TEST_URL || 'http://localhost:5173',
  timeouts: {
    request: parseInt(process.env.SWARMAI_TEST_TIMEOUT, 10) || 10000,
    e2e: parseInt(process.env.SWARMAI_TEST_E2E_TIMEOUT, 10) || 30000,
    perf: parseInt(process.env.SWARMAI_TEST_PERF_TIMEOUT, 10) || 20000,
  },
  retries: {
    api: parseInt(process.env.SWARMAI_TEST_RETRIES, 10) || 2,
    perf: 1,
  },
  thresholds: {
    apiResponseMs: 2000,
    dashboardResponseMs: 3000,
    staticAssetMs: 1500,
    concurrentRequests: 10,
  },
};

export function getAuthHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getFullUrl(path) {
  const base = CONFIG.baseURL.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

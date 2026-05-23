# SwarmAI QA Test Strategy

## Overview

This document outlines the testing approach for the SwarmAI gateway and dashboard.

## Test Levels

| Level | Directory | Purpose | Tool |
|-------|-----------|---------|------|
| Unit | N/A | Per-module logic | Node.js native test runner |
| API Integration | `tests/api/` | HTTP contract + auth | Node.js native test runner + fetch |
| E2E | `tests/e2e/` | Critical user journeys | Playwright |
| Regression | `tests/regression/` | Smoke checks on core endpoints | Node.js native test runner |
| Performance | `tests/perf/` | Response-time thresholds + load | Node.js native test runner |

## Running Tests

```bash
# API integration tests
npm run test:api

# Regression smoke tests
npm run test:regression

# Performance smoke tests
npm run test:perf

# E2E tests (requires frontend dev server or gateway running)
npm run test:e2e

# Run all suites sequentially
npm run test:all
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SWARMAI_TEST_URL` | `http://localhost:7910` | Base URL for API/regression/perf tests |
| `FRONTEND_TEST_URL` | `http://localhost:5173` | Base URL for Playwright E2E tests |
| `SWARMAI_TEST_TIMEOUT` | `10000` | Per-request timeout in ms |
| `SWARMAI_TEST_E2E_TIMEOUT` | `30000` | E2E test timeout in ms |
| `SWARMAI_TEST_PERF_TIMEOUT` | `20000` | Performance test timeout in ms |
| `SWARMAI_TEST_RETRIES` | `2` | Retry attempts for flaky API tests |

## Framework Structure

```
tests/
├── lib/
│   ├── test-config.js      # Centralized URLs, timeouts, thresholds
│   └── test-helpers.js     # Shared utilities: fetchJSON, expectJSON, timed, retry
├── api/
│   ├── setup.js              # Global before/after hooks
│   ├── auth.test.js          # Auth flows + protected endpoint guards
│   ├── health.test.js        # Health endpoint checks
│   ├── tools.test.js         # Tool registry + meeting API
│   ├── channels.test.js      # Channel listing API
│   ├── peers.test.js         # Peer listing API
│   └── meetings.test.js      # Meeting API
├── e2e/
│   ├── dashboard.spec.js     # Dashboard stats + health
│   ├── login.spec.js         # Gateway login / pair flow
│   ├── navigation.spec.js    # Sidebar navigation + users table
│   └── agents.spec.js        # Agents/peers page + API reachability
├── regression/
│   ├── regression.test.js    # Core endpoint 500-guard suite
│   └── auth-regression.test.js # Auth-specific regression checks
├── perf/
│   ├── smoke.test.js         # Response-time thresholds
│   └── load.test.js          # Concurrent request handling
├── README.md                 # This file
├── TEST-STRATEGY.md          # Detailed strategy document
└── TODO.md                   # Task tracker
```

## Current Status

- [x] API integration test framework set up (`tests/lib/`, `tests/api/setup.js`)
- [x] Auth and API pipeline tests written (`auth.test.js`, `health.test.js`, `tools.test.js`, `channels.test.js`, `peers.test.js`, `meetings.test.js`)
- [x] Playwright E2E project configured (`playwright.config.js` + `tests/e2e/`)
- [x] QA regression suite created (`tests/regression/`)
- [x] Performance smoke tests created (`tests/perf/`)
- [x] Test scripts added to `package.json`
- [ ] CI/CD pipeline integration pending
- [ ] Coverage reporting pending

# QA Test Framework Implementation TODO

## Pre-Existing Files Found (do NOT count as newly completed)
- [x] tests/README.md (pre-existing)
- [x] tests/api/auth.test.js (pre-existing — basic stubs)
- [x] tests/api/health.test.js (pre-existing — basic stubs)
- [x] tests/api/tools.test.js (pre-existing — basic stubs)
- [x] tests/e2e/dashboard.spec.js (pre-existing — basic stubs)
- [x] tests/perf/smoke.test.js (pre-existing — basic stubs)
- [x] tests/regression/regression.test.js (pre-existing — basic stubs)
- [x] playwright.config.js (pre-existing)

## Tasks to Complete

### Task 1: Set up API Integration Test Framework
- [x] Create `tests/lib/test-helpers.js` — shared utilities (request helpers, auth setup, retry logic)
- [x] Create `tests/lib/test-config.js` — centralized config (base URL, timeouts, credentials)
- [x] Create `tests/api/setup.js` — global test lifecycle hooks
- [x] Update root `package.json` with test scripts

### Task 2: Write Integration Tests for Auth and API Pipelines
- [x] Expand `tests/api/auth.test.js` with real auth flows (login, token validation, logout)
- [x] Expand `tests/api/health.test.js` with schema validation
- [x] Expand `tests/api/tools.test.js` with actual tool registry assertions
- [x] Create `tests/api/channels.test.js` — channel API tests
- [x] Create `tests/api/peers.test.js` — peer API tests
- [x] Create `tests/api/meetings.test.js` — meeting API tests

### Task 3: Set up Playwright E2E Project with Critical User Journeys
- [x] Verify/fix `playwright.config.js`
- [x] Expand `tests/e2e/dashboard.spec.js` with real dashboard assertions
- [x] Create `tests/e2e/login.spec.js` — login/pair flow
- [x] Create `tests/e2e/navigation.spec.js` — sidebar navigation
- [x] Create `tests/e2e/agents.spec.js` — agents page journeys

### Task 4: Create QA Regression Suite and Performance Smoke Tests
- [x] Expand `tests/regression/regression.test.js` with full endpoint coverage
- [x] Create `tests/regression/auth-regression.test.js`
- [x] Expand `tests/perf/smoke.test.js` with latency thresholds
- [x] Create `tests/perf/load.test.js` — concurrent request handling

### Task 5: Document Test Strategy and Update Drawer with Progress
- [x] Rewrite `tests/README.md` with updated status and architecture
- [x] Create `tests/TEST-STRATEGY.md` — comprehensive testing documentation
- [x] Update drawer with verified completion report

## Verification Checklist
- [x] All new files exist on disk and have non-trivial content
- [x] `node --test` runs successfully on API/regression/perf tests
- [x] `npx playwright test` config is valid (dry-run at minimum)
- [x] package.json includes test scripts
- [x] README documents the full test architecture

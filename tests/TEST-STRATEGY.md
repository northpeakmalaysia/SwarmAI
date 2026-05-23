# SwarmAI Test Strategy Document

## 1. Scope

This test strategy covers the SwarmAI gateway (`server.js`) and the React SPA dashboard (`frontend-app/`).

## 2. Testing Pyramid

```
       /\
      /  \   E2E (Playwright) — Critical user journeys
     /____\
    /      \  Integration (node:test) — API contract, auth
   /________\
  /          \ Unit (node:test) — Module logic (future)
 /____________\
```

## 3. Test Categories

### 3.1 API Integration Tests
- **Goal**: Verify HTTP contracts, auth guards, and JSON schema
- **Approach**: Node.js native test runner with `fetch()` + shared helpers
- **Coverage**:
  - Auth: Bearer token validation, unauthenticated rejection, malformed headers
  - Health: Base URL reachability, dedicated health endpoints
  - Tools/Peers/Channels/Meetings: List endpoints return expected shapes
- **Retry**: Flaky network tolerated via `retry()` helper

### 3.2 E2E Tests (Playwright)
- **Goal**: Validate critical user journeys in a real browser
- **Approach**: Playwright with Chromium + Firefox projects
- **Coverage**:
  - Dashboard loads and displays stats cards
  - Sidebar navigation between Dashboard, Users, Settings
  - Users table renders mock data
  - Gateway login/pair flow is reachable
  - API health endpoint responds within threshold
- **Artifacts**: Screenshots and videos captured on failure

### 3.3 Regression Tests
- **Goal**: Ensure no 500 regressions on core endpoints
- **Approach**: Sequential + parallel smoke requests
- **Coverage**:
  - All documented endpoints return non-500
  - Auth endpoints reject unauthenticated traffic
  - Dashboard HTML is always served

### 3.4 Performance Tests
- **Goal**: Establish baseline latency and crash boundaries
- **Approach**: `performance.now()` timing + Promise.all() concurrency
- **Thresholds**:
  - Dashboard: < 3000ms
  - API endpoints: < 2000ms
  - Parallel load: 10–20 concurrent requests without 500
  - Burst: 50 rapid sequential requests without error

## 4. Test Data & Environment

- **Base URLs**: Configurable via `SWARMAI_TEST_URL` and `FRONTEND_TEST_URL`
- **Timeouts**: Centralized in `tests/lib/test-config.js`
- **No external test DB**: Tests rely on the running gateway instance
- **Mock data**: Frontend E2E tests rely on built-in mock users

## 5. CI/CD Integration (Planned)

```yaml
# Example pipeline step
- name: Run API + Regression + Performance
  run: |
    npm run test:api
    npm run test:regression
    npm run test:perf
- name: Run E2E
  run: npm run test:e2e
```

## 6. Ownership

- **QA Lead**: Framework architecture, regression + perf suites
- **Backend Devs**: API integration tests for new endpoints
- **Frontend Devs**: Playwright E2E tests for new UI flows

## 7. Risk Assessment

| Risk | Mitigation |
|------|------------|
| Gateway not running during tests | `assertServerReachable()` in setup.js |
| Protected endpoints return 401 | Tests accept 401/403 as valid states |
| Flaky network | Retry helper with exponential backoff |
| E2E tests brittle to UI changes | Semantic locators (text content, roles) |

## 8. Future Work

- Add coverage reporting (`c8` or `node --experimental-test-coverage`)
- Add contract/schema validation with Zod or JSON Schema
- Add visual regression testing (Playwright snapshots)
- Add integration with GitHub Actions / CI pipeline

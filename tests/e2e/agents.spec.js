import { test, expect } from '@playwright/test';

test.describe('Critical User Journeys — Agents / Peers', () => {
  test('Frontend app renders the layout correctly', async ({ page }) => {
    await page.goto('/');
    // Layout has sidebar + main content area
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('text=MyApp')).toBeVisible();
  });

  test('Gateway peers API is reachable when authenticated or returns expected status', async ({ request }) => {
    const gatewayURL = process.env.SWARMAI_TEST_URL || 'http://localhost:7910';
    const response = await request.get(`${gatewayURL}/api/peers`);
    const status = response.status();
    expect(status === 200 || status === 401 || status === 403 || status === 404).toBeTruthy();
  });

  test('Gateway channels API is reachable when authenticated or returns expected status', async ({ request }) => {
    const gatewayURL = process.env.SWARMAI_TEST_URL || 'http://localhost:7910';
    const response = await request.get(`${gatewayURL}/api/channels`);
    const status = response.status();
    expect(status === 200 || status === 401 || status === 403 || status === 404).toBeTruthy();
  });
});

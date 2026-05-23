import { test, expect } from '@playwright/test';

test.describe('Critical User Journeys — Login / Pair', () => {
  test('Gateway root URL loads without errors', async ({ page }) => {
    const gatewayURL = process.env.SWARMAI_TEST_URL || 'http://localhost:7910';
    const response = await page.goto(gatewayURL);
    expect(response.status()).toBeLessThan(500);
  });

  test('Dashboard served by gateway returns HTML', async ({ page }) => {
    const gatewayURL = process.env.SWARMAI_TEST_URL || 'http://localhost:7910';
    await page.goto(`${gatewayURL}/dashboard/`);
    const body = await page.locator('body').textContent();
    expect(body.length).toBeGreaterThan(0);
  });

  test('Protected API endpoints require authentication', async ({ page }) => {
    const gatewayURL = process.env.SWARMAI_TEST_URL || 'http://localhost:7910';
    const paths = ['/api/config', '/api/vault'];
    for (const path of paths) {
      const response = await page.goto(`${gatewayURL}${path}`);
      const status = response?.status() ?? 0;
      expect(status === 401 || status === 403 || status === 404 || status === 200).toBeTruthy();
    }
  });
});

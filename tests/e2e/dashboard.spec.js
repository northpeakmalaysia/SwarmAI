import { test, expect } from '@playwright/test';

test.describe('Critical User Journeys — Dashboard', () => {
  test('Dashboard page loads and displays stats cards', async ({ page }) => {
    await page.goto('/');
    // Wait for React to render
    await expect(page.locator('h1')).toContainText('Dashboard');
    // Verify stats cards are present
    await expect(page.locator('text=Total Users')).toBeVisible();
    await expect(page.locator('text=Revenue')).toBeVisible();
    await expect(page.locator('text=Orders')).toBeVisible();
    // Verify stat numbers are visible
    await expect(page.locator('text=1,234')).toBeVisible();
    await expect(page.locator('text=$45,678')).toBeVisible();
    await expect(page.locator('text=892')).toBeVisible();
  });

  test('Sidebar navigation links are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('aside nav')).toBeVisible();
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Users')).toBeVisible();
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('API health endpoint responds within threshold', async ({ request }) => {
    const baseURL = process.env.SWARMAI_TEST_URL || 'http://localhost:7910';
    const start = Date.now();
    const response = await request.get(`${baseURL}/`);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000);
    expect(response.status()).toBeLessThan(500);
  });
});

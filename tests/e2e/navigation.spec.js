import { test, expect } from '@playwright/test';

test.describe('Critical User Journeys — Navigation', () => {
  test('User can navigate between Dashboard, Users, and Settings', async ({ page }) => {
    await page.goto('/');
    // Start at Dashboard
    await expect(page.locator('h1')).toContainText('Dashboard');

    // Navigate to Users
    await page.locator('aside nav a:has-text("Users")').click();
    await expect(page.locator('h1')).toContainText('Users');
    await expect(page.locator('table')).toBeVisible();

    // Navigate to Settings
    await page.locator('aside nav a:has-text("Settings")').click();
    await expect(page.locator('h1')).toContainText('Settings');

    // Navigate back to Dashboard
    await page.locator('aside nav a:has-text("Dashboard")').click();
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('Active nav link is highlighted', async ({ page }) => {
    await page.goto('/users');
    const activeLink = page.locator('aside nav a[class*="bg-gray-800"]');
    await expect(activeLink).toContainText('Users');
  });

  test('Users page displays table with mock data', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('table')).toBeVisible();
    // Verify mock users appear
    await expect(page.locator('text=Alice Johnson')).toBeVisible();
    await expect(page.locator('text=Bob Smith')).toBeVisible();
    await expect(page.locator('text=Charlie Brown')).toBeVisible();
    // Verify role badges
    await expect(page.locator('text=Admin')).toBeVisible();
    await expect(page.locator('text=Editor')).toBeVisible();
    await expect(page.locator('text=Viewer')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test('homepage redirects to dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/dashboard');
});

test('dashboard page loads', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('body')).toBeVisible();
});

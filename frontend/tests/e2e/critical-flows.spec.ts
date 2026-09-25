import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Critical Flows', () => {

  test.describe('Login', () => {

    test('admin can log in via demo mode', async ({ page }) => {
      await loginAs(page, 'admin');
      await expect(page.locator('.text-sm.font-medium.text-on-surface').first()).toBeVisible();
    });

    test('user can log in via demo mode', async ({ page }) => {
      await loginAs(page, 'user');
      await expect(page.locator('.text-sm.font-medium.text-on-surface').first()).toBeVisible();
    });
  });

  test.describe('Dashboard', () => {

    test('dashboard loads and shows welcome message', async ({ page }) => {
      await loginAs(page, 'admin');
      await expect(page.locator('h1')).toContainText('Welcome', { timeout: 10000 });
    });

    test('dashboard shows items section or empty state', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/dashboard');
      // Either items exist or empty state is shown
      const hasItems = await page.locator('text=No items yet').isVisible().catch(() => false);
      const hasGrid = await page.locator('.grid').isVisible().catch(() => false);
      expect(hasItems || hasGrid).toBeTruthy();
    });
  });

  test.describe('Navigation', () => {

    test('sidebar navigation between pages', async ({ page }) => {
      await loginAs(page, 'admin');

      await page.locator('a[href="/items"]').click();
      await expect(page).toHaveURL(/\/items$/);

      await page.locator('a[href="/items/create"]').click();
      await expect(page).toHaveURL(/\/items\/create$/);

      await page.locator('a[href="/dashboard"]').click();
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  });

  test.describe('Create Item', () => {

    test('create item form renders', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/items/create');

      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator('input[type="text"]').first()).toBeVisible();
    });
  });
});

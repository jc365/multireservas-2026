import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Critical Flows', () => {

  test.describe('Login', () => {

    test('admin can log in via demo mode', async ({ page }) => {
      await loginAs(page, 'admin');
      await expect(page.locator('.text-sm.font-medium.text-on-surface').first()).toBeVisible();
    });

    test('employee can log in via demo mode', async ({ page }) => {
      await loginAs(page, 'employee');
      await expect(page.locator('.text-sm.font-medium.text-on-surface').first()).toBeVisible();
    });
  });

  test.describe('Dashboard', () => {

    test('dashboard loads and shows welcome message', async ({ page }) => {
      await loginAs(page, 'owner');
      await expect(page.locator('h1')).toContainText('Welcome', { timeout: 10000 });
    });

    test('dashboard shows services section or empty state', async ({ page }) => {
      await loginAs(page, 'owner');
      await page.goto('/dashboard');
      // Either services exist or empty state is shown
      const hasEmpty = await page.locator('text=No services yet').isVisible().catch(() => false);
      const hasGrid = await page.locator('.grid').isVisible().catch(() => false);
      expect(hasEmpty || hasGrid).toBeTruthy();
    });
  });

  test.describe('Navigation', () => {

    test('sidebar navigation between pages', async ({ page }) => {
      await loginAs(page, 'owner');

      await page.locator('a[href="/services"]').click();
      await expect(page).toHaveURL(/\/services$/);

      await page.locator('a[href="/services/create"]').click();
      await expect(page).toHaveURL(/\/services\/create$/);

      await page.locator('a[href="/dashboard"]').click();
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  });

  test.describe('Create Service', () => {

    test('create service form renders', async ({ page }) => {
      await loginAs(page, 'owner');
      await page.goto('/services/create');

      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator('input[type="text"]').first()).toBeVisible();
    });
  });
});

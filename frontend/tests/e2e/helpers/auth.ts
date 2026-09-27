import { Page, expect } from '@playwright/test';

export async function loginAs(page: Page, role: 'owner' | 'employee' | 'admin') {
  await page.goto('/dashboard');

  // Wait for the sidebar to be visible
  await page.locator('nav').waitFor({ state: 'visible', timeout: 10000 });

  // Check if demo mode toggle exists and is visible
  const demoText = page.locator('text=Demo Mode');
  const hasDemoMode = await demoText.isVisible().catch(() => false);

  if (!hasDemoMode) {
    // If demo mode text not visible, sidebar might be collapsed — expand it
    const menuBtn = page.locator('button[aria-label="Toggle sidebar"]');
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Wait for the demo mode toggle to be visible
  const toggleContainer = page.locator('.relative.w-10.h-5.rounded-full');
  await toggleContainer.waitFor({ state: 'visible', timeout: 5000 });

  // Check if already enabled
  const toggleClasses = await toggleContainer.getAttribute('class') || '';
  const isEnabled = toggleClasses.includes('bg-primary-container');

  if (!isEnabled) {
    // Click the toggle to enable demo mode — this logs in with default role (admin)
    await toggleContainer.click();
    // Wait for the role selector to appear
    const roleSelect = page.locator('select').filter({ has: page.locator('option[value="admin"]') });
    await roleSelect.waitFor({ state: 'visible', timeout: 5000 });
  }

  // Select the desired role — this triggers re-authentication
  const roleSelect = page.locator('select').filter({ has: page.locator('option[value="admin"]') });
  await roleSelect.waitFor({ state: 'visible', timeout: 5000 });

  // Check current selection
  const currentValue = await roleSelect.inputValue();
  if (currentValue !== role) {
    await roleSelect.selectOption(role);
    // Wait for the re-login to complete — the user name in the header should update
    await page.waitForTimeout(500);
  }

  // Verify we're authenticated by checking user name is visible
  await expect(page.locator('.text-sm.font-medium.text-on-surface').first()).toBeVisible({ timeout: 5000 });
}

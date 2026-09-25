import { Page, expect } from '@playwright/test';

export async function waitForToast(page: Page, message: string, type?: 'success' | 'error' | 'info') {
  const toast = page.locator(`[role="alert"]`, { hasText: message });
  await toast.waitFor({ state: 'visible', timeout: 10000 });
  
  if (type) {
    const classMap = {
      success: 'bg-primary-container',
      error: 'bg-error-container',
      info: 'bg-surface-container-lowest',
    };
    await expect(toast).toHaveClass(new RegExp(classMap[type]));
  }
  
  return toast;
}

export async function waitForToastToDisappear(page: Page, message: string) {
  const toast = page.locator(`[role="alert"]`, { hasText: message });
  await toast.waitFor({ state: 'hidden', timeout: 8000 });
}

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}

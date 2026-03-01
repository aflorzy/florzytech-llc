import { test, expect } from '@playwright/test';

test('smoke: dashboard and top nav render', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Devices' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Expenses' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Income' })).toBeVisible();
});

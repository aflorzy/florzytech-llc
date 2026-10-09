import { test, expect } from '@playwright/test';

test('smoke: dashboard and top nav render', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Devices' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Expenses' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Income' })).toBeVisible();
});

test('smoke: guide lists the scenarios and how the figures are worked out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Guide' }).click();
  await expect(page.getByRole('heading', { name: 'Guide', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Use a donor device for parts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Work order profit' })).toBeVisible();
});

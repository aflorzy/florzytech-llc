import { execSync } from 'node:child_process';
import { test, expect, type Locator, type Page } from '@playwright/test';

function resetAndSeed() {
  execSync('npm run test:setup', { stdio: 'inherit', env: process.env });
}

async function selectFirstNonEmptyOption(selectLocator: Locator) {
  const value = await selectLocator.evaluate((el: HTMLSelectElement) => {
    const option = Array.from(el.options).find((o) => o.value && o.value !== 'null');
    return option?.value ?? '';
  });
  if (!value) throw new Error('No selectable non-empty option found.');
  await selectLocator.selectOption(value);
}

async function selectOptionByLabelContains(selectLocator: Locator, labelFragment: string) {
  const value = await selectLocator.evaluate(
    (el: HTMLSelectElement, fragment: string) => {
      const normalized = fragment.trim().toLowerCase();
      const match = Array.from(el.options).find((o) => (o.label || o.textContent || '').toLowerCase().includes(normalized));
      return match?.value ?? '';
    },
    labelFragment
  );
  if (!value) throw new Error(`No option containing label fragment "${labelFragment}" found.`);
  await selectLocator.selectOption(value);
}

test.beforeEach(async () => {
  resetAndSeed();
});

async function submitAndWait(page: Page, locator: Locator) {
  await Promise.all([
    page.waitForLoadState('networkidle'),
    locator.click()
  ]);
}

async function openCollapsibleForm(
  page: Page,
  toggle: Locator,
  formField: Locator,
  retries = 5
) {
  for (let i = 0; i < retries; i++) {
    await toggle.click();
    const visible = await formField.isVisible();
    if (visible) return;
    await page.waitForTimeout(250);
  }
  await expect(formField).toBeVisible();
}

async function openSplitReceiptModal(
  page: Page,
  toggle: Locator,
  retries = 6
) {
  const dialog = page.getByRole('dialog');
  for (let i = 0; i < retries; i++) {
    await toggle.click();
    if (await dialog.isVisible()) return dialog.locator('[role="document"]');
    await page.waitForTimeout(250);
  }
  await expect(dialog).toBeVisible();
  return dialog.locator('[role="document"]');
}

async function ensureSplitLineExists(splitModal: Locator) {
  const rows = splitModal.locator('tbody tr');
  let count = await rows.count();
  if (count === 0) {
    await splitModal.getByRole('button', { name: 'Add Line' }).click();
    await expect(rows.first()).toBeVisible();
    count = await rows.count();
  }
  if (count === 0) {
    throw new Error('Split receipt modal has no line rows to edit.');
  }
}

test('purchased-device workflow preserves spending power math', async ({ page }) => {
  // 1) Create device
  const purchasedSerial = 'PW-PURCHASED-001';
  await page.goto('/devices');
  await openCollapsibleForm(page, page.getByTestId('devices-toggle-form'), page.getByLabel('Make'));
  await page.getByLabel('Make').fill('Google');
  await page.getByLabel('Model').fill('Pixel 7');
  await page.getByLabel('Serial/IMEI').fill(purchasedSerial);
  await submitAndWait(page, page.getByTestId('devices-save-device'));
  const purchasedRow = page.locator('tbody tr', { hasText: purchasedSerial }).first();
  const purchasedSku = (await purchasedRow.locator('td').first().innerText()).trim();

  // 2) Split receipt expense tied to device (120.00)
  await page.goto('/expenses');
  const splitModal = await openSplitReceiptModal(page, page.getByTestId('expenses-open-split-receipt'));
  await ensureSplitLineExists(splitModal);

  const firstRow = splitModal.locator('tbody tr').first();
  await firstRow.locator('select').nth(0).selectOption({ label: 'Parts' });
  await selectOptionByLabelContains(firstRow.locator('select').nth(1), purchasedSku);
  const subtotalInput = firstRow.locator('td').nth(6).getByRole('textbox');
  await subtotalInput.fill('120.00');
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/expenses/split') && res.status() === 200),
    splitModal.getByTestId('expenses-save-split-receipt').click()
  ]);

  // 3) Create work order and attach device
  await page.goto('/work-orders');
  await openCollapsibleForm(page, page.getByTestId('work-orders-toggle-form'), page.getByLabel('Target Action'));
  await page.getByLabel('Target Action').selectOption('SELL');
  const purchasedWorkOrderNote = 'PW purchased flow work order';
  await page.getByLabel('Notes').fill(purchasedWorkOrderNote);
  await submitAndWait(page, page.getByTestId('work-orders-create-work-order'));
  const purchasedWoRow = page.locator('tbody tr', { hasText: purchasedWorkOrderNote }).first();
  await purchasedWoRow.getByRole('link', { name: /^WO-/ }).click();
  await selectOptionByLabelContains(page.locator('form[action="?/add_device"] select[name="deviceId"]'), purchasedSku);
  await page.locator('form[action="?/add_device"] button', { hasText: 'Add' }).click();

  // 4) Add income via Add Income (300.00)
  await page.goto('/income');
  await openCollapsibleForm(page, page.getByTestId('income-toggle-form'), page.getByLabel('Amount (USD)'));
  await page.getByLabel('Amount (USD)').fill('300.00');
  await page.getByLabel('Type').selectOption('SERVICE');
  await submitAndWait(page, page.getByTestId('income-save-income'));

  // 5) Verify dashboard spending power
  // Seed baseline: 137.00, then -120.00 expense and +300.00 net income => 317.00
  await page.goto('/');
  await expect(page.getByTestId('dashboard-spending-power')).toHaveText('$317.00');
});

test('customer-brought-device workflow does not include purchase expense', async ({ page }) => {
  // 1) Create device (no expense)
  const customerSerial = 'PW-CUSTOMER-001';
  await page.goto('/devices');
  await openCollapsibleForm(page, page.getByTestId('devices-toggle-form'), page.getByLabel('Make'));
  await page.getByLabel('Make').fill('Samsung');
  await page.getByLabel('Model').fill('Galaxy S22');
  await page.getByLabel('Serial/IMEI').fill(customerSerial);
  await submitAndWait(page, page.getByTestId('devices-save-device'));
  const customerRow = page.locator('tbody tr', { hasText: customerSerial }).first();
  const customerSku = (await customerRow.locator('td').first().innerText()).trim();

  // 2) Create work order and attach device
  await page.goto('/work-orders');
  await openCollapsibleForm(page, page.getByTestId('work-orders-toggle-form'), page.getByLabel('Target Action'));
  await page.getByLabel('Target Action').selectOption('RETURN_TO_CUSTOMER');
  const customerWorkOrderNote = 'PW customer flow work order';
  await page.getByLabel('Notes').fill(customerWorkOrderNote);
  await submitAndWait(page, page.getByTestId('work-orders-create-work-order'));

  const customerWoRow = page.locator('tbody tr', { hasText: customerWorkOrderNote }).first();
  await customerWoRow.getByRole('link', { name: /^WO-/ }).click();
  await selectOptionByLabelContains(page.locator('form[action="?/add_device"] select[name="deviceId"]'), customerSku);
  await page.locator('form[action="?/add_device"] button', { hasText: 'Add' }).click();

  // 3) Add income via Add Income (150.00)
  await page.goto('/income');
  await openCollapsibleForm(page, page.getByTestId('income-toggle-form'), page.getByLabel('Amount (USD)'));
  await page.getByLabel('Amount (USD)').fill('150.00');
  await page.getByLabel('Type').selectOption('SERVICE');
  await submitAndWait(page, page.getByTestId('income-save-income'));

  // 4) Verify dashboard spending power only reflects income delta
  // Seed baseline: 137.00, then +150.00 net income, no new expense => 287.00
  await page.goto('/');
  await expect(page.getByTestId('dashboard-spending-power')).toHaveText('$287.00');
});

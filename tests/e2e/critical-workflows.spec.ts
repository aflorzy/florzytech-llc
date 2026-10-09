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

test('Sale Builder sells several devices in one income and credits each device', async ({ page }) => {
  // 1) Create two devices
  const devices = [
    { serial: 'PW-BUILDER-001', model: 'Pixel 7', amount: '300.00', sku: '' },
    { serial: 'PW-BUILDER-002', model: 'Pixel 8', amount: '100.00', sku: '' }
  ];
  await page.goto('/devices');
  for (const d of devices) {
    await openCollapsibleForm(page, page.getByTestId('devices-toggle-form'), page.getByLabel('Make'));
    await page.getByLabel('Make').fill('Google');
    await page.getByLabel('Model').fill(d.model);
    await page.getByLabel('Serial/IMEI').fill(d.serial);
    await submitAndWait(page, page.getByTestId('devices-save-device'));
    const row = page.locator('tbody tr', { hasText: d.serial }).first();
    await expect(row).toBeVisible();
    d.sku = (await row.locator('td').first().innerText()).trim();
    await page.goto('/devices');
  }

  // 2) One Sale Builder income with a DEVICE line per device
  await page.goto('/income');
  const builder = await openSplitReceiptModal(page, page.getByTestId('income-open-sale-builder'));
  await builder.locator('#bld-category').selectOption({ label: 'Device Sale' });
  for (let i = 0; i < devices.length; i++) {
    if (i > 0) await builder.getByRole('button', { name: 'Add Line' }).click();
    const row = builder.locator('tbody tr').nth(i);
    await expect(row).toBeVisible();
    await row.locator('select').nth(0).selectOption('DEVICE');
    await selectOptionByLabelContains(row.locator('select').nth(1), devices[i].sku);
    const amount = row.locator('td').nth(5).getByRole('textbox');
    await amount.fill(devices[i].amount);
    await amount.blur();
  }
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/income/create-lines') && res.status() === 200),
    builder.getByTestId('income-save-sale-builder').click()
  ]);
  await page.waitForLoadState('networkidle');

  // 3) The income row shows the category and both devices
  await page.goto('/income');
  const incomeRow = page.locator('tbody tr', { hasText: '$400.00' }).first();
  await expect(incomeRow).toContainText('Device Sale');
  for (const d of devices) await expect(incomeRow).toContainText(d.sku);

  // 4) Each device is sold and carries its own share of the sale
  await page.goto('/devices');
  for (const d of devices) {
    const row = page.locator('tbody tr', { hasText: d.serial }).first();
    await expect(row).toContainText(`$${d.amount}`);
    await expect(row.locator('select[name="status"]')).toHaveValue('SOLD');
  }

  // Seed baseline: 137.00, +400.00 => 537.00
  await page.goto('/');
  await expect(page.getByTestId('dashboard-spending-power')).toHaveText('$537.00');
});

// Issue #21: prices on work order lines, the parts markup and "invoiced"
test('work order line prices follow the parts markup until invoiced and never move spending power', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  // 1) Default parts markup: 50%
  await page.goto('/settings');
  await page.getByRole('link', { name: /Pricing/ }).click();
  await expect(page.getByLabel('Default parts markup (%)')).toHaveValue('30');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Default parts markup (%)').fill('50');
  await submitAndWait(page, page.getByRole('button', { name: 'Save' }));
  await expect(page.getByRole('status')).toHaveText('Saved.');

  // 2) A part in stock at $15.00
  await page.goto('/parts');
  await openCollapsibleForm(page, page.getByRole('button', { name: 'Add Part' }), page.getByLabel('Name'));
  await page.getByLabel('Name').fill('PW Screen');
  await page.getByLabel('Quantity').fill('5');
  await page.getByLabel('Unit Cost (USD, optional)').fill('15.00');
  await submitAndWait(page, page.getByRole('button', { name: 'Save Part' }));

  // 3) Work order with two of the part: 2 x $22.50
  await page.goto('/work-orders');
  await openCollapsibleForm(page, page.getByTestId('work-orders-toggle-form'), page.getByLabel('Target Action'));
  const note = 'PW priced work order';
  await page.getByLabel('Notes').fill(note);
  await submitAndWait(page, page.getByTestId('work-orders-create-work-order'));
  await page.locator('tbody tr', { hasText: note }).first().getByRole('link', { name: /^WO-/ }).click();
  await expect(page.getByText('Not invoiced', { exact: true })).toBeVisible();

  const itemForm = page.locator('form[action="?/add_item"]');
  await itemForm.locator('select[name="type"]').selectOption('PART');
  await itemForm.locator('select[name="partId"]').selectOption({ label: 'PW Screen' });
  await itemForm.locator('input[name="quantity"]').fill('2');
  await submitAndWait(page, itemForm.getByRole('button', { name: 'Add Part' }));

  const total = page.getByTestId('wo-invoice-total');
  const partRow = page.locator('tbody tr', { hasText: 'PW Screen' }).first();
  await expect(total).toHaveText('$45.00');
  await expect(page.getByTestId('wo-expected-profit')).toHaveText('$15.00');
  await expect(page.getByTestId('wo-balance-due')).toHaveText('$45.00');
  await expect(partRow).toContainText('2 × $22.50 = $45.00, 50% markup');

  // 4) Manual price, then back to the default
  await partRow.getByLabel('Price each for PW Screen').fill('80');
  await submitAndWait(page, partRow.getByRole('button', { name: 'Save' }));
  await expect(total).toHaveText('$160.00');
  await expect(partRow).toContainText('2 × $80.00 = $160.00, 433% (manual)');
  await submitAndWait(page, partRow.getByRole('button', { name: 'Use default' }));
  await expect(total).toHaveText('$45.00');

  // 5) A bad price is refused with a message
  await partRow.getByLabel('Price each for PW Screen').fill('abc');
  await submitAndWait(page, partRow.getByRole('button', { name: 'Save' }));
  await expect(page.getByRole('alert')).toContainText('Enter a price');
  await expect(total).toHaveText('$45.00');

  // 6) Invoiced: the work order keeps 50% when the default changes
  const workOrderUrl = page.url().split('?')[0];
  await page.goto(workOrderUrl);
  await submitAndWait(page, page.getByRole('button', { name: 'Mark invoiced' }));
  await expect(page.getByText(/^Invoiced \d/)).toBeVisible();
  await page.goto('/settings/pricing');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Default parts markup (%)').fill('10');
  await submitAndWait(page, page.getByRole('button', { name: 'Save' }));
  await page.goto(workOrderUrl);
  await expect(total).toHaveText('$45.00');

  // 7) Undo: back on the current default, 2 x $16.50
  await submitAndWait(page, page.getByRole('button', { name: 'Undo invoiced' }));
  await expect(page.getByText('Not invoiced', { exact: true })).toBeVisible();
  await expect(total).toHaveText('$33.00');

  // 8) No money moved. Seed baseline: 137.00
  await page.goto('/');
  await expect(page.getByTestId('dashboard-spending-power')).toHaveText('$137.00');
});

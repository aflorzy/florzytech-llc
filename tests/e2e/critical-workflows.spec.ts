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

// Issue #14: Add Income is the only way to record income; a sale of several devices is one income per device
test('a sale of two devices on one work order is one income per device, credited to each and added up on the work order', async ({ page }) => {
  // 1) Create two devices
  const devices = [
    { serial: 'PW-SALE-001', model: 'Pixel 7', amount: '300.00', fee: '5.00', role: 'PRIMARY', net: '$295.00', sku: '' },
    { serial: 'PW-SALE-002', model: 'Pixel Buds', amount: '100.00', fee: '', role: 'ACCESSORY', net: '$100.00', sku: '' }
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

  // 2) One "Sell" work order holding both devices
  await page.goto('/work-orders');
  await openCollapsibleForm(page, page.getByTestId('work-orders-toggle-form'), page.getByLabel('Target Action'));
  await page.getByLabel('Target Action').selectOption('SELL');
  const note = 'PW two device sale';
  await page.getByLabel('Notes').fill(note);
  await submitAndWait(page, page.getByTestId('work-orders-create-work-order'));
  const workOrderLink = page.locator('tbody tr', { hasText: note }).first().getByRole('link', { name: /^WO-/ });
  const workOrderCode = (await workOrderLink.innerText()).trim();
  await workOrderLink.click();
  await page.waitForURL(/\/work-orders\/[^/]+$/);
  const workOrderUrl = page.url();
  for (const d of devices) {
    const addDevice = page.locator('form[action="?/add_device"]');
    await selectOptionByLabelContains(addDevice.locator('select[name="deviceId"]'), d.sku);
    await addDevice.locator('select[name="role"]').selectOption(d.role);
    await submitAndWait(page, addDevice.locator('button', { hasText: 'Add' }));
    await expect(page.locator('tbody tr', { hasText: d.sku }).first()).toBeVisible();
  }

  // 3) There is no Sale Builder; each device gets its own income on the work order
  await page.goto('/income');
  await expect(page.getByTestId('income-open-sale-builder')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sale Builder' })).toHaveCount(0);
  for (const d of devices) {
    const modal = await openSplitReceiptModal(page, page.getByTestId('income-toggle-form'));
    await modal.getByLabel('Amount (USD)').fill(d.amount);
    await selectOptionByLabelContains(modal.locator('select[name="deviceId"]'), d.sku);
    await modal.locator('select[name="workOrderId"]').selectOption({ label: workOrderCode });
    if (d.fee) await modal.getByLabel('Platform Fees (USD)').fill(d.fee);
    await submitAndWait(page, modal.getByTestId('income-save-income'));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const row = page.locator('tbody tr', { hasText: d.sku }).first();
    await expect(row).toContainText(`$${d.amount}`);
    await expect(row).toContainText(workOrderCode);
  }

  // 4) Editing an income shows its fees, so saving without touching them keeps them
  const feeRow = page.locator('tbody tr', { hasText: devices[0].sku }).first();
  await feeRow.getByRole('button', { name: 'Edit' }).click();
  const editForm = page.locator('form[action="?/update"]');
  await expect(editForm.locator('input[name="platformFees"]')).toHaveValue('5.00');
  await expect(editForm.locator('input[name="paymentFees"]')).toHaveValue('');
  await submitAndWait(page, editForm.getByRole('button', { name: 'Save' }));

  // 5) Each device carries its own sale, net of its own fee; recording income did not change a status
  await page.goto('/devices');
  for (const d of devices) {
    const row = page.locator('tbody tr', { hasText: d.serial }).first();
    await expect(row).toContainText(d.net);
    await expect(row.locator('select[name="status"]')).toHaveValue('PURCHASED');
  }

  // 6) The work order adds both incomes up
  await page.goto(workOrderUrl);
  await expect(page.getByTestId('wo-received')).toContainText('$400.00');

  // Seed baseline: 137.00, +300.00 - 5.00 + 100.00 => 532.00
  await page.goto('/');
  await expect(page.getByTestId('dashboard-spending-power')).toHaveText('$532.00');
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

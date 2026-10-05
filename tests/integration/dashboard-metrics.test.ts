import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { disconnectDb, getPrisma, makeLoadEvent, resetAndSeedDb } from './helpers';

type LoadEvent = Parameters<typeof dashboardLoad>[0];

async function loadDashboard() {
  return (await dashboardLoad(makeLoadEvent<LoadEvent>())) as any;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

describe('dashboard metrics contract', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('returns the full totals and last30 shape for the seed fixture', async () => {
    const data = await loadDashboard();

    // Seed fixture: income=30000, platform=1000, payment=500, shipRev=300, shipCost=100, expense=15000
    expect(data.totals).toEqual({
      incomeGrossCents: 30000,
      moneyInNetCents: 28700,
      moneyOutCents: 15000,
      spendingPowerCents: 13700,
      taxesCollectedCents: 0,
      feesCents: 1500,
      expensesCents: 15000,
      partsInventoryValueCents: 0
    });
    expect(data.last30).toEqual({
      moneyInNetCents: 28700,
      moneyOutCents: 15000,
      spendingPowerCents: 13700,
      taxesCollectedCents: 0,
      feesCents: 1500,
      expensesCents: 15000,
      partsConsumedCents: 0
    });
    expect(data.devices).toEqual({ activeDevices: 1, archivedDevices: 0 });
    expect(data.workOrders).toEqual({ open: 1 });
  });

  it('returns zeros when the ledger is empty', async () => {
    const prisma = getPrisma();
    await prisma.income.deleteMany();
    await prisma.expense.deleteMany();

    const data = await loadDashboard();
    expect(data.totals.incomeGrossCents).toBe(0);
    expect(data.totals.moneyInNetCents).toBe(0);
    expect(data.totals.moneyOutCents).toBe(0);
    expect(data.totals.spendingPowerCents).toBe(0);
    expect(data.totals.feesCents).toBe(0);
    expect(data.last30.spendingPowerCents).toBe(0);
  });

  it('goes negative when expenses exceed net income', async () => {
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });
    await prisma.expense.create({ data: { date: new Date(), amountCents: 50000, subtotalCents: 50000, categoryId: category.id } });

    const data = await loadDashboard();
    expect(data.totals.moneyOutCents).toBe(65000);
    expect(data.totals.spendingPowerCents).toBe(28700 - 65000);
    expect(data.last30.spendingPowerCents).toBe(28700 - 65000);
  });

  it('reports tax collected separately and keeps it out of money in and spending power', async () => {
    const prisma = getPrisma();
    await prisma.income.create({
      data: { date: new Date(), type: 'SALE', amountCents: 10000, taxCollectedCents: 825 }
    });

    const data = await loadDashboard();
    expect(data.totals.taxesCollectedCents).toBe(825);
    expect(data.last30.taxesCollectedCents).toBe(825);
    expect(data.totals.incomeGrossCents).toBe(40000);
    expect(data.totals.moneyInNetCents).toBe(28700 + 10000);
    expect(data.totals.spendingPowerCents).toBe(13700 + 10000);
  });

  it('counts rows older than 30 days in totals but not in last30', async () => {
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });
    await prisma.income.create({
      data: { date: daysAgo(31), type: 'SALE', amountCents: 7000, platformFeesCents: 300, paymentFeesCents: 200, taxCollectedCents: 50 }
    });
    await prisma.expense.create({ data: { date: daysAgo(31), amountCents: 2500, subtotalCents: 2500, categoryId: category.id } });

    const data = await loadDashboard();
    expect(data.totals.moneyInNetCents).toBe(28700 + 6500);
    expect(data.totals.moneyOutCents).toBe(15000 + 2500);
    expect(data.totals.spendingPowerCents).toBe(13700 + 6500 - 2500);
    expect(data.totals.feesCents).toBe(1500 + 500);
    expect(data.totals.taxesCollectedCents).toBe(50);

    expect(data.last30.moneyInNetCents).toBe(28700);
    expect(data.last30.moneyOutCents).toBe(15000);
    expect(data.last30.spendingPowerCents).toBe(13700);
    expect(data.last30.feesCents).toBe(1500);
    expect(data.last30.taxesCollectedCents).toBe(0);
  });

  it('values parts inventory at quantity * average cost, excluding archived parts', async () => {
    const prisma = getPrisma();
    await prisma.part.create({ data: { name: 'Charge Port', quantity: 3, averageCostCents: 250 } });
    await prisma.part.create({ data: { name: 'Screen', quantity: 2, averageCostCents: 1000 } });
    await prisma.part.create({ data: { name: 'Out of stock', quantity: 0, averageCostCents: 9999 } });
    await prisma.part.create({ data: { name: 'Archived', quantity: 5, averageCostCents: 500, archivedAt: new Date() } });

    const data = await loadDashboard();
    expect(data.totals.partsInventoryValueCents).toBe(3 * 250 + 2 * 1000);
    // Inventory value is informational only; it does not move spending power
    expect(data.totals.spendingPowerCents).toBe(13700);
  });

  it('values stock at the manually entered unit cost when a part has no average cost yet', async () => {
    const prisma = getPrisma();
    // Entered on the Parts page: unit cost only, never received through a receipt
    await prisma.part.create({ data: { name: 'Manual cost', quantity: 3, unitCostCents: 400 } });
    // Average cost wins once it exists
    await prisma.part.create({ data: { name: 'Averaged', quantity: 2, averageCostCents: 250, unitCostCents: 999 } });
    await prisma.part.create({ data: { name: 'No cost', quantity: 7 } });

    const data = await loadDashboard();
    expect(data.totals.partsInventoryValueCents).toBe(3 * 400 + 2 * 250);
    expect(data.totals.spendingPowerCents).toBe(13700);
  });

  it('does not count a consumption that was reversed by deleting the work order item', async () => {
    const prisma = getPrisma();
    const part = await prisma.part.create({ data: { name: 'Battery', quantity: 10, unitCostCents: 350 } });
    const wo = await prisma.workOrder.create({ data: { code: 'WO-TEST-REVERSAL' } });
    const movement = { partId: part.id, workOrderId: wo.id, quantity: 2, unitCostCents: 350, totalCostCents: 700 };

    await prisma.partInventoryMovement.create({ data: { ...movement, type: 'CONSUME' } });
    await prisma.partInventoryMovement.create({ data: { ...movement, type: 'CONSUME' } });
    await prisma.partInventoryMovement.create({ data: { ...movement, type: 'ADJUSTMENT' } });

    const data = await loadDashboard();
    expect(data.last30.partsConsumedCents).toBe(700);
  });

  it('sums only active CONSUME movements from the last 30 days as parts consumed', async () => {
    const prisma = getPrisma();
    const part = await prisma.part.create({ data: { name: 'Battery', quantity: 10, averageCostCents: 350 } });
    const movement = { partId: part.id, quantity: 2, unitCostCents: 350, totalCostCents: 700 };

    await prisma.partInventoryMovement.create({ data: { ...movement, type: 'CONSUME' } });
    await prisma.partInventoryMovement.create({ data: { ...movement, type: 'CONSUME', createdAt: daysAgo(29) } });
    await prisma.partInventoryMovement.create({ data: { ...movement, type: 'CONSUME', createdAt: daysAgo(31) } });
    await prisma.partInventoryMovement.create({ data: { ...movement, type: 'CONSUME', archivedAt: new Date() } });
    await prisma.partInventoryMovement.create({ data: { ...movement, type: 'RECEIPT' } });
    await prisma.partInventoryMovement.create({ data: { ...movement, type: 'ADJUSTMENT' } });

    const data = await loadDashboard();
    expect(data.last30.partsConsumedCents).toBe(1400);
    // Parts consumption is not a cash movement
    expect(data.last30.spendingPowerCents).toBe(13700);
  });

  it('counts active vs archived devices and only open work orders', async () => {
    const prisma = getPrisma();
    await prisma.device.create({ data: { sku: 'FZ-TEST-ACTIVE', make: 'Samsung', model: 'S22' } });
    await prisma.device.create({ data: { sku: 'FZ-TEST-ARCHIVED', make: 'Google', model: 'Pixel 7', archivedAt: new Date() } });

    await prisma.workOrder.create({ data: { code: 'WO-TEST-PROGRESS', status: 'IN_PROGRESS' } });
    await prisma.workOrder.create({ data: { code: 'WO-TEST-READY', status: 'READY' } });
    await prisma.workOrder.create({ data: { code: 'WO-TEST-DELIVERED', status: 'DELIVERED' } });
    await prisma.workOrder.create({ data: { code: 'WO-TEST-CANCELLED', status: 'CANCELLED' } });
    await prisma.workOrder.create({ data: { code: 'WO-TEST-ARCHIVED', status: 'OPEN', archivedAt: new Date() } });

    const data = await loadDashboard();
    expect(data.devices).toEqual({ activeDevices: 2, archivedDevices: 1 });
    // Fixture OPEN + IN_PROGRESS + READY
    expect(data.workOrders).toEqual({ open: 3 });
  });
});

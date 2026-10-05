import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { actions as incomeActions, load as incomeLoad } from '../../src/routes/income/+page.server';
import { POST as createLinesPost } from '../../src/routes/income/create-lines/+server';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { disconnectDb, getPrisma, makeFormRequest, makeJsonRequest, makeLoadEvent, resetAndSeedDb } from './helpers';

type CreateEvent = Parameters<typeof incomeActions.create>[0];
type UpdateEvent = Parameters<typeof incomeActions.update>[0];
type DeleteEvent = Parameters<typeof incomeActions.delete>[0];
type CreateLinesEvent = Parameters<typeof createLinesPost>[0];

async function loadDashboard() {
  return (await dashboardLoad(makeLoadEvent<Parameters<typeof dashboardLoad>[0]>())) as any;
}

async function loadIncome(query = '') {
  return (await incomeLoad(makeLoadEvent<Parameters<typeof incomeLoad>[0]>(`http://localhost/income${query}`))) as any;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('income ledger actions', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  describe('create', () => {
    it('stores dollar inputs as integer cents on the local calendar date', async () => {
      const prisma = getPrisma();
      const category = await prisma.category.findFirstOrThrow({ where: { kind: 'income', name: 'Device Sale' }, select: { id: true } });
      const channel = await prisma.salesChannel.findFirstOrThrow({ where: { name: 'eBay' }, select: { id: true } });
      const device = await prisma.device.findFirstOrThrow({ select: { id: true } });

      const request = makeFormRequest({
        date: '2026-01-15',
        type: 'SALE',
        amount: '19.99',
        categoryId: category.id,
        channelId: channel.id,
        deviceId: device.id,
        platformFees: '2.65',
        paymentFees: '0.07',
        shippingRevenue: '4.35',
        shippingCost: '8.10',
        notes: 'Cents rounding'
      });
      const result = await incomeActions.create({ request } as CreateEvent);
      expect(result).toEqual({ success: true });

      const row = await prisma.income.findFirstOrThrow({ where: { notes: 'Cents rounding' } });
      expect(row.type).toBe('SALE');
      expect(row.amountCents).toBe(1999);
      expect(row.platformFeesCents).toBe(265);
      expect(row.paymentFeesCents).toBe(7);
      expect(row.shippingRevenueCents).toBe(435);
      expect(row.shippingCostCents).toBe(810);
      expect(row.categoryId).toBe(category.id);
      expect(row.channelId).toBe(channel.id);
      expect(row.deviceId).toBe(device.id);
      expect(row.archivedAt).toBeNull();
      expect(row.date.getTime()).toBe(new Date(2026, 0, 15).getTime());
    });

    it('treats blank optional fields as null and blank money fields as zero', async () => {
      const prisma = getPrisma();
      const request = makeFormRequest({
        date: '2026-01-15',
        type: 'DEPOSIT',
        amount: '50',
        deviceId: '',
        channelId: '',
        categoryId: '',
        customerId: '',
        workOrderId: '',
        platformFees: '',
        paymentFees: '',
        shippingRevenue: '',
        shippingCost: '',
        notes: ''
      });
      await incomeActions.create({ request } as CreateEvent);

      const row = await prisma.income.findFirstOrThrow({ where: { type: 'DEPOSIT' } });
      expect(row.amountCents).toBe(5000);
      expect(row.platformFeesCents).toBe(0);
      expect(row.paymentFeesCents).toBe(0);
      expect(row.shippingRevenueCents).toBe(0);
      expect(row.shippingCostCents).toBe(0);
      expect(row.deviceId).toBeNull();
      expect(row.channelId).toBeNull();
      expect(row.categoryId).toBeNull();
      expect(row.customerId).toBeNull();
      expect(row.workOrderId).toBeNull();
      expect(row.notes).toBeNull();
    });

    it('persists taxCollected and reports it on the dashboard without adding it to money in', async () => {
      const prisma = getPrisma();
      const request = makeFormRequest({ date: '2026-01-15', type: 'SALE', amount: '100.00', taxCollected: '8.25', notes: 'Tax on create' });
      await incomeActions.create({ request } as CreateEvent);

      const row = await prisma.income.findFirstOrThrow({ where: { notes: 'Tax on create' } });
      expect(row.taxCollectedCents).toBe(825);

      const data = await loadDashboard();
      expect(data.totals.taxesCollectedCents).toBe(825);
      expect(data.totals.moneyInNetCents).toBe(28700 + 10000);
    });
  });

  describe('update', () => {
    it('rewrites amounts and fees and the dashboard follows', async () => {
      const prisma = getPrisma();
      const fixture = await prisma.income.findFirstOrThrow({ where: { notes: 'Fixture income' } });

      const request = makeFormRequest({
        id: fixture.id,
        date: todayStr(),
        type: 'SALE',
        amount: '120.00',
        platformFees: '2.00',
        paymentFees: '1.50',
        shippingRevenue: '0',
        shippingCost: '6.00',
        taxCollected: '9.60',
        notes: 'Edited'
      });
      const result = await incomeActions.update({ request } as UpdateEvent);
      expect(result).toEqual({ success: true, id: fixture.id });

      const row = await prisma.income.findUniqueOrThrow({ where: { id: fixture.id } });
      expect(row.type).toBe('SALE');
      expect(row.amountCents).toBe(12000);
      expect(row.platformFeesCents).toBe(200);
      expect(row.paymentFeesCents).toBe(150);
      expect(row.shippingRevenueCents).toBe(0);
      expect(row.shippingCostCents).toBe(600);
      expect(row.taxCollectedCents).toBe(960);
      expect(row.notes).toBe('Edited');

      const data = await loadDashboard();
      // 12000 - 200 - 150 - 600 + 0
      expect(data.totals.moneyInNetCents).toBe(11050);
      expect(data.totals.spendingPowerCents).toBe(11050 - 15000);
      expect(data.totals.taxesCollectedCents).toBe(960);
      expect(data.totals.feesCents).toBe(350);
    });

    it('rejects a missing id without touching the ledger', async () => {
      const result = await incomeActions.update({ request: makeFormRequest({ amount: '1.00' }) } as UpdateEvent);
      expect(result).toEqual({ success: false, error: 'Missing id' });

      const data = await loadDashboard();
      expect(data.totals.moneyInNetCents).toBe(28700);
    });
  });

  describe('delete', () => {
    it('archives instead of deleting and removes the row from totals and the list', async () => {
      const prisma = getPrisma();
      const fixture = await prisma.income.findFirstOrThrow({ where: { notes: 'Fixture income' } });

      const result = await incomeActions.delete({ request: makeFormRequest({ id: fixture.id }) } as DeleteEvent);
      expect(result).toEqual({ success: true, id: fixture.id });

      const row = await prisma.income.findUniqueOrThrow({ where: { id: fixture.id } });
      expect(row.archivedAt).not.toBeNull();

      const data = await loadDashboard();
      expect(data.totals.moneyInNetCents).toBe(0);
      expect(data.totals.spendingPowerCents).toBe(-15000);

      const list = await loadIncome();
      expect(list.income).toHaveLength(0);
    });
  });

  describe('load', () => {
    it('filters by from/to and hides archived rows', async () => {
      const prisma = getPrisma();
      await prisma.income.deleteMany();
      const base = { type: 'SALE' as const, amountCents: 1000 };
      await prisma.income.create({ data: { ...base, date: new Date(2026, 0, 10, 12), notes: 'before' } });
      await prisma.income.create({ data: { ...base, date: new Date(2026, 0, 20, 12), notes: 'inside' } });
      await prisma.income.create({ data: { ...base, date: new Date(2026, 0, 21, 12), notes: 'inside-archived', archivedAt: new Date() } });
      await prisma.income.create({ data: { ...base, date: new Date(2026, 1, 5, 12), notes: 'after' } });

      const all = await loadIncome();
      expect(all.income.map((i: any) => i.notes)).toEqual(['after', 'inside', 'before']);

      const filtered = await loadIncome('?from=2026-01-15&to=2026-01-31');
      expect(filtered.income.map((i: any) => i.notes)).toEqual(['inside']);
      expect(filtered.filters).toEqual({ from: '2026-01-15', to: '2026-01-31' });

      const fromOnly = await loadIncome('?from=2026-01-15');
      expect(fromOnly.income.map((i: any) => i.notes)).toEqual(['after', 'inside']);
    });
  });
});

describe('income create-lines endpoint (Sale Builder)', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('creates a header from line totals, allocates fees per line, sells the device and consumes the part', async () => {
    const prisma = getPrisma();
    const device = await prisma.device.findFirstOrThrow({ select: { id: true, status: true } });
    const part = await prisma.part.create({ data: { name: 'Charger', quantity: 5, averageCostCents: 400 } });
    const channel = await prisma.salesChannel.findFirstOrThrow({ where: { name: 'eBay' }, select: { id: true } });
    expect(device.status).not.toBe('SOLD');

    const response = await createLinesPost({
      request: makeJsonRequest({
        date: todayStr(),
        type: 'SALE',
        channelId: channel.id,
        notes: ' Bundle sale ',
        platformFeesCents: 1000,
        paymentFeesCents: 500,
        shippingRevenueCents: 300,
        shippingCostCents: 100,
        taxCollectedCents: 900,
        lines: [
          { type: 'DEVICE', amountCents: 10000, deviceId: device.id, description: 'Phone' },
          { type: 'PART', amountCents: 5000, partId: part.id, quantity: 2, description: 'Chargers' }
        ]
      })
    } as CreateLinesEvent);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; id: string };
    expect(body.success).toBe(true);

    const income = await prisma.income.findUniqueOrThrow({ where: { id: body.id }, include: { lines: true } });
    expect(income.amountCents).toBe(15000);
    expect(income.platformFeesCents).toBe(1000);
    expect(income.paymentFeesCents).toBe(500);
    expect(income.shippingRevenueCents).toBe(300);
    expect(income.shippingCostCents).toBe(100);
    expect(income.taxCollectedCents).toBe(900);
    expect(income.notes).toBe('Bundle sale');
    expect(income.lines).toHaveLength(2);

    // Per-line allocations are floor(total * lineAmount / sumOfLines); the header keeps the exact totals.
    const deviceLine = income.lines.find((l) => l.type === 'DEVICE')!;
    expect(deviceLine).toMatchObject({
      amountCents: 10000,
      deviceId: device.id,
      allocatedPlatformFeesCents: 666,
      allocatedPaymentFeesCents: 333,
      allocatedShippingRevenueCents: 200,
      allocatedShippingCostCents: 66,
      allocatedTaxCents: 600
    });
    const partLine = income.lines.find((l) => l.type === 'PART')!;
    expect(partLine).toMatchObject({
      amountCents: 5000,
      partId: part.id,
      quantity: 2,
      allocatedPlatformFeesCents: 333,
      allocatedPaymentFeesCents: 166,
      allocatedShippingRevenueCents: 100,
      allocatedShippingCostCents: 33,
      allocatedTaxCents: 300
    });

    expect((await prisma.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe('SOLD');

    expect((await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).quantity).toBe(3);
    const movement = await prisma.partInventoryMovement.findFirstOrThrow({ where: { partId: part.id, type: 'CONSUME' } });
    expect(movement).toMatchObject({ quantity: 2, unitCostCents: 400, totalCostCents: 800 });

    const data = await loadDashboard();
    // Header net: 15000 - 1000 - 500 - 100 + 300
    expect(data.totals.moneyInNetCents).toBe(28700 + 13700);
    expect(data.totals.spendingPowerCents).toBe(13700 + 13700);
    expect(data.totals.taxesCollectedCents).toBe(900);
    expect(data.last30.partsConsumedCents).toBe(800);
    expect(data.totals.partsInventoryValueCents).toBe(3 * 400);
  });

  it('does not downgrade a device that is already shipped', async () => {
    const prisma = getPrisma();
    const device = await prisma.device.create({ data: { sku: 'FZ-TEST-SHIPPED', make: 'Apple', model: 'iPad', status: 'SHIPPED' } });

    const response = await createLinesPost({
      request: makeJsonRequest({ date: todayStr(), type: 'SALE', lines: [{ type: 'DEVICE', amountCents: 20000, deviceId: device.id }] })
    } as CreateLinesEvent);
    expect(response.status).toBe(200);
    expect((await prisma.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe('SHIPPED');
  });

  it('rolls back the whole sale when a part line exceeds stock', async () => {
    const prisma = getPrisma();
    const device = await prisma.device.findFirstOrThrow({ select: { id: true, status: true } });
    const part = await prisma.part.create({ data: { name: 'Scarce', quantity: 1, averageCostCents: 400 } });

    const response = await createLinesPost({
      request: makeJsonRequest({
        date: todayStr(),
        type: 'SALE',
        lines: [
          { type: 'DEVICE', amountCents: 10000, deviceId: device.id },
          { type: 'PART', amountCents: 5000, partId: part.id, quantity: 2 }
        ]
      })
    } as CreateLinesEvent);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: 'Insufficient stock for part sale' });

    expect(await prisma.income.count()).toBe(1);
    expect(await prisma.incomeLine.count()).toBe(0);
    expect(await prisma.partInventoryMovement.count()).toBe(0);
    expect((await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).quantity).toBe(1);
    expect((await prisma.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe(device.status);

    const data = await loadDashboard();
    expect(data.totals.spendingPowerCents).toBe(13700);
  });

  it('rejects empty and zero-total payloads', async () => {
    const prisma = getPrisma();

    const noLines = await createLinesPost({ request: makeJsonRequest({ date: todayStr(), type: 'SALE', lines: [] }) } as CreateLinesEvent);
    expect(noLines.status).toBe(400);
    expect(await noLines.json()).toEqual({ success: false, error: 'At least one line required' });

    const zeroTotal = await createLinesPost({
      request: makeJsonRequest({ date: todayStr(), type: 'SALE', lines: [{ type: 'OTHER', amountCents: 0 }] })
    } as CreateLinesEvent);
    expect(zeroTotal.status).toBe(400);
    expect(await zeroTotal.json()).toEqual({ success: false, error: 'Invalid line totals' });

    expect(await prisma.income.count()).toBe(1);
  });
});

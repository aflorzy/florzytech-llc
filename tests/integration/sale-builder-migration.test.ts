import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { load as workOrderLoad } from '../../src/routes/work-orders/[id]/+page.server';
import { loadDeviceFinancials } from '../../src/lib/server/device-financials';
import {
  createLegacyIncomeLineTable,
  disconnectDb,
  dropLegacyIncomeLineTable,
  getPrisma,
  insertLegacyIncomeLine,
  makeLoadEvent,
  resetAndSeedDb,
  runMigration,
  type LegacyIncomeLine
} from './helpers';

// Issue #14: the migration that folds each Sale Builder income's lines into the income and
// drops the lines table. One test per shape found in production (6 and 9 October 2026), each
// built the way the Sale Builder stored it, then the guard for every shape it refuses.

const MIGRATION = '20261009140000_retire_sale_builder';

const dashboard = async () => (await dashboardLoad(makeLoadEvent<Parameters<typeof dashboardLoad>[0]>())) as any;
const workOrder = async (id: string) => (await workOrderLoad({ params: { id } } as Parameters<typeof workOrderLoad>[0])) as any;
const financials = async (id: string) => (await loadDeviceFinancials([id])).get(id)!;
const incomeRow = (id: string) => getPrisma().income.findUniqueOrThrow({ where: { id } });
const linesTableExists = async () => {
  const [row] = await getPrisma().$queryRawUnsafe<Array<{ name: string | null }>>(`SELECT to_regclass('public."IncomeLine"')::text AS name`);
  return row.name !== null;
};
const lineCount = async () => Number((await getPrisma().$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*) AS n FROM "IncomeLine"`))[0].n);

let seq = 0;
async function newDevice(costCents = 0) {
  const prisma = getPrisma();
  const device = await prisma.device.create({ data: { sku: `FZ-MIG-${String(++seq).padStart(3, '0')}`, make: 'Sony', model: 'PS5', status: 'SOLD' } });
  if (costCents > 0) {
    const category = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });
    await prisma.expense.create({ data: { date: new Date(2025, 8, 1), amountCents: costCents, subtotalCents: costCents, categoryId: category.id, deviceId: device.id } });
  }
  return device;
}
// A delivered "Sell" work order, invoiced before prices existed like every one in production
async function newWorkOrder(deviceIds: string[] = []) {
  const prisma = getPrisma();
  const order = await prisma.workOrder.create({ data: { code: `WO-MIG-${++seq}`, targetAction: 'SELL', status: 'DELIVERED', invoicedAt: new Date(2025, 8, 30) } });
  for (const [i, deviceId] of deviceIds.entries()) {
    await prisma.workOrderDevice.create({ data: { workOrderId: order.id, deviceId, role: i === 0 ? 'PRIMARY' : 'ACCESSORY' } });
  }
  return order;
}
async function newIncome(data: Record<string, unknown>, lines: Array<Omit<LegacyIncomeLine, 'incomeId'>>) {
  const income = await getPrisma().income.create({ data: { date: new Date(2025, 8, 24), type: 'SALE', amountCents: 0, ...data } as any });
  for (const line of lines) await insertLegacyIncomeLine({ ...line, incomeId: income.id });
  return income;
}

describe('retiring the Sale Builder: migration', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
    await createLegacyIncomeLineTable();
  });

  afterEach(async () => {
    await dropLegacyIncomeLineTable();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  describe('shapes found in production', () => {
    it('one device line with no work order of its own, under an income that names the same device and a work order', async () => {
      const device = await newDevice(9000);
      const order = await newWorkOrder([device.id]);
      const income = await newIncome({ amountCents: 16000, deviceId: device.id, workOrderId: order.id }, [{ type: 'DEVICE', amountCents: 16000, deviceId: device.id, quantity: 1 }]);
      const before = await incomeRow(income.id);

      await runMigration(MIGRATION);

      expect(await incomeRow(income.id)).toEqual(before);
      expect(await financials(device.id)).toMatchObject({ incomeCents: 16000, feesCents: 0, shippingNetCents: 0, netCents: 7000 });
      const data = await workOrder(order.id);
      expect(data.summary.income.grossCents).toBe(16000);
      expect(data.summary.invoice.receivedCents).toBe(16000);
      expect(data.summary.profitCents).toBe(7000);
      expect(await linesTableExists()).toBe(false);
    });

    it('one device line on the same work order as its income', async () => {
      const device = await newDevice(12000);
      const order = await newWorkOrder([device.id]);
      const income = await newIncome({ amountCents: 25000, deviceId: device.id, workOrderId: order.id }, [
        { type: 'DEVICE', amountCents: 25000, deviceId: device.id, workOrderId: order.id }
      ]);
      const before = await incomeRow(income.id);

      await runMigration(MIGRATION);

      expect(await incomeRow(income.id)).toEqual(before);
      expect((await financials(device.id)).netCents).toBe(13000);
      const data = await workOrder(order.id);
      expect(data.summary.income.netRevenueCents).toBe(25000);
      expect(data.summary.invoice.receivedCents).toBe(25000);
      expect(data.summary.profitCents).toBe(13000);
    });

    it('a device line plus $0 part lines with no quantity, for parts that are on the work order: stock is left alone', async () => {
      const prisma = getPrisma();
      const device = await newDevice(10000);
      const order = await newWorkOrder([device.id]);
      // The parts were consumed on the work order, which is the only place they left stock
      const fan = await prisma.part.create({ data: { name: 'Fan', quantity: 0, averageCostCents: 1414 } });
      const port = await prisma.part.create({ data: { name: 'HDMI Port', quantity: 3, averageCostCents: 500 } });
      for (const part of [fan, port]) {
        await prisma.workOrderItem.create({ data: { workOrderId: order.id, type: 'PART', partId: part.id, quantity: 1, unitCostCentsSnapshot: part.averageCostCents } });
        await prisma.partInventoryMovement.create({ data: { type: 'CONSUME', partId: part.id, quantity: 1, unitCostCents: part.averageCostCents, totalCostCents: part.averageCostCents, workOrderId: order.id } });
      }
      const income = await newIncome({ amountCents: 22000, deviceId: device.id, workOrderId: order.id }, [
        { type: 'DEVICE', amountCents: 22000, deviceId: device.id, workOrderId: order.id },
        { type: 'PART', amountCents: 0, partId: fan.id, workOrderId: order.id },
        { type: 'PART', amountCents: 0, partId: port.id, workOrderId: order.id }
      ]);
      const stock = () =>
        Promise.all([
          prisma.part.findMany({ orderBy: { name: 'asc' }, select: { id: true, quantity: true, averageCostCents: true, updatedAt: true } }),
          prisma.partInventoryMovement.findMany({ orderBy: { id: 'asc' } })
        ]);
      const stockBefore = await stock();
      const dashboardBefore = await dashboard();

      await runMigration(MIGRATION);

      expect(await stock()).toEqual(stockBefore);
      expect(await prisma.partInventoryMovement.count({ where: { type: 'CONSUME' } })).toBe(2);
      expect(await dashboard()).toEqual(dashboardBefore);
      expect((await incomeRow(income.id)).deviceId).toBe(device.id);
      const data = await workOrder(order.id);
      // Each part is charged once: 1414 + 500
      expect(data.summary.partsCostCents).toBe(1914);
      expect(data.summary.income.grossCents).toBe(22000);
      expect(data.summary.profitCents).toBe(22000 - 1914 - 10000);
      expect((await financials(device.id)).netCents).toBe(22000 - 1914 - 10000);
    });

    it('an "other" line with no device or work order, whose amount no longer matches the income: the income keeps its own amount', async () => {
      const income = await newIncome({ type: 'DEPOSIT', amountCents: 6956 }, [{ type: 'OTHER', amountCents: 6656 }]);
      const before = await incomeRow(income.id);
      const dashboardBefore = await dashboard();

      await runMigration(MIGRATION);

      expect(await incomeRow(income.id)).toEqual(before);
      expect(await dashboard()).toEqual(dashboardBefore);
      expect(dashboardBefore.totals.moneyInNetCents).toBe(28700 + 6956);
    });

    it('a labor line on the work order, under an income that names a device', async () => {
      const device = await newDevice();
      const order = await newWorkOrder([device.id]);
      const income = await newIncome({ type: 'SERVICE', amountCents: 2500, deviceId: device.id, workOrderId: order.id }, [
        { type: 'LABOR', amountCents: 2500, workOrderId: order.id }
      ]);
      const before = await incomeRow(income.id);

      await runMigration(MIGRATION);

      expect(await incomeRow(income.id)).toEqual(before);
      expect((await financials(device.id)).netCents).toBe(2500);
      const data = await workOrder(order.id);
      expect(data.summary.income.grossCents).toBe(2500);
      expect(data.summary.invoice.receivedCents).toBe(2500);
    });

    it('an archived income with one device line and no device of its own: tied to the device, still archived, still counted nowhere', async () => {
      const prisma = getPrisma();
      const device = await newDevice(20000);
      const order = await newWorkOrder([device.id]);
      const archivedAt = new Date(2026, 0, 21);
      const income = await newIncome({ amountCents: 28000, workOrderId: order.id, archivedAt }, [{ type: 'DEVICE', amountCents: 28000, deviceId: device.id, workOrderId: order.id }]);
      // Re-entered by hand and archived as well
      await prisma.income.create({ data: { date: new Date(2026, 0, 20), type: 'SALE', amountCents: 28000, deviceId: device.id, workOrderId: order.id, archivedAt } });
      const dashboardBefore = await dashboard();

      await runMigration(MIGRATION);

      expect(await incomeRow(income.id)).toMatchObject({ deviceId: device.id, workOrderId: order.id, archivedAt, amountCents: 28000, notes: null });
      expect(await dashboard()).toEqual(dashboardBefore);
      expect(await financials(device.id)).toMatchObject({ incomeCents: 0, netCents: -20000 });
      const data = await workOrder(order.id);
      expect(data.summary.income.grossCents).toBe(0);
      expect(data.summary.invoice.receivedCents).toBe(0);
      expect(data.summary.profitCents).toBe(-20000);
    });

    it('an archived income covering two devices, replaced by one plain income per device: split into two archived incomes, and the plain incomes keep counting, once', async () => {
      const prisma = getPrisma();
      const a = await newDevice(1000);
      const b = await newDevice(1500);
      const order = await newWorkOrder([a.id, b.id]);
      await prisma.workOrderDevice.updateMany({ where: { workOrderId: order.id }, data: { role: 'PRIMARY' } });
      const archivedAt = new Date(2025, 9, 29);
      const income = await newIncome({ type: 'DEPOSIT', amountCents: 4357, workOrderId: order.id, archivedAt, notes: 'USPS refund' }, [
        { type: 'DEVICE', amountCents: 2178, deviceId: a.id, workOrderId: order.id },
        { type: 'DEVICE', amountCents: 2179, deviceId: b.id, workOrderId: order.id }
      ]);
      await prisma.income.create({ data: { date: new Date(2025, 9, 28), type: 'DEPOSIT', amountCents: 2178, deviceId: a.id, workOrderId: order.id } });
      await prisma.income.create({ data: { date: new Date(2025, 9, 28), type: 'SALE', amountCents: 2179, deviceId: b.id, workOrderId: order.id } });
      const dashboardBefore = await dashboard();

      await runMigration(MIGRATION);

      const note = `USPS refund | Split from Sale Builder sale ${income.id} into 2 incomes, one per device: ${b.sku} 21.79, ${a.sku} 21.78`;
      // The income named no device, so it keeps the largest line
      expect(await incomeRow(income.id)).toMatchObject({ deviceId: b.id, workOrderId: order.id, archivedAt, type: 'DEPOSIT', amountCents: 2179, notes: note });
      const pieces = await prisma.income.findMany({ where: { notes: note }, orderBy: { amountCents: 'asc' } });
      expect(pieces.map((p) => [p.deviceId, p.amountCents, p.archivedAt])).toEqual([
        [a.id, 2178, archivedAt],
        [b.id, 2179, archivedAt]
      ]);
      expect(await dashboard()).toEqual(dashboardBefore);
      expect((await financials(a.id)).netCents).toBe(2178 - 1000);
      expect((await financials(b.id)).netCents).toBe(2179 - 1500);
      const data = await workOrder(order.id);
      expect(data.summary.income.grossCents).toBe(4357);
      expect(data.summary.invoice.receivedCents).toBe(4357);
      expect(data.summary.profitCents).toBe(4357 - 2500);
    });

    // Decided on #14: a sale of several devices becomes one income per device on its work order
    it('a live income covering three devices: split into one income per device, so every device, the work order and the dashboard keep their figures', async () => {
      const prisma = getPrisma();
      const console5 = await newDevice(11193);
      const padA = await newDevice(3551);
      const padB = await newDevice(1210);
      const order = await newWorkOrder([console5.id, padA.id, padB.id]);
      const channel = await prisma.salesChannel.findFirstOrThrow({ select: { id: true } });
      const income = await newIncome(
        { date: new Date(2025, 11, 22), amountCents: 25000, deviceId: console5.id, workOrderId: order.id, channelId: channel.id },
        [
          { type: 'DEVICE', amountCents: 23000, deviceId: console5.id, workOrderId: order.id },
          { type: 'DEVICE', amountCents: 1000, deviceId: padA.id, workOrderId: order.id },
          { type: 'DEVICE', amountCents: 1000, deviceId: padB.id, workOrderId: order.id }
        ]
      );
      const original = await incomeRow(income.id);
      const dashboardBefore = await dashboard();
      const orderBefore = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
      const workOrderBefore = await workOrder(order.id);

      await runMigration(MIGRATION);

      // What each device sold for, largest first, then by SKU
      const note = `Split from Sale Builder sale ${income.id} into 3 incomes, one per device: ${console5.sku} 230.00, ${padA.sku} 10.00, ${padB.sku} 10.00`;
      // The income keeps its row for the device it named
      const after = await incomeRow(income.id);
      expect(after).toEqual({ ...original, amountCents: 23000, notes: note });
      const pieces = await prisma.income.findMany({ where: { workOrderId: order.id }, orderBy: [{ amountCents: 'desc' }, { device: { sku: 'asc' } }] });
      expect(pieces).toHaveLength(3);
      expect(pieces.map((p) => [p.deviceId, p.amountCents])).toEqual([
        [console5.id, 23000],
        [padA.id, 1000],
        [padB.id, 1000]
      ]);
      // The new incomes are copies of the sale: same date, type, channel, work order and recording time
      for (const piece of pieces.slice(1)) {
        expect(piece.id).not.toBe(income.id);
        expect(piece).toMatchObject({
          date: original.date,
          type: original.type,
          channelId: channel.id,
          categoryId: original.categoryId,
          customerId: original.customerId,
          workOrderId: order.id,
          archivedAt: null,
          createdAt: original.createdAt,
          notes: note,
          platformFeesCents: 0,
          paymentFeesCents: 0,
          shippingRevenueCents: 0,
          shippingCostCents: 0,
          taxCollectedCents: 0
        });
      }

      // Nothing moves: spending power, the work order and each device
      expect(await dashboard()).toEqual(dashboardBefore);
      expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } })).toEqual(orderBefore);
      const data = await workOrder(order.id);
      expect(data.summary).toEqual(workOrderBefore.summary);
      expect(data.summary.income).toMatchObject({ grossCents: 25000, netRevenueCents: 25000 });
      expect(data.summary.invoice.receivedCents).toBe(25000);
      expect(data.summary.profitCents).toBe(25000 - 15954);
      // Each device keeps what its line gave it while the Sale Builder was read
      expect(await financials(console5.id)).toMatchObject({ incomeCents: 23000, netCents: 23000 - 11193 });
      expect(await financials(padA.id)).toMatchObject({ incomeCents: 1000, netCents: 1000 - 3551 });
      expect(await financials(padB.id)).toMatchObject({ incomeCents: 1000, netCents: 1000 - 1210 });
    });

    it('a sale of two devices that names the smaller one keeps its row for that device', async () => {
      const big = await newDevice();
      const small = await newDevice();
      const order = await newWorkOrder([big.id, small.id]);
      const income = await newIncome({ amountCents: 9000, deviceId: small.id, workOrderId: order.id }, [
        { type: 'DEVICE', amountCents: 8000, deviceId: big.id, workOrderId: order.id },
        { type: 'DEVICE', amountCents: 1000, deviceId: small.id, workOrderId: order.id }
      ]);

      await runMigration(MIGRATION);

      expect(await incomeRow(income.id)).toMatchObject({ deviceId: small.id, amountCents: 1000 });
      const other = await getPrisma().income.findFirstOrThrow({ where: { workOrderId: order.id, id: { not: income.id } } });
      expect(other).toMatchObject({ deviceId: big.id, amountCents: 8000 });
      // Piece 1 is listed first in the notes
      expect(other.notes).toBe(`Split from Sale Builder sale ${income.id} into 2 incomes, one per device: ${small.sku} 10.00, ${big.sku} 80.00`);
      expect((await financials(big.id)).incomeCents).toBe(8000);
      expect((await financials(small.id)).incomeCents).toBe(1000);
    });

    it('a sale of two devices with fees, shipping and tax: each piece carries its own device lines\' share, and the pieces add up to the sale', async () => {
      const prisma = getPrisma();
      const a = await newDevice(4000);
      const b = await newDevice(1000);
      const order = await newWorkOrder([a.id, b.id]);
      const income = await newIncome(
        { amountCents: 20000, workOrderId: order.id, platformFeesCents: 2000, paymentFeesCents: 600, shippingRevenueCents: 1000, shippingCostCents: 800, taxCollectedCents: 1600, notes: 'eBay bundle' },
        [
          { type: 'DEVICE', amountCents: 15000, deviceId: a.id, workOrderId: order.id, allocatedPlatformFeesCents: 1500, allocatedPaymentFeesCents: 450, allocatedShippingRevenueCents: 750, allocatedShippingCostCents: 600, allocatedTaxCents: 1200 },
          { type: 'DEVICE', amountCents: 5000, deviceId: b.id, workOrderId: order.id, allocatedPlatformFeesCents: 500, allocatedPaymentFeesCents: 150, allocatedShippingRevenueCents: 250, allocatedShippingCostCents: 200, allocatedTaxCents: 400 },
          // A $0 part line for a part that is on the work order
          { type: 'PART', amountCents: 0, workOrderId: order.id }
        ]
      );
      const dashboardBefore = await dashboard();
      const workOrderBefore = (await workOrder(order.id)).summary;

      await runMigration(MIGRATION);

      const pieces = await prisma.income.findMany({ where: { workOrderId: order.id }, orderBy: { amountCents: 'desc' } });
      const money = (p: (typeof pieces)[number]) => [p.deviceId, p.amountCents, p.platformFeesCents, p.paymentFeesCents, p.shippingRevenueCents, p.shippingCostCents, p.taxCollectedCents];
      expect(pieces.map(money)).toEqual([
        [a.id, 15000, 1500, 450, 750, 600, 1200],
        [b.id, 5000, 500, 150, 250, 200, 400]
      ]);
      expect(pieces[0].id).toBe(income.id);
      expect(pieces.every((p) => p.notes?.startsWith('eBay bundle | Split from Sale Builder sale '))).toBe(true);
      expect(await dashboard()).toEqual(dashboardBefore);
      expect((await workOrder(order.id)).summary).toEqual(workOrderBefore);
      // What each device's line gave it while the Sale Builder was read
      expect(await financials(a.id)).toMatchObject({ incomeCents: 15000, feesCents: 1950, shippingNetCents: 150, taxCollectedCents: 1200, netCents: 15000 - 1950 + 150 - 4000 });
      expect(await financials(b.id)).toMatchObject({ incomeCents: 5000, feesCents: 650, shippingNetCents: 50, taxCollectedCents: 400, netCents: 5000 - 650 + 50 - 1000 });
    });

    it('fees shared exactly across the one device line stay on the income and reach the same figures', async () => {
      const device = await newDevice(5000);
      const order = await newWorkOrder([device.id]);
      const fees = { platformFeesCents: 1000, paymentFeesCents: 300, shippingRevenueCents: 800, shippingCostCents: 600, taxCollectedCents: 700 };
      await newIncome({ amountCents: 20000, workOrderId: order.id, ...fees }, [
        {
          type: 'DEVICE',
          amountCents: 20000,
          deviceId: device.id,
          workOrderId: order.id,
          allocatedPlatformFeesCents: 1000,
          allocatedPaymentFeesCents: 300,
          allocatedShippingRevenueCents: 800,
          allocatedShippingCostCents: 600,
          allocatedTaxCents: 700
        }
      ]);
      const dashboardBefore = await dashboard();

      await runMigration(MIGRATION);

      const net = 20000 - 1000 - 300 + 800 - 600;
      expect(await dashboard()).toEqual(dashboardBefore);
      expect(await financials(device.id)).toMatchObject({ incomeCents: 20000, feesCents: 1300, shippingNetCents: 200, taxCollectedCents: 700, netCents: net - 5000 });
      expect((await workOrder(order.id)).summary.income.netRevenueCents).toBe(net);
    });

    it('all of them at once, next to plain incomes: every income keeps its money, and the dashboard does not move', async () => {
      const prisma = getPrisma();
      const single = await newDevice(9000);
      const singleOrder = await newWorkOrder([single.id]);
      const a = await newDevice(100);
      const b = await newDevice(100);
      const multiOrder = await newWorkOrder([a.id, b.id]);
      await newIncome({ amountCents: 16000, deviceId: single.id, workOrderId: singleOrder.id }, [{ type: 'DEVICE', amountCents: 16000, deviceId: single.id }]);
      await newIncome({ type: 'DEPOSIT', amountCents: 10000 }, [{ type: 'OTHER', amountCents: 10000 }]);
      await newIncome({ amountCents: 5000, deviceId: a.id, workOrderId: multiOrder.id }, [
        { type: 'DEVICE', amountCents: 4000, deviceId: a.id, workOrderId: multiOrder.id },
        { type: 'DEVICE', amountCents: 1000, deviceId: b.id, workOrderId: multiOrder.id }
      ]);
      const plain = await newDevice();
      await prisma.income.create({ data: { date: new Date(2026, 1, 1), type: 'SALE', amountCents: 7000, platformFeesCents: 700, deviceId: plain.id } });
      const money = { id: true, amountCents: true, platformFeesCents: true, paymentFeesCents: true, shippingRevenueCents: true, shippingCostCents: true, taxCollectedCents: true, date: true, type: true, workOrderId: true, archivedAt: true };
      const notSplit = { NOT: { workOrderId: multiOrder.id } };
      const moneyBefore = await prisma.income.findMany({ where: notSplit, orderBy: { id: 'asc' }, select: money });
      const dashboardBefore = await dashboard();
      expect(await lineCount()).toBe(4);

      await runMigration(MIGRATION);

      // Only the sale of two devices became two incomes; every other income keeps its money
      expect(await prisma.income.findMany({ where: notSplit, orderBy: { id: 'asc' }, select: money })).toEqual(moneyBefore);
      expect(await prisma.income.findMany({ where: { workOrderId: multiOrder.id }, orderBy: { amountCents: 'desc' }, select: { deviceId: true, amountCents: true } })).toEqual([
        { deviceId: a.id, amountCents: 4000 },
        { deviceId: b.id, amountCents: 1000 }
      ]);
      expect(await dashboard()).toEqual(dashboardBefore);
      expect((await financials(a.id)).netCents).toBe(4000 - 100);
      expect((await financials(b.id)).netCents).toBe(1000 - 100);
      expect((await financials(single.id)).netCents).toBe(7000);
      expect((await financials(plain.id)).netCents).toBe(6300);
      expect((await workOrder(singleOrder.id)).summary.income.grossCents).toBe(16000);
      expect((await workOrder(multiOrder.id)).summary.income.grossCents).toBe(5000);
      expect(await linesTableExists()).toBe(false);
    });

    it('a database with no Sale Builder incomes at all just loses the table', async () => {
      const dashboardBefore = await dashboard();
      await runMigration(MIGRATION);
      expect(await dashboard()).toEqual(dashboardBefore);
      expect(await linesTableExists()).toBe(false);
    });
  });

  // Shapes that do not exist in production. Each would need a decision, so the migration
  // stops with the income named instead of folding it silently.
  describe('guard', () => {
    async function expectRefused(incomeId: string, reason: RegExp) {
      const prisma = getPrisma();
      const incomes = () => prisma.income.findMany({ orderBy: { id: 'asc' } });
      const before = await incomes();
      const linesBefore = await lineCount();

      const error = await runMigration(MIGRATION).then(
        () => null,
        (e: Error) => e
      );
      expect(error, 'the migration should have been refused').not.toBeNull();
      expect(error!.message).toMatch(/retire_sale_builder: Sale Builder data this migration does not handle\. Nothing was changed\./);
      expect(error!.message).toContain(`income ${incomeId}`);
      expect(error!.message).toMatch(reason);

      // Nothing was changed
      expect(await linesTableExists()).toBe(true);
      expect(await lineCount()).toBe(linesBefore);
      expect(await incomes()).toEqual(before);
    }

    it('refuses a part line with a quantity, which took stock itself', async () => {
      const prisma = getPrisma();
      const part = await prisma.part.create({ data: { name: 'Charger', quantity: 3, averageCostCents: 400 } });
      await prisma.partInventoryMovement.create({ data: { type: 'CONSUME', partId: part.id, quantity: 2, unitCostCents: 400, totalCostCents: 800 } });
      const income = await newIncome({ amountCents: 5000 }, [{ type: 'PART', amountCents: 5000, partId: part.id, quantity: 2 }]);

      await expectRefused(income.id, /has a part line with a quantity, which took the part out of stock itself/);
      expect(await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).toMatchObject({ quantity: 3 });
      expect(await prisma.partInventoryMovement.count()).toBe(1);
    });

    it('refuses an archived line', async () => {
      const income = await newIncome({ amountCents: 5000 }, [
        { type: 'OTHER', amountCents: 5000 },
        { type: 'OTHER', amountCents: 900, archivedAt: new Date() }
      ]);
      await expectRefused(income.id, /has an archived line/);
    });

    it('refuses a line pointed at a different work order than its income', async () => {
      const head = await newWorkOrder();
      const other = await newWorkOrder();
      const income = await newIncome({ amountCents: 5700, workOrderId: head.id }, [
        { type: 'LABOR', amountCents: 5000, workOrderId: head.id },
        { type: 'LABOR', amountCents: 700, workOrderId: other.id }
      ]);
      await expectRefused(income.id, /has a line on a different work order than the income/);
    });

    it('refuses a line on a work order when the income has none', async () => {
      const order = await newWorkOrder();
      const income = await newIncome({ amountCents: 2000 }, [{ type: 'LABOR', amountCents: 2000, workOrderId: order.id }]);
      await expectRefused(income.id, /has a line on a different work order than the income/);
    });

    it('refuses an income that names a different device than its one device line', async () => {
      const a = await newDevice();
      const b = await newDevice();
      const income = await newIncome({ amountCents: 5000, deviceId: a.id }, [{ type: 'DEVICE', amountCents: 5000, deviceId: b.id }]);
      await expectRefused(income.id, /names a device that none of its device lines name/);
    });

    it('refuses a sale of several devices that names a device none of its lines do', async () => {
      const [a, b, c] = [await newDevice(), await newDevice(), await newDevice()];
      const order = await newWorkOrder([a.id, b.id]);
      const income = await newIncome({ amountCents: 5000, deviceId: c.id, workOrderId: order.id }, [
        { type: 'DEVICE', amountCents: 3000, deviceId: a.id, workOrderId: order.id },
        { type: 'DEVICE', amountCents: 2000, deviceId: b.id, workOrderId: order.id }
      ]);
      await expectRefused(income.id, /names a device that none of its device lines name/);
    });

    it('refuses a sale of several devices whose fees were rounded down across the lines, since a piece would be charged less than the sale', async () => {
      const a = await newDevice();
      const b = await newDevice();
      const order = await newWorkOrder([a.id, b.id]);
      const income = await newIncome({ amountCents: 3000, platformFeesCents: 100, workOrderId: order.id }, [
        { type: 'DEVICE', amountCents: 2000, deviceId: a.id, workOrderId: order.id, allocatedPlatformFeesCents: 66 },
        { type: 'DEVICE', amountCents: 1000, deviceId: b.id, workOrderId: order.id, allocatedPlatformFeesCents: 33 }
      ]);
      await expectRefused(income.id, /covers several devices and its device lines do not add up to the income, so splitting it would change the money/);
    });

    it('refuses an archived sale of several devices whose lines do not add up, since splitting it would lose part of the amount', async () => {
      const a = await newDevice();
      const b = await newDevice();
      const order = await newWorkOrder([a.id, b.id]);
      const income = await newIncome({ amountCents: 5000, workOrderId: order.id, archivedAt: new Date(2026, 0, 2) }, [
        { type: 'DEVICE', amountCents: 3000, deviceId: a.id, workOrderId: order.id },
        { type: 'DEVICE', amountCents: 1000, deviceId: b.id, workOrderId: order.id }
      ]);
      await expectRefused(income.id, /covers several devices and its device lines do not add up to the income/);
    });

    it('refuses several devices on an income with no work order', async () => {
      const a = await newDevice();
      const b = await newDevice();
      const income = await newIncome({ amountCents: 40000 }, [
        { type: 'DEVICE', amountCents: 30000, deviceId: a.id },
        { type: 'DEVICE', amountCents: 10000, deviceId: b.id }
      ]);
      await expectRefused(income.id, /covers several devices and has no work order to tie the incomes to/);
    });

    it('refuses a device line that is only part of the income, since the device would be credited more than today', async () => {
      const device = await newDevice();
      const income = await newIncome({ amountCents: 15000 }, [
        { type: 'DEVICE', amountCents: 10000, deviceId: device.id },
        { type: 'LABOR', amountCents: 5000 }
      ]);
      await expectRefused(income.id, /has device lines that do not add up to the income, so the device net would change/);
    });

    it('refuses fees that were rounded down across lines, since the device would be charged more than today', async () => {
      const device = await newDevice();
      // The Sale Builder rounded each line's share down, so a line can carry a cent less than the income
      const income = await newIncome({ amountCents: 15000, platformFeesCents: 1000 }, [
        { type: 'DEVICE', amountCents: 15000, deviceId: device.id, allocatedPlatformFeesCents: 999 }
      ]);
      await expectRefused(income.id, /has device lines that do not add up to the income, so the device net would change/);
    });

    it('refuses work order lines that are only part of the income, since the work order revenue would change', async () => {
      const order = await newWorkOrder();
      const income = await newIncome({ amountCents: 15000, workOrderId: order.id }, [
        { type: 'LABOR', amountCents: 10000, workOrderId: order.id },
        { type: 'OTHER', amountCents: 5000 }
      ]);
      await expectRefused(income.id, /has work order lines that do not add up to the income, so the work order revenue would change/);
    });

    it('refuses an income on a work order whose lines do not add up to its amount, since the amount received would change', async () => {
      const order = await newWorkOrder();
      const income = await newIncome({ amountCents: 6956, workOrderId: order.id }, [{ type: 'OTHER', amountCents: 6656 }]);
      await expectRefused(income.id, /is on a work order and its lines do not add up to its amount, so the amount received would change/);
    });

    it('refuses a plain income that is ignored today because another income has lines on its work order', async () => {
      const order = await newWorkOrder();
      await newIncome({ amountCents: 5000, workOrderId: order.id }, [{ type: 'LABOR', amountCents: 5000, workOrderId: order.id }]);
      const plain = await getPrisma().income.create({ data: { date: new Date(2026, 1, 1), type: 'SERVICE', amountCents: 2000, workOrderId: order.id } });
      await expectRefused(plain.id, /is left out of its work order's revenue today because another income has lines on that work order/);
    });

    it('names every income it refuses, not only the first', async () => {
      const a = await newDevice();
      const b = await newDevice();
      const first = await newIncome({ amountCents: 5000, deviceId: a.id }, [{ type: 'DEVICE', amountCents: 5000, deviceId: b.id }]);
      const second = await newIncome({ amountCents: 900 }, [{ type: 'OTHER', amountCents: 900, archivedAt: new Date() }]);
      const error = await runMigration(MIGRATION).then(
        () => null,
        (e: Error) => e
      );
      expect(error!.message).toContain(`income ${first.id}`);
      expect(error!.message).toContain(`income ${second.id}`);
    });

    it('lets the same mismatches through on an archived income, which counts in no figure', async () => {
      const device = await newDevice(3000);
      const order = await newWorkOrder([device.id]);
      const income = await newIncome({ amountCents: 15000, workOrderId: order.id, archivedAt: new Date(2026, 0, 2) }, [
        { type: 'DEVICE', amountCents: 10000, deviceId: device.id, workOrderId: order.id }
      ]);
      await runMigration(MIGRATION);
      expect(await incomeRow(income.id)).toMatchObject({ deviceId: device.id, amountCents: 15000 });
      expect((await financials(device.id)).netCents).toBe(-3000);
      expect((await workOrder(order.id)).summary.income.grossCents).toBe(0);
    });
  });
});

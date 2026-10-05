import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { actions as deviceActions, load as devicesLoad } from '../../src/routes/devices/+page.server';
import { load as deviceDetailLoad } from '../../src/routes/devices/[id]/+page.server';
import { load as incomeLoad } from '../../src/routes/income/+page.server';
import { actions as workOrderActions } from '../../src/routes/work-orders/[id]/+page.server';
import { POST as createLinesPost } from '../../src/routes/income/create-lines/+server';
import { POST as splitPost } from '../../src/routes/expenses/split/+server';
import { disconnectDb, getPrisma, makeFormRequest, makeJsonRequest, makeLoadEvent, resetAndSeedDb } from './helpers';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadDevices() {
  return (await devicesLoad({} as Parameters<typeof devicesLoad>[0])) as any;
}

async function loadDevice(id: string) {
  return (await deviceDetailLoad({ params: { id } } as Parameters<typeof deviceDetailLoad>[0])) as any;
}

async function postSale(payload: unknown) {
  return createLinesPost({ request: makeJsonRequest(payload) } as Parameters<typeof createLinesPost>[0]);
}

async function netFor(id: string): Promise<number> {
  const data = await loadDevices();
  return data.devices.find((d: { id: string }) => d.id === id).netCents;
}

describe('device financial rollups', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  // Issues #4 and #6: a Sale Builder sale records its devices on the lines, not the header
  describe('Sale Builder sales', () => {
    it('credits each device with its own line and allocated fees when one sale has several devices', async () => {
      const prisma = getPrisma();
      const a = await prisma.device.create({ data: { sku: 'FZ-TEST-A', make: 'Sony', model: 'PS5' } });
      const b = await prisma.device.create({ data: { sku: 'FZ-TEST-B', make: 'Sony', model: 'PS4' } });

      const response = await postSale({
        date: todayStr(),
        type: 'SALE',
        platformFeesCents: 1000,
        paymentFeesCents: 400,
        shippingRevenueCents: 2000,
        shippingCostCents: 1200,
        taxCollectedCents: 800,
        lines: [
          { type: 'DEVICE', deviceId: a.id, amountCents: 30000 },
          { type: 'DEVICE', deviceId: b.id, amountCents: 10000 }
        ]
      });
      expect(response.status).toBe(200);

      const sold = await prisma.device.findMany({ where: { id: { in: [a.id, b.id] } }, select: { status: true } });
      expect(sold.map((d) => d.status)).toEqual(['SOLD', 'SOLD']);

      // A: 30000 - 750 - 300 + 1500 - 900; B: 10000 - 250 - 100 + 500 - 300
      expect(await netFor(a.id)).toBe(29550);
      expect(await netFor(b.id)).toBe(9850);

      const detailA = await loadDevice(a.id);
      expect(detailA.summary).toMatchObject({ income: 30000, fees: 1050, shippingNet: 600, taxCollected: 600, netProfitCents: 29550 });
      expect(detailA.incomes).toHaveLength(1);
      const detailB = await loadDevice(b.id);
      expect(detailB.summary).toMatchObject({ income: 10000, fees: 350, shippingNet: 200, taxCollected: 200, netProfitCents: 9850 });
      expect(detailB.incomes).toHaveLength(1);
    });

    it('drops the sale from the device once the income is archived', async () => {
      const prisma = getPrisma();
      const a = await prisma.device.create({ data: { sku: 'FZ-TEST-A', make: 'Sony', model: 'PS5' } });
      const response = await postSale({ date: todayStr(), type: 'SALE', lines: [{ type: 'DEVICE', deviceId: a.id, amountCents: 30000 }] });
      const { id } = (await response.json()) as { id: string };
      expect(await netFor(a.id)).toBe(30000);

      await prisma.income.update({ where: { id }, data: { archivedAt: new Date() } });
      expect(await netFor(a.id)).toBe(0);
      expect((await loadDevice(a.id)).incomes).toHaveLength(0);
    });

    it('does not count a sale twice when the header is later given one of its line devices', async () => {
      const prisma = getPrisma();
      const a = await prisma.device.create({ data: { sku: 'FZ-TEST-A', make: 'Sony', model: 'PS5' } });
      const b = await prisma.device.create({ data: { sku: 'FZ-TEST-B', make: 'Sony', model: 'PS4' } });
      const response = await postSale({
        date: todayStr(),
        type: 'SALE',
        lines: [
          { type: 'DEVICE', deviceId: a.id, amountCents: 30000 },
          { type: 'DEVICE', deviceId: b.id, amountCents: 10000 }
        ]
      });
      const { id } = (await response.json()) as { id: string };
      await prisma.income.update({ where: { id }, data: { deviceId: a.id } });

      expect(await netFor(a.id)).toBe(30000);
      expect(await netFor(b.id)).toBe(10000);
      expect((await loadDevice(a.id)).incomes).toHaveLength(1);
    });

    it('stores the category and lists the line devices on the Income page', async () => {
      const prisma = getPrisma();
      const a = await prisma.device.create({ data: { sku: 'FZ-TEST-A', make: 'Sony', model: 'PS5' } });
      const b = await prisma.device.create({ data: { sku: 'FZ-TEST-B', make: 'Sony', model: 'PS4' } });
      const category = await prisma.category.findFirstOrThrow({ where: { kind: 'income', name: 'Device Sale' }, select: { id: true } });

      const response = await postSale({
        date: todayStr(),
        type: 'SALE',
        categoryId: category.id,
        notes: 'Builder sale',
        lines: [
          { type: 'DEVICE', deviceId: a.id, amountCents: 30000 },
          { type: 'DEVICE', deviceId: b.id, amountCents: 10000 },
          { type: 'OTHER', amountCents: 500, description: 'Cable' }
        ]
      });
      expect(response.status).toBe(200);

      const data = (await incomeLoad(makeLoadEvent<Parameters<typeof incomeLoad>[0]>('http://localhost/income'))) as any;
      const row = data.income.find((r: { notes: string | null }) => r.notes === 'Builder sale');
      expect(row.category?.name).toBe('Device Sale');
      expect(row.lineDevices.map((d: { sku: string }) => d.sku).sort()).toEqual(['FZ-TEST-A', 'FZ-TEST-B']);
    });
  });

  // Issue #7: a part is charged to a device when it is used, not also when it is bought into stock
  describe('parts used on work orders', () => {
    async function setup() {
      const prisma = getPrisma();
      const device = await prisma.device.create({ data: { sku: 'FZ-TEST-PARTS', make: 'Sony', model: 'PS5' } });
      const part = await prisma.part.create({ data: { name: 'HDMI Port', quantity: 0 } });
      const categoryId = (await prisma.category.findFirstOrThrow({ where: { kind: 'expense', name: 'Parts' }, select: { id: true } })).id;
      const wo = await prisma.workOrder.create({ data: { code: 'WO-TEST-PARTS' } });
      await prisma.workOrderDevice.create({ data: { workOrderId: wo.id, deviceId: device.id, role: 'PRIMARY' } });
      return { prisma, device, part, categoryId, wo };
    }

    async function buy(lines: unknown[]) {
      const response = await splitPost({
        request: makeJsonRequest({
          date: todayStr(),
          allocationMethod: 'EVEN',
          totals: { totalTaxCents: 0, totalShippingCents: 0, totalOtherFeesCents: 0 },
          lines
        })
      } as Parameters<typeof splitPost>[0]);
      expect(response.status).toBe(200);
    }

    async function consume(workOrderId: string, data: Record<string, string>) {
      const result = await workOrderActions.add_item({
        request: makeFormRequest({ type: 'PART', ...data }),
        params: { id: workOrderId }
      } as Parameters<typeof workOrderActions.add_item>[0]);
      expect(result).toEqual({ success: true });
    }

    it('charges a stocked part once, when it is consumed for the device', async () => {
      const { device, part, categoryId, wo } = await setup();
      // Two units bought for the device and received into stock, plus a device-only cost
      await buy([
        { categoryId, deviceId: device.id, subtotalCents: 4000, partId: part.id, quantity: 2 },
        { categoryId, deviceId: device.id, subtotalCents: 700 }
      ]);

      // Nothing used yet: only the device-only cost counts
      expect(await netFor(device.id)).toBe(-700);
      let detail = await loadDevice(device.id);
      expect(detail.summary).toMatchObject({ expenses: 700, stockedExpenses: 4000, partsConsumed: 0, netProfitCents: -700 });

      await consume(wo.id, { partId: part.id, quantity: '1', deviceId: device.id });

      expect(await netFor(device.id)).toBe(-2700);
      detail = await loadDevice(device.id);
      expect(detail.summary).toMatchObject({ expenses: 700, stockedExpenses: 4000, partsConsumed: 2000, netProfitCents: -2700 });
      expect(detail.partsUsed).toHaveLength(1);
      expect(detail.partsUsed[0]).toMatchObject({ quantity: 1, unitCostCentsSnapshot: 2000 });
    });

    it('charges parts from general stock that were never linked to the device as an expense', async () => {
      const { prisma, device, wo } = await setup();
      const stock = await prisma.part.create({ data: { name: 'Thermal Paste', quantity: 5, averageCostCents: 300 } });

      await consume(wo.id, { partId: stock.id, quantity: '2', deviceId: device.id });
      expect(await netFor(device.id)).toBe(-600);
    });

    it('attributes a part with no device picked to the only device on the work order', async () => {
      const { prisma, device, wo } = await setup();
      const stock = await prisma.part.create({ data: { name: 'Thermal Paste', quantity: 5, averageCostCents: 300 } });

      await consume(wo.id, { partId: stock.id, quantity: '1' });
      expect(await netFor(device.id)).toBe(-300);

      // With a second device on the work order the part can no longer be attributed
      const other = await prisma.device.create({ data: { sku: 'FZ-TEST-OTHER', make: 'Sony', model: 'PS4' } });
      await prisma.workOrderDevice.create({ data: { workOrderId: wo.id, deviceId: other.id, role: 'DONOR' } });
      expect(await netFor(device.id)).toBe(0);
      expect(await netFor(other.id)).toBe(0);
    });

    it('stops charging a part once its work order item is deleted', async () => {
      const { prisma, device, wo } = await setup();
      const stock = await prisma.part.create({ data: { name: 'Thermal Paste', quantity: 5, averageCostCents: 300 } });
      await consume(wo.id, { partId: stock.id, quantity: '2', deviceId: device.id });
      const item = await prisma.workOrderItem.findFirstOrThrow({ where: { workOrderId: wo.id, type: 'PART' } });

      await workOrderActions.delete_item({ request: makeFormRequest({ id: item.id }) } as Parameters<typeof workOrderActions.delete_item>[0]);
      expect(await netFor(device.id)).toBe(0);
    });
  });

  // Issue #5
  describe('donor status', () => {
    it('lets a device be marked as a donor', async () => {
      const prisma = getPrisma();
      const device = await prisma.device.create({ data: { sku: 'FZ-TEST-DONOR', make: 'Sony', model: 'PS5' } });

      const result = await deviceActions.update({
        request: makeFormRequest({ id: device.id, status: 'DONOR' })
      } as Parameters<typeof deviceActions.update>[0]);
      expect(result).toEqual({ success: true, id: device.id });
      expect((await prisma.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe('DONOR');
    });
  });
});

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { actions as deviceActions, load as devicesLoad } from '../../src/routes/devices/+page.server';
import { actions as deviceDetailActions, load as deviceDetailLoad } from '../../src/routes/devices/[id]/+page.server';
import { actions as incomeActions } from '../../src/routes/income/+page.server';
import { actions as workOrderActions, load as workOrderLoad } from '../../src/routes/work-orders/[id]/+page.server';
import { POST as splitPost } from '../../src/routes/expenses/split/+server';
import { disconnectDb, getPrisma, makeFormRequest, makeJsonRequest, resetAndSeedDb } from './helpers';

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

async function addIncome(form: Record<string, string>) {
  const result = await incomeActions.create({ request: makeFormRequest({ date: todayStr(), type: 'SALE', ...form }) } as Parameters<typeof incomeActions.create>[0]);
  expect(result).toEqual({ success: true });
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

  // Issue #14: one income holds one device, so a sale of several devices is one income each
  describe('a sale of several devices', () => {
    it('credits each device with its own income, fees and shipping', async () => {
      const prisma = getPrisma();
      const a = await prisma.device.create({ data: { sku: 'FZ-TEST-A', make: 'Sony', model: 'PS5' } });
      const b = await prisma.device.create({ data: { sku: 'FZ-TEST-B', make: 'Sony', model: 'PS4' } });

      await addIncome({ amount: '300.00', deviceId: a.id, platformFees: '7.50', paymentFees: '3.00', shippingRevenue: '15.00', shippingCost: '9.00', taxCollected: '6.00' });
      await addIncome({ amount: '100.00', deviceId: b.id, platformFees: '2.50', paymentFees: '1.00', shippingRevenue: '5.00', shippingCost: '3.00', taxCollected: '2.00' });

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

    it('recording income never changes a device status', async () => {
      const prisma = getPrisma();
      const a = await prisma.device.create({ data: { sku: 'FZ-TEST-A', make: 'Sony', model: 'PS5', status: 'LISTED' } });
      await addIncome({ amount: '300.00', deviceId: a.id });
      expect((await prisma.device.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('LISTED');
    });

    it('drops the sale from the device once the income is archived', async () => {
      const prisma = getPrisma();
      const a = await prisma.device.create({ data: { sku: 'FZ-TEST-A', make: 'Sony', model: 'PS5' } });
      await addIncome({ amount: '300.00', deviceId: a.id });
      expect(await netFor(a.id)).toBe(30000);

      await prisma.income.updateMany({ where: { deviceId: a.id }, data: { archivedAt: new Date() } });
      expect(await netFor(a.id)).toBe(0);
      expect((await loadDevice(a.id)).incomes).toHaveLength(0);
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

  // Issue #11: a donor's cost reaches other work orders through the parts pulled from it
  describe('donor harvest', () => {
    async function setup() {
      const prisma = getPrisma();
      const category = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });
      const donor = await prisma.device.create({ data: { sku: 'FZ-TEST-DONOR', make: 'Sony', model: 'PS5', status: 'DONOR' } });
      await prisma.expense.create({ data: { date: new Date(), amountCents: 10000, subtotalCents: 10000, categoryId: category.id, deviceId: donor.id } });
      return { prisma, donor };
    }

    const harvest = (deviceId: string, data: Record<string, string>) =>
      deviceDetailActions.harvest_part({ request: makeFormRequest(data), params: { id: deviceId } } as Parameters<typeof deviceDetailActions.harvest_part>[0]);
    const undo = (deviceId: string, id: string) =>
      deviceDetailActions.undo_harvest({ request: makeFormRequest({ id }), params: { id: deviceId } } as Parameters<typeof deviceDetailActions.undo_harvest>[0]);
    const loadWorkOrder = async (id: string) => (await workOrderLoad({ params: { id } } as Parameters<typeof workOrderLoad>[0])) as any;

    it('moves the harvested value off the donor and into parts stock', async () => {
      const { prisma, donor } = await setup();
      expect(await netFor(donor.id)).toBe(-10000);

      expect(await harvest(donor.id, { newPartName: 'PS5 Fan', quantity: '2', unitCost: '15' })).toEqual({ success: true });
      const part = await prisma.part.findFirstOrThrow({ where: { name: 'PS5 Fan' } });
      expect(part).toMatchObject({ quantity: 2, averageCostCents: 1500 });

      const data = await loadDevice(donor.id);
      expect(data.summary).toMatchObject({ expenses: 10000, harvested: 3000, unharvested: 7000, netProfitCents: -7000 });
      expect(data.harvested).toHaveLength(1);
      expect(data.harvested[0]).toMatchObject({ quantity: 2, unitCostCents: 1500, totalCostCents: 3000, part: { id: part.id } });
    });

    it('charges each work order for the harvested part it uses, and the donor only for what is left', async () => {
      const { prisma, donor } = await setup();
      await harvest(donor.id, { newPartName: 'PS5 Fan', quantity: '2', unitCost: '15' });
      const part = await prisma.part.findFirstOrThrow({ where: { name: 'PS5 Fan' } });

      const repairs = [];
      for (const sku of ['FZ-TEST-R1', 'FZ-TEST-R2']) {
        const device = await prisma.device.create({ data: { sku, make: 'Sony', model: 'PS5' } });
        const wo = await prisma.workOrder.create({ data: { code: `WO-${sku}` } });
        await prisma.workOrderDevice.create({ data: { workOrderId: wo.id, deviceId: device.id } });
        const result = await workOrderActions.add_item({
          request: makeFormRequest({ type: 'PART', partId: part.id, quantity: '1' }),
          params: { id: wo.id }
        } as Parameters<typeof workOrderActions.add_item>[0]);
        expect(result).toEqual({ success: true });
        repairs.push({ device, wo });
      }

      for (const { device, wo } of repairs) {
        expect((await loadWorkOrder(wo.id)).summary).toMatchObject({ partsCostCents: 1500, deviceExpensesCents: 0, profitCents: -1500 });
        expect(await netFor(device.id)).toBe(-1500);
      }

      // The donor itself on a work order carries only the cost that was not harvested
      const scrap = await prisma.workOrder.create({ data: { code: 'WO-TEST-SCRAP' } });
      await prisma.workOrderDevice.create({ data: { workOrderId: scrap.id, deviceId: donor.id, role: 'DONOR' } });
      const data = await loadWorkOrder(scrap.id);
      expect(data.summary.deviceExpensesCents).toBe(7000);
      expect(data.workOrder.devices[0]).toMatchObject({ expensesCents: 7000, harvestedCents: 3000 });
    });

    it('averages a harvested part into existing stock', async () => {
      const { prisma, donor } = await setup();
      const part = await prisma.part.create({ data: { name: 'HDMI Port', quantity: 1, averageCostCents: 1000 } });

      expect(await harvest(donor.id, { partId: part.id, quantity: '1', unitCost: '20' })).toEqual({ success: true });
      expect(await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).toMatchObject({ quantity: 2, averageCostCents: 1500 });
    });

    it('refuses to harvest more value than the donor has left', async () => {
      const { prisma, donor } = await setup();
      await harvest(donor.id, { newPartName: 'PS5 Fan', quantity: '1', unitCost: '80' });

      const result = await harvest(donor.id, { newPartName: 'PS5 Drive', quantity: '1', unitCost: '20.01' });
      expect(result).toMatchObject({ status: 400, data: { error: "Only $20.00 of this device's cost is left to move into parts stock" } });
      expect(await prisma.part.count({ where: { name: 'PS5 Drive' } })).toBe(0);
      expect(await netFor(donor.id)).toBe(-2000);
    });

    it('only harvests from a device marked as a donor', async () => {
      const { prisma, donor } = await setup();
      await prisma.device.update({ where: { id: donor.id }, data: { status: 'REPAIRING' } });

      const result = await harvest(donor.id, { newPartName: 'PS5 Fan', quantity: '1', unitCost: '15' });
      expect(result).toMatchObject({ status: 400 });
      expect(await prisma.partInventoryMovement.count()).toBe(0);
    });

    it('puts the cost back on the donor when a harvest is undone', async () => {
      const { prisma, donor } = await setup();
      const part = await prisma.part.create({ data: { name: 'HDMI Port', quantity: 1, averageCostCents: 1000 } });
      await harvest(donor.id, { partId: part.id, quantity: '1', unitCost: '20' });
      const movement = await prisma.partInventoryMovement.findFirstOrThrow({ where: { sourceDeviceId: donor.id } });

      expect(await undo(donor.id, movement.id)).toEqual({ success: true });
      expect(await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).toMatchObject({ quantity: 1, averageCostCents: 1000 });
      expect(await netFor(donor.id)).toBe(-10000);
      expect((await loadDevice(donor.id)).harvested).toHaveLength(0);
    });

    it('will not undo a harvest whose parts are already used', async () => {
      const { prisma, donor } = await setup();
      await harvest(donor.id, { newPartName: 'PS5 Fan', quantity: '1', unitCost: '15' });
      const part = await prisma.part.findFirstOrThrow({ where: { name: 'PS5 Fan' } });
      const wo = await prisma.workOrder.create({ data: { code: 'WO-TEST-USED' } });
      await workOrderActions.add_item({
        request: makeFormRequest({ type: 'PART', partId: part.id, quantity: '1' }),
        params: { id: wo.id }
      } as Parameters<typeof workOrderActions.add_item>[0]);
      const movement = await prisma.partInventoryMovement.findFirstOrThrow({ where: { sourceDeviceId: donor.id } });

      expect(await undo(donor.id, movement.id)).toMatchObject({ status: 400 });
      expect(await netFor(donor.id)).toBe(-8500);
    });
  });
});

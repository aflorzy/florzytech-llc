import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { actions as workOrderActions, load as workOrderLoad } from '../../src/routes/work-orders/[id]/+page.server';
import { load as deviceDetailLoad } from '../../src/routes/devices/[id]/+page.server';
import { POST as splitPost } from '../../src/routes/expenses/split/+server';
import { actions as incomeActions } from '../../src/routes/income/+page.server';
import { disconnectDb, getPrisma, makeFormRequest, makeJsonRequest, resetAndSeedDb } from './helpers';

describe('work order inventory and financial rollup', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('decrements part inventory on PART add_item and restores on delete_item', async () => {
    const prisma = getPrisma();

    const part = await prisma.part.create({ data: { name: 'HDMI Port', quantity: 10, averageCostCents: 500 } });
    const wo = await prisma.workOrder.create({ data: { code: `WO-INV-${Date.now()}` } });

    const addReq = makeFormRequest({ type: 'PART', partId: part.id, quantity: '2' });
    const addResult = await workOrderActions.add_item({ request: addReq, params: { id: wo.id } } as Parameters<typeof workOrderActions.add_item>[0]);
    expect(addResult).toEqual({ success: true });

    const partAfterConsume = await prisma.part.findUniqueOrThrow({ where: { id: part.id } });
    expect(partAfterConsume.quantity).toBe(8);

    const item = await prisma.workOrderItem.findFirstOrThrow({ where: { workOrderId: wo.id, type: 'PART', archivedAt: null } });
    expect(item.unitCostCentsSnapshot).toBe(500);

    const movementConsume = await prisma.partInventoryMovement.findFirstOrThrow({ where: { workOrderId: wo.id, type: 'CONSUME' } });
    expect(movementConsume.quantity).toBe(2);
    expect(movementConsume.totalCostCents).toBe(1000);

    const deleteReq = makeFormRequest({ id: item.id });
    const delResult = await workOrderActions.delete_item({ request: deleteReq } as Parameters<typeof workOrderActions.delete_item>[0]);
    expect(delResult).toEqual({ success: true });

    const partAfterReversal = await prisma.part.findUniqueOrThrow({ where: { id: part.id } });
    expect(partAfterReversal.quantity).toBe(10);

    const movementAdjust = await prisma.partInventoryMovement.findFirstOrThrow({ where: { workOrderId: wo.id, type: 'ADJUSTMENT' } });
    expect(movementAdjust.quantity).toBe(2);

    const archivedItem = await prisma.workOrderItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(archivedItem.archivedAt).not.toBeNull();
  });

  it('computes work-order profit rollup from income, parts cost, and device expenses', async () => {
    const prisma = getPrisma();

    const device = await prisma.device.create({
      data: {
        sku: `FIX-WO-${Date.now()}`,
        make: 'Sony',
        model: 'PS5',
        status: 'REPAIRING'
      }
    });
    const part = await prisma.part.create({ data: { name: 'Fan', quantity: 5, averageCostCents: 600 } });
    const incomeCategory = await prisma.category.findFirstOrThrow({ where: { kind: 'income' }, select: { id: true } });
    const channel = await prisma.salesChannel.findFirstOrThrow({ select: { id: true } });
    const expenseCategory = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });

    const wo = await prisma.workOrder.create({ data: { code: `WO-PROFIT-${Date.now()}` } });
    await prisma.workOrderDevice.create({ data: { workOrderId: wo.id, deviceId: device.id, role: 'PRIMARY' } });
    await prisma.workOrderItem.create({
      data: {
        workOrderId: wo.id,
        type: 'PART',
        partId: part.id,
        quantity: 2,
        unitCostCentsSnapshot: 600
      }
    });

    await prisma.expense.create({
      data: {
        date: new Date(),
        amountCents: 700,
        subtotalCents: 700,
        categoryId: expenseCategory.id,
        deviceId: device.id
      }
    });

    await prisma.income.create({
      data: {
        date: new Date(),
        type: 'SERVICE',
        amountCents: 10000,
        platformFeesCents: 500,
        paymentFeesCents: 200,
        shippingRevenueCents: 300,
        shippingCostCents: 100,
        categoryId: incomeCategory.id,
        channelId: channel.id,
        workOrderId: wo.id
      }
    });

    const data = (await workOrderLoad({ params: { id: wo.id } } as Parameters<typeof workOrderLoad>[0])) as any;

    expect(data.summary.income.netRevenueCents).toBe(9500);
    expect(data.summary.partsCostCents).toBe(1200);
    expect(data.summary.deviceExpensesCents).toBe(700);
    expect(data.summary.profitCents).toBe(7600);
  });

  // Issue #8: an archived income stops counting toward its work order
  it('leaves an archived income out of work-order revenue and profit', async () => {
    const prisma = getPrisma();
    const wo = await prisma.workOrder.create({ data: { code: 'WO-TEST-ARCHIVED' } });

    const pay = (form: Record<string, string>) =>
      incomeActions.create({ request: makeFormRequest({ date: '2026-03-01', type: 'SERVICE', workOrderId: wo.id, ...form }) } as Parameters<typeof incomeActions.create>[0]);
    expect(await pay({ amount: '50.00', platformFees: '1.00' })).toEqual({ success: true });
    expect(await pay({ amount: '280.00' })).toEqual({ success: true });
    const { id } = await prisma.income.findFirstOrThrow({ where: { workOrderId: wo.id, amountCents: 28000 }, select: { id: true } });

    const archiveResult = await incomeActions.delete({ request: makeFormRequest({ id }) } as Parameters<typeof incomeActions.delete>[0]);
    expect(archiveResult).toEqual({ success: true, id });

    const data = (await workOrderLoad({ params: { id: wo.id } } as Parameters<typeof workOrderLoad>[0])) as any;
    expect(data.summary.income.grossCents).toBe(5000);
    expect(data.summary.income.netRevenueCents).toBe(4900);
    expect(data.summary.profitCents).toBe(4900);
  });

  it('charges a part bought for a device once: as consumed stock, not also as a device expense', async () => {
    const prisma = getPrisma();
    const device = await prisma.device.create({ data: { sku: 'FZ-TEST-ONCE', make: 'Sony', model: 'PS5' } });
    const part = await prisma.part.create({ data: { name: 'HDMI Port', quantity: 0 } });
    const partsCategory = await prisma.category.findFirstOrThrow({ where: { kind: 'expense', name: 'Parts' }, select: { id: true } });
    const wo = await prisma.workOrder.create({ data: { code: 'WO-TEST-ONCE' } });
    await prisma.workOrderDevice.create({ data: { workOrderId: wo.id, deviceId: device.id, role: 'PRIMARY' } });

    // Receipt: one line buys the part for this device and receives it into inventory,
    // the other is a device-only cost that never touches inventory.
    const response = await splitPost({
      request: makeJsonRequest({
        date: '2026-03-01',
        allocationMethod: 'EVEN',
        totals: { totalTaxCents: 0, totalShippingCents: 0, totalOtherFeesCents: 0 },
        lines: [
          { categoryId: partsCategory.id, deviceId: device.id, subtotalCents: 2000, partId: part.id, quantity: 1 },
          { categoryId: partsCategory.id, deviceId: device.id, subtotalCents: 700 }
        ]
      })
    } as Parameters<typeof splitPost>[0]);
    expect(response.status).toBe(200);

    const addResult = await workOrderActions.add_item({
      request: makeFormRequest({ type: 'PART', partId: part.id, quantity: '1' }),
      params: { id: wo.id }
    } as Parameters<typeof workOrderActions.add_item>[0]);
    expect(addResult).toEqual({ success: true });

    await prisma.income.create({ data: { date: new Date(), type: 'SERVICE', amountCents: 10000, workOrderId: wo.id } });

    const data = (await workOrderLoad({ params: { id: wo.id } } as Parameters<typeof workOrderLoad>[0])) as any;
    expect(data.summary.partsCostCents).toBe(2000);
    expect(data.summary.deviceExpensesCents).toBe(700);
    expect(data.summary.profitCents).toBe(10000 - 2000 - 700);
  });

  // Issue #17: a purchased device sold on one work order, then back as a customer repair on another
  describe('device on several work orders', () => {
    const load = async (id: string) => (await workOrderLoad({ params: { id } } as Parameters<typeof workOrderLoad>[0])) as any;
    const addDevice = (workOrderId: string, deviceId: string) =>
      workOrderActions.add_device({
        request: makeFormRequest({ deviceId, role: 'PRIMARY' }),
        params: { id: workOrderId }
      } as Parameters<typeof workOrderActions.add_device>[0]);

    async function soldThenReturned() {
      const prisma = getPrisma();
      const device = await prisma.device.create({ data: { sku: 'FZ-TEST-REPEAT', make: 'Sony', model: 'PS5', purchasePriceCents: 15000 } });
      const category = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });
      await prisma.expense.create({ data: { date: new Date('2026-01-05'), amountCents: 15000, subtotalCents: 15000, categoryId: category.id, deviceId: device.id } });

      const sale = await prisma.workOrder.create({ data: { code: 'WO-TEST-SALE', targetAction: 'SELL' } });
      await addDevice(sale.id, device.id);
      await prisma.income.create({ data: { date: new Date('2026-01-20'), type: 'SALE', amountCents: 40000, workOrderId: sale.id } });

      const repair = await prisma.workOrder.create({ data: { code: 'WO-TEST-REPAIR' } });
      await addDevice(repair.id, device.id);
      await prisma.income.create({ data: { date: new Date('2026-10-01'), type: 'SERVICE', amountCents: 8000, workOrderId: repair.id } });
      return { sale, repair };
    }

    it('charges the purchase cost to the first work order only', async () => {
      const { sale, repair } = await soldThenReturned();

      const saleData = await load(sale.id);
      expect(saleData.summary.deviceExpensesCents).toBe(15000);
      expect(saleData.summary.profitCents).toBe(25000);
      expect(saleData.workOrder.devices[0]).toMatchObject({ includeDeviceCost: true, expensesCents: 15000, costCountedOn: null });

      const repairData = await load(repair.id);
      expect(repairData.summary.deviceExpensesCents).toBe(0);
      expect(repairData.summary.profitCents).toBe(8000);
      expect(repairData.workOrder.devices[0]).toMatchObject({ includeDeviceCost: false, costCountedOn: { id: sale.id, code: 'WO-TEST-SALE' } });
    });

    it('lists both work orders and their income on the device page', async () => {
      const { repair } = await soldThenReturned();
      const device = await getPrisma().device.findFirstOrThrow({ where: { sku: 'FZ-TEST-REPEAT' } });
      await getPrisma().income.updateMany({ where: { workOrderId: repair.id }, data: { deviceId: device.id } });

      const data = (await deviceDetailLoad({ params: { id: device.id } } as Parameters<typeof deviceDetailLoad>[0])) as any;
      expect(data.workOrders.map((l: any) => [l.workOrder.code, l.includeDeviceCost]).sort()).toEqual([
        ['WO-TEST-REPAIR', false],
        ['WO-TEST-SALE', true]
      ]);
      expect(data.incomes).toHaveLength(1);
      expect(data.incomes[0].workOrder).toEqual({ id: repair.id, code: 'WO-TEST-REPAIR' });
    });

    it('moves the cost when it is counted on another work order', async () => {
      const { sale, repair } = await soldThenReturned();
      const link = (await load(repair.id)).workOrder.devices[0];

      const result = await workOrderActions.set_device_cost({
        request: makeFormRequest({ id: link.id, include: 'true' }),
        params: { id: repair.id }
      } as Parameters<typeof workOrderActions.set_device_cost>[0]);
      expect(result).toEqual({ success: true });

      expect((await load(repair.id)).summary.deviceExpensesCents).toBe(15000);
      const saleData = await load(sale.id);
      expect(saleData.summary.deviceExpensesCents).toBe(0);
      expect(saleData.workOrder.devices[0].costCountedOn).toMatchObject({ id: repair.id });
    });

    it('counts the cost on a new work order once the earlier one is archived', async () => {
      const prisma = getPrisma();
      const { sale, repair } = await soldThenReturned();
      const device = await prisma.device.findFirstOrThrow({ where: { sku: 'FZ-TEST-REPEAT' } });
      await prisma.workOrder.update({ where: { id: sale.id }, data: { archivedAt: new Date() } });
      await prisma.workOrder.update({ where: { id: repair.id }, data: { archivedAt: new Date() } });

      const redo = await prisma.workOrder.create({ data: { code: 'WO-TEST-REDO' } });
      await addDevice(redo.id, device.id);
      expect((await load(redo.id)).summary.deviceExpensesCents).toBe(15000);
    });
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions as incomeActions, load as incomeLoad } from '../../src/routes/income/+page.server';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { load as devicesLoad } from '../../src/routes/devices/+page.server';
import { load as deviceDetailLoad } from '../../src/routes/devices/[id]/+page.server';
import { actions as workOrderActions, load as workOrderLoad } from '../../src/routes/work-orders/[id]/+page.server';
import { actions as pricingActions } from '../../src/routes/settings/pricing/+page.server';
import { disconnectDb, getPrisma, makeFormRequest, makeLoadEvent, resetAndSeedDb } from './helpers';

// Issue #14: Add Income is the one way to record money received. An income is an amount with
// fees, shipping and tax, optionally tied to a work order and/or a device. The work order
// holds the breakdown of what was sold; an income never touches parts stock or a device status.

type Form = Record<string, string>;
const addIncome = (form: Form) => (incomeActions.create as any)({ request: makeFormRequest({ date: '2026-03-01', type: 'SALE', ...form }) }) as Promise<any>;
const editIncome = (form: Form) => (incomeActions.update as any)({ request: makeFormRequest({ date: '2026-03-01', type: 'SALE', ...form }) }) as Promise<any>;
const archiveIncome = (id: string) => (incomeActions.delete as any)({ request: makeFormRequest({ id }) }) as Promise<any>;
const dashboard = async () => (await dashboardLoad(makeLoadEvent<Parameters<typeof dashboardLoad>[0]>())) as any;
const workOrder = async (id: string) => (await workOrderLoad({ params: { id } } as Parameters<typeof workOrderLoad>[0])) as any;
const device = async (id: string) => (await deviceDetailLoad({ params: { id } } as Parameters<typeof deviceDetailLoad>[0])) as any;
const incomePage = async (query = '') => (await incomeLoad(makeLoadEvent<Parameters<typeof incomeLoad>[0]>(`http://localhost/income${query}`))) as any;
const listNet = async (id: string): Promise<number> => ((await devicesLoad({} as Parameters<typeof devicesLoad>[0])) as any).devices.find((d: any) => d.id === id).netCents;
const invoiceState = (id: string) => getPrisma().workOrder.findUniqueOrThrow({ where: { id }, select: { invoicedAt: true, invoicedMarkupBps: true } });
const NOT_INVOICED = { invoicedAt: null, invoicedMarkupBps: null };

// Seed fixtures: one income of $300.00 with $15.00 fees, $3.00 shipping in and $1.00 shipping
// out (net $287.00), and one expense of $150.00.
const SEED_MONEY_IN = 28700;
const SEED_SPENDING_POWER = 13700;

let seq = 0;
// A device that cost `costCents`, on a "Sell" work order as its primary device
async function saleJob(costCents = 15000) {
  const prisma = getPrisma();
  const n = ++seq;
  const dev = await prisma.device.create({ data: { sku: `FZ-TEST-${n}`, make: 'Sony', model: 'PS5' } });
  if (costCents > 0) {
    const category = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });
    await prisma.expense.create({ data: { date: new Date(2026, 0, 5), amountCents: costCents, subtotalCents: costCents, categoryId: category.id, deviceId: dev.id } });
  }
  const order = await prisma.workOrder.create({ data: { code: `WO-TEST-${n}`, targetAction: 'SELL' } });
  await prisma.workOrderDevice.create({ data: { workOrderId: order.id, deviceId: dev.id, role: 'PRIMARY' } });
  return { dev, order, costCents };
}
async function onlyIncome(where: Record<string, unknown>) {
  return getPrisma().income.findFirstOrThrow({ where: { OR: [{ notes: null }, { notes: { not: 'Fixture income' } }], ...where } });
}

describe('one way to add income', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  describe('what an income is tied to', () => {
    // $200.00, $10.00 platform fee, $4.00 payment fee, $12.00 shipping in, $9.00 shipping out, $16.00 tax
    const money = { amount: '200.00', platformFees: '10.00', paymentFees: '4.00', shippingRevenue: '12.00', shippingCost: '9.00', taxCollected: '16.00' };
    const NET = 20000 - 1000 - 400 + 1200 - 900; // 18900, tax left out

    it('neither: counts in spending power only', async () => {
      const { dev, order, costCents } = await saleJob();
      const before = await dashboard();
      expect(await addIncome(money)).toEqual({ success: true });

      const after = await dashboard();
      expect(after.totals.moneyInNetCents - before.totals.moneyInNetCents).toBe(NET);
      expect(after.totals.spendingPowerCents - before.totals.spendingPowerCents).toBe(NET);
      expect(after.totals.taxesCollectedCents).toBe(1600);
      expect(after.totals.feesCents - before.totals.feesCents).toBe(1400);

      expect(await listNet(dev.id)).toBe(-costCents);
      expect((await device(dev.id)).incomes).toEqual([]);
      const data = await workOrder(order.id);
      expect(data.summary.income.netRevenueCents).toBe(0);
      expect(data.summary.invoice.receivedCents).toBe(0);
      expect(data.summary.profitCents).toBe(-costCents);
      expect(await invoiceState(order.id)).toEqual(NOT_INVOICED);
    });

    it('a device only: credits the device, not a work order the device is on', async () => {
      const { dev, order, costCents } = await saleJob();
      const before = await dashboard();
      expect(await addIncome({ ...money, deviceId: dev.id })).toEqual({ success: true });

      expect((await dashboard()).totals.spendingPowerCents - before.totals.spendingPowerCents).toBe(NET);
      expect(await listNet(dev.id)).toBe(NET - costCents);
      const detail = await device(dev.id);
      expect(detail.summary).toMatchObject({ income: 20000, fees: 1400, shippingNet: 300, taxCollected: 1600, expenses: costCents, netProfitCents: NET - costCents });
      expect(detail.incomes).toHaveLength(1);
      expect(detail.incomes[0]).toMatchObject({ amountCents: 20000, feesCents: 1400, shippingNetCents: 300, workOrder: null });

      const data = await workOrder(order.id);
      expect(data.summary.income.grossCents).toBe(0);
      expect(data.summary.invoice.receivedCents).toBe(0);
      expect(data.summary.profitCents).toBe(-costCents);
      expect(await invoiceState(order.id)).toEqual(NOT_INVOICED);
    });

    it('a work order only: the whole amount is the work order\'s and no device is credited', async () => {
      const { dev, order, costCents } = await saleJob();
      const before = await dashboard();
      expect(await addIncome({ ...money, workOrderId: order.id })).toEqual({ success: true });

      expect((await dashboard()).totals.spendingPowerCents - before.totals.spendingPowerCents).toBe(NET);
      const data = await workOrder(order.id);
      expect(data.summary.income).toEqual({ grossCents: 20000, platformFeesCents: 1000, paymentFeesCents: 400, shippingRevenueCents: 1200, shippingCostCents: 900, netRevenueCents: NET });
      expect(data.summary.deviceExpensesCents).toBe(costCents);
      expect(data.summary.profitCents).toBe(NET - costCents);
      // Received is what was paid, before fees, shipping and tax
      expect(data.summary.invoice.receivedCents).toBe(20000);

      expect(await listNet(dev.id)).toBe(-costCents);
      expect((await device(dev.id)).summary).toMatchObject({ income: 0, fees: 0, shippingNet: 0, taxCollected: 0 });
      expect((await invoiceState(order.id)).invoicedAt).toEqual(new Date(2026, 2, 1));
    });

    it('both: the work order and the device each show the sale, and spending power counts it once', async () => {
      const { dev, order, costCents } = await saleJob();
      const before = await dashboard();
      expect(await addIncome({ ...money, workOrderId: order.id, deviceId: dev.id })).toEqual({ success: true });

      const after = await dashboard();
      expect(after.totals.moneyInNetCents - before.totals.moneyInNetCents).toBe(NET);
      expect(after.totals.spendingPowerCents - before.totals.spendingPowerCents).toBe(NET);
      expect((await workOrder(order.id)).summary.profitCents).toBe(NET - costCents);
      expect(await listNet(dev.id)).toBe(NET - costCents);
      expect((await device(dev.id)).incomes[0].workOrder).toEqual({ id: order.id, code: order.code });
    });

    it('a device that is not on the income\'s work order is still credited, and the work order still gets the revenue', async () => {
      const { order } = await saleJob();
      const other = await getPrisma().device.create({ data: { sku: 'FZ-TEST-ELSEWHERE', make: 'Sony', model: 'PS4' } });
      await addIncome({ amount: '80.00', workOrderId: order.id, deviceId: other.id });
      expect(await listNet(other.id)).toBe(8000);
      expect((await workOrder(order.id)).summary.income.grossCents).toBe(8000);
    });

    it('lists the work order and the device on the Income page', async () => {
      const { dev, order } = await saleJob();
      await addIncome({ amount: '80.00', workOrderId: order.id, deviceId: dev.id, notes: 'Listed' });
      const row = (await incomePage()).income.find((r: any) => r.notes === 'Listed');
      expect(row.workOrder).toMatchObject({ id: order.id, code: order.code });
      expect(row.device).toMatchObject({ id: dev.id, sku: dev.sku });
      expect(row).toMatchObject({ amountCents: 8000, platformFeesCents: 0, paymentFeesCents: 0, shippingRevenueCents: 0, shippingCostCents: 0, taxCollectedCents: 0 });
    });
  });

  describe('fees, shipping and tax', () => {
    const cases: Array<[string, Form, { net: number; fees: number; shippingNet: number; tax: number }]> = [
      ['a platform fee comes off', { platformFees: '12.34' }, { net: 10000 - 1234, fees: 1234, shippingNet: 0, tax: 0 }],
      ['a payment fee comes off', { paymentFees: '3.21' }, { net: 10000 - 321, fees: 321, shippingNet: 0, tax: 0 }],
      ['shipping charged to the buyer is added', { shippingRevenue: '8.50' }, { net: 10000 + 850, fees: 0, shippingNet: 850, tax: 0 }],
      ['the shipping label comes off', { shippingCost: '7.25' }, { net: 10000 - 725, fees: 0, shippingNet: -725, tax: 0 }],
      ['tax collected is tracked but is not profit', { taxCollected: '8.25' }, { net: 10000, fees: 0, shippingNet: 0, tax: 825 }],
      [
        'all of them together',
        { platformFees: '12.34', paymentFees: '3.21', shippingRevenue: '8.50', shippingCost: '7.25', taxCollected: '8.25' },
        { net: 10000 - 1234 - 321 + 850 - 725, fees: 1555, shippingNet: 125, tax: 825 }
      ]
    ];

    it.each(cases)('%s, on the device, the work order and the dashboard alike', async (_name, form, expected) => {
      const { dev, order, costCents } = await saleJob(4000);
      expect(await addIncome({ amount: '100.00', workOrderId: order.id, deviceId: dev.id, ...form })).toEqual({ success: true });

      const totals = (await dashboard()).totals;
      expect(totals.moneyInNetCents).toBe(SEED_MONEY_IN + expected.net);
      // The device's $40.00 cost is an expense
      expect(totals.spendingPowerCents).toBe(SEED_SPENDING_POWER + expected.net - costCents);
      expect(totals.taxesCollectedCents).toBe(expected.tax);
      expect(totals.feesCents).toBe(1500 + expected.fees);

      const detail = await device(dev.id);
      expect(detail.summary).toMatchObject({ income: 10000, fees: expected.fees, shippingNet: expected.shippingNet, taxCollected: expected.tax, netProfitCents: expected.net - costCents });
      expect(await listNet(dev.id)).toBe(expected.net - costCents);

      const data = await workOrder(order.id);
      expect(data.summary.income.netRevenueCents).toBe(expected.net);
      expect(data.summary.profitCents).toBe(expected.net - costCents);
      expect(data.summary.invoice.receivedCents).toBe(10000);
    });
  });

  describe('several incomes on one work order', () => {
    it('add up as revenue and as received, each with its own fees', async () => {
      const { order, costCents } = await saleJob();
      await addIncome({ amount: '100.00', workOrderId: order.id, platformFees: '5.00' });
      await addIncome({ amount: '60.00', workOrderId: order.id, shippingRevenue: '10.00', shippingCost: '8.00' });
      await addIncome({ amount: '0.01', workOrderId: order.id, paymentFees: '0.01' });

      const data = await workOrder(order.id);
      expect(data.summary.income).toEqual({
        grossCents: 16001,
        platformFeesCents: 500,
        paymentFeesCents: 1,
        shippingRevenueCents: 1000,
        shippingCostCents: 800,
        netRevenueCents: 16001 - 500 - 1 + 1000 - 800
      });
      expect(data.summary.invoice.receivedCents).toBe(16001);
      expect(data.summary.profitCents).toBe(15700 - costCents);
    });

    it('one income per device credits each device and the work order shows the sum', async () => {
      const prisma = getPrisma();
      const { dev: main, order } = await saleJob(15000);
      const accessory = await prisma.device.create({ data: { sku: 'FZ-TEST-PAD', make: 'Sony', model: 'DualSense' } });
      await prisma.workOrderDevice.create({ data: { workOrderId: order.id, deviceId: accessory.id, role: 'ACCESSORY' } });

      await addIncome({ amount: '230.00', workOrderId: order.id, deviceId: main.id });
      await addIncome({ amount: '10.00', workOrderId: order.id, deviceId: accessory.id });

      expect(await listNet(main.id)).toBe(23000 - 15000);
      expect(await listNet(accessory.id)).toBe(1000);
      const data = await workOrder(order.id);
      expect(data.summary.income.grossCents).toBe(24000);
      expect(data.summary.profitCents).toBe(24000 - 15000);
      // No cent created or lost: the devices add up to what the work order received
      expect((await listNet(main.id)) + 15000 + (await listNet(accessory.id))).toBe(data.summary.invoice.receivedCents);
    });

    it('one income for the whole job credits the work order in full and no device', async () => {
      const prisma = getPrisma();
      const { dev: main, order } = await saleJob(15000);
      const accessory = await prisma.device.create({ data: { sku: 'FZ-TEST-PAD', make: 'Sony', model: 'DualSense' } });
      await prisma.workOrderDevice.create({ data: { workOrderId: order.id, deviceId: accessory.id, role: 'ACCESSORY' } });

      await addIncome({ amount: '250.00', workOrderId: order.id });
      expect((await workOrder(order.id)).summary.profitCents).toBe(25000 - 15000);
      expect(await listNet(main.id)).toBe(-15000);
      expect(await listNet(accessory.id)).toBe(0);
    });

    it('incomes on two work orders stay on their own work order', async () => {
      const a = await saleJob(0);
      const b = await saleJob(0);
      await addIncome({ amount: '70.00', workOrderId: a.order.id });
      await addIncome({ amount: '30.00', workOrderId: b.order.id });
      expect((await workOrder(a.order.id)).summary.income.grossCents).toBe(7000);
      expect((await workOrder(b.order.id)).summary.income.grossCents).toBe(3000);
    });
  });

  describe('the first income marks the work order invoiced', () => {
    const setMarkup = (percent: string) => (pricingActions.save as any)({ request: makeFormRequest({ partsMarkup: percent }) }) as Promise<any>;
    async function jobWithPart() {
      const job = await saleJob(0);
      const part = await getPrisma().part.create({ data: { name: 'Screen', quantity: 5, averageCostCents: 1500 } });
      const added = await (workOrderActions.add_item as any)({ request: makeFormRequest({ type: 'PART', partId: part.id, quantity: '1' }), params: { id: job.order.id } });
      expect(added).toEqual({ success: true });
      return { ...job, part };
    }
    const partsPrice = async (id: string) => (await workOrder(id)).summary.invoice.partsPriceCents;

    it('through Add Income, freezing the markup in force that day', async () => {
      const { order } = await jobWithPart();
      await setMarkup('40');
      expect(await partsPrice(order.id)).toBe(2100);
      expect(await invoiceState(order.id)).toEqual(NOT_INVOICED);

      expect(await addIncome({ amount: '50.00', workOrderId: order.id, date: '2026-02-14' })).toEqual({ success: true });
      expect(await invoiceState(order.id)).toEqual({ invoicedAt: new Date(2026, 1, 14), invoicedMarkupBps: 4000 });

      await setMarkup('90');
      expect(await partsPrice(order.id)).toBe(2100);
      expect((await workOrder(order.id)).pricing).toMatchObject({ markupBps: 4000, markupSource: 'invoice', settingMarkupBps: 9000 });
    });

    it('a second income leaves the date and the frozen markup alone', async () => {
      const { order } = await jobWithPart();
      await addIncome({ amount: '50.00', workOrderId: order.id, date: '2026-02-14' });
      const first = await invoiceState(order.id);
      await setMarkup('75');
      await addIncome({ amount: '25.00', workOrderId: order.id, date: '2026-01-02' });
      expect(await invoiceState(order.id)).toEqual(first);
      expect(await partsPrice(order.id)).toBe(1950);
    });

    it('editing an income to point at a different work order marks that one, and the first stays invoiced', async () => {
      const first = await jobWithPart();
      const second = await jobWithPart();
      await addIncome({ amount: '50.00', workOrderId: first.order.id });
      const firstState = await invoiceState(first.order.id);
      const income = await onlyIncome({ workOrderId: first.order.id });

      await setMarkup('60');
      expect(await editIncome({ id: income.id, amount: '50.00', workOrderId: second.order.id, date: '2026-04-09' })).toEqual({ success: true, id: income.id });

      expect(await invoiceState(first.order.id)).toEqual(firstState);
      expect(await invoiceState(second.order.id)).toEqual({ invoicedAt: new Date(2026, 3, 9), invoicedMarkupBps: 6000 });
      expect(await partsPrice(first.order.id)).toBe(1950);
      expect(await partsPrice(second.order.id)).toBe(2400);
      // The money moved with it
      expect((await workOrder(first.order.id)).summary.income.grossCents).toBe(0);
      expect((await workOrder(second.order.id)).summary.income.grossCents).toBe(5000);
    });

    it('editing an income that had no work order to point at one marks it', async () => {
      const { order } = await jobWithPart();
      await addIncome({ amount: '50.00', notes: 'Loose' });
      const income = await onlyIncome({ notes: 'Loose' });
      expect(await invoiceState(order.id)).toEqual(NOT_INVOICED);
      await editIncome({ id: income.id, amount: '50.00', workOrderId: order.id });
      expect((await invoiceState(order.id)).invoicedMarkupBps).toBe(3000);
    });

    it('editing the amount of an income already on the work order is not a new payment', async () => {
      const { order } = await jobWithPart();
      await addIncome({ amount: '50.00', workOrderId: order.id, date: '2026-02-14' });
      const first = await invoiceState(order.id);
      const income = await onlyIncome({ workOrderId: order.id });
      await setMarkup('99');
      await editIncome({ id: income.id, amount: '55.00', workOrderId: order.id, date: '2026-05-05' });
      expect(await invoiceState(order.id)).toEqual(first);
    });

    it('an income with a device and no work order marks nothing', async () => {
      const { dev, order } = await jobWithPart();
      await addIncome({ amount: '50.00', deviceId: dev.id });
      expect(await invoiceState(order.id)).toEqual(NOT_INVOICED);
    });

    it('there is no other way to record an income', () => {
      expect(Object.keys(incomeActions).sort()).toEqual(['create', 'delete', 'update']);
    });
  });

  describe('editing an income', () => {
    it('amount, fees and date changes reach the dashboard, the device and the work order', async () => {
      const { dev, order, costCents } = await saleJob(5000);
      await addIncome({ amount: '100.00', workOrderId: order.id, deviceId: dev.id, platformFees: '5.00' });
      const income = await onlyIncome({ workOrderId: order.id });

      const result = await editIncome({
        id: income.id,
        amount: '140.00',
        date: '2026-03-09',
        workOrderId: order.id,
        deviceId: dev.id,
        platformFees: '6.00',
        paymentFees: '2.00',
        shippingRevenue: '9.00',
        shippingCost: '11.00',
        taxCollected: '3.00'
      });
      expect(result).toEqual({ success: true, id: income.id });
      const net = 14000 - 600 - 200 + 900 - 1100;

      expect((await getPrisma().income.findUniqueOrThrow({ where: { id: income.id } })).date).toEqual(new Date(2026, 2, 9));
      expect((await dashboard()).totals.spendingPowerCents).toBe(SEED_SPENDING_POWER - costCents + net);
      expect(await listNet(dev.id)).toBe(net - costCents);
      expect((await workOrder(order.id)).summary.profitCents).toBe(net - costCents);
      expect((await workOrder(order.id)).summary.invoice.receivedCents).toBe(14000);
      expect(await getPrisma().income.count()).toBe(2);
    });

    it('changing the device moves the credit from one device to the other', async () => {
      const a = await saleJob(0);
      const b = await saleJob(0);
      await addIncome({ amount: '100.00', deviceId: a.dev.id });
      const income = await onlyIncome({ deviceId: a.dev.id });
      const before = await dashboard();

      await editIncome({ id: income.id, amount: '100.00', deviceId: b.dev.id });
      expect(await listNet(a.dev.id)).toBe(0);
      expect(await listNet(b.dev.id)).toBe(10000);
      expect((await dashboard()).totals).toEqual(before.totals);
    });

    it('clearing the device and the work order leaves the money in spending power only', async () => {
      const { dev, order, costCents } = await saleJob(5000);
      await addIncome({ amount: '100.00', workOrderId: order.id, deviceId: dev.id });
      const income = await onlyIncome({ workOrderId: order.id });
      const before = await dashboard();

      await editIncome({ id: income.id, amount: '100.00', workOrderId: '', deviceId: '' });
      expect(await listNet(dev.id)).toBe(-costCents);
      expect((await workOrder(order.id)).summary.income.grossCents).toBe(0);
      expect((await workOrder(order.id)).summary.invoice.receivedCents).toBe(0);
      expect((await dashboard()).totals).toEqual(before.totals);
    });
  });

  describe('archived rows', () => {
    it('an archived income drops out of the dashboard, the device, the work order and the list', async () => {
      const { dev, order, costCents } = await saleJob(5000);
      await addIncome({ amount: '100.00', workOrderId: order.id, deviceId: dev.id, platformFees: '5.00', taxCollected: '4.00' });
      await addIncome({ amount: '20.00', workOrderId: order.id, deviceId: dev.id });
      const income = await onlyIncome({ amountCents: 10000 });

      expect(await archiveIncome(income.id)).toEqual({ success: true, id: income.id });

      const totals = (await dashboard()).totals;
      expect(totals.spendingPowerCents).toBe(SEED_SPENDING_POWER - costCents + 2000);
      expect(totals.taxesCollectedCents).toBe(0);
      expect(totals.feesCents).toBe(1500);
      expect(await listNet(dev.id)).toBe(2000 - costCents);
      expect((await device(dev.id)).incomes.map((i: any) => i.amountCents)).toEqual([2000]);
      const data = await workOrder(order.id);
      expect(data.summary.income.grossCents).toBe(2000);
      expect(data.summary.invoice.receivedCents).toBe(2000);
      expect(data.summary.profitCents).toBe(2000 - costCents);
      expect((await incomePage()).income.map((r: any) => r.amountCents).sort()).toEqual([2000, 30000]);
      // Archived, not deleted
      expect((await getPrisma().income.findUniqueOrThrow({ where: { id: income.id } })).archivedAt).not.toBeNull();
    });

    it('an archived work order cannot be picked, and money already received against it still counts as received', async () => {
      const prisma = getPrisma();
      const { dev, order, costCents } = await saleJob(5000);
      await addIncome({ amount: '100.00', workOrderId: order.id, deviceId: dev.id });
      const before = await dashboard();

      await prisma.workOrder.update({ where: { id: order.id }, data: { archivedAt: new Date() } });

      expect((await incomePage()).workOrders.map((w: any) => w.id)).not.toContain(order.id);
      // Archiving the job does not un-receive the money
      expect((await dashboard()).totals).toEqual(before.totals);
      expect(await listNet(dev.id)).toBe(10000 - costCents);
      expect((await dashboard()).workOrders.open).toBe(before.workOrders.open - 1);
    });

    it('an archived device cannot be picked for a new income', async () => {
      const { dev } = await saleJob(0);
      await getPrisma().device.update({ where: { id: dev.id }, data: { archivedAt: new Date() } });
      expect((await incomePage()).devices.map((d: any) => d.id)).not.toContain(dev.id);
    });
  });

  describe('$0 and negative amounts', () => {
    it('a $0 income moves no figure but still marks the work order invoiced', async () => {
      const { dev, order, costCents } = await saleJob(5000);
      const before = await dashboard();
      expect(await addIncome({ amount: '0', workOrderId: order.id, deviceId: dev.id })).toEqual({ success: true });

      expect((await dashboard()).totals).toEqual(before.totals);
      expect(await listNet(dev.id)).toBe(-costCents);
      expect((await workOrder(order.id)).summary.profitCents).toBe(-costCents);
      expect((await invoiceState(order.id)).invoicedAt).not.toBeNull();
    });

    it('a negative income (a refund paid out) comes off spending power, the device and the work order', async () => {
      const { dev, order, costCents } = await saleJob(5000);
      await addIncome({ amount: '100.00', workOrderId: order.id, deviceId: dev.id });
      expect(await addIncome({ amount: '-30.00', workOrderId: order.id, deviceId: dev.id })).toEqual({ success: true });

      expect((await dashboard()).totals.spendingPowerCents).toBe(SEED_SPENDING_POWER - costCents + 7000);
      expect(await listNet(dev.id)).toBe(7000 - costCents);
      const data = await workOrder(order.id);
      expect(data.summary.income.grossCents).toBe(7000);
      expect(data.summary.invoice.receivedCents).toBe(7000);
      expect(data.summary.profitCents).toBe(7000 - costCents);
    });

    it('fees larger than the amount give a negative net everywhere', async () => {
      const { dev, order } = await saleJob(0);
      await addIncome({ amount: '5.00', workOrderId: order.id, deviceId: dev.id, platformFees: '6.00', shippingCost: '4.00' });
      expect(await listNet(dev.id)).toBe(-500);
      expect((await workOrder(order.id)).summary.profitCents).toBe(-500);
      expect((await dashboard()).totals.spendingPowerCents).toBe(SEED_SPENDING_POWER - 500);
    });
  });

  describe('dates', () => {
    it('the 30 day figures take an income dated exactly 30 days ago and leave out one a moment older', async () => {
      const prisma = getPrisma();
      await prisma.income.deleteMany();
      await prisma.expense.deleteMany();
      const now = new Date(2026, 5, 15, 12, 0, 0, 0);
      const edge = new Date(2026, 4, 16, 12, 0, 0, 0);
      await prisma.income.create({ data: { date: edge, type: 'SALE', amountCents: 1000, platformFeesCents: 100, taxCollectedCents: 50 } });
      await prisma.income.create({ data: { date: new Date(edge.getTime() - 1), type: 'SALE', amountCents: 70000 } });
      await prisma.income.create({ data: { date: now, type: 'SALE', amountCents: 300 } });

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      const data = await dashboard();
      expect(data.last30).toMatchObject({ moneyInNetCents: 1200, spendingPowerCents: 1200, feesCents: 100, taxesCollectedCents: 50 });
      // All-time figures take every income whatever its date
      expect(data.totals.moneyInNetCents).toBe(71200);
    });

    it('a date range includes incomes recorded on its first and last day and nothing outside', async () => {
      await getPrisma().income.deleteMany();
      for (const date of ['2026-01-14', '2026-01-15', '2026-01-20', '2026-01-31', '2026-02-01']) await addIncome({ amount: '10.00', date, notes: date });
      const notes = async (query: string) => (await incomePage(query)).income.map((r: any) => r.notes);

      expect(await notes('?from=2026-01-15&to=2026-01-31')).toEqual(['2026-01-31', '2026-01-20', '2026-01-15']);
      expect(await notes('?from=2026-01-20&to=2026-01-20')).toEqual(['2026-01-20']);
      expect(await notes('?from=2026-01-31')).toEqual(['2026-02-01', '2026-01-31']);
      expect(await notes('?to=2026-01-14')).toEqual(['2026-01-14']);
    });
  });

  describe('parts stock', () => {
    async function jobWithPartUsed() {
      const prisma = getPrisma();
      const job = await saleJob(0);
      const part = await prisma.part.create({ data: { name: 'HDMI Port', quantity: 5, averageCostCents: 800 } });
      const added = await (workOrderActions.add_item as any)({ request: makeFormRequest({ type: 'PART', partId: part.id, quantity: '2', deviceId: job.dev.id }), params: { id: job.order.id } });
      expect(added).toEqual({ success: true });
      return { ...job, part };
    }
    const stock = async (partId: string) => {
      const prisma = getPrisma();
      const part = await prisma.part.findUniqueOrThrow({ where: { id: partId }, select: { quantity: true, averageCostCents: true } });
      const movements = await prisma.partInventoryMovement.findMany({ where: { partId }, select: { type: true, quantity: true, totalCostCents: true } });
      return { part, movements };
    };

    it('a part on the work order is taken out of stock once, however the income is recorded', async () => {
      const { dev, order, part } = await jobWithPartUsed();
      const afterUse = await stock(part.id);
      expect(afterUse).toEqual({ part: { quantity: 3, averageCostCents: 800 }, movements: [{ type: 'CONSUME', quantity: 2, totalCostCents: 1600 }] });
      const inventoryValue = (await dashboard()).totals.partsInventoryValueCents;
      expect(inventoryValue).toBe(2400);

      const combinations: Form[] = [{}, { deviceId: dev.id }, { workOrderId: order.id }, { workOrderId: order.id, deviceId: dev.id }];
      for (const tie of combinations) {
        expect(await addIncome({ amount: '50.00', ...tie })).toEqual({ success: true });
        expect(await stock(part.id)).toEqual(afterUse);
      }
      const income = await onlyIncome({ workOrderId: order.id, deviceId: dev.id });
      await editIncome({ id: income.id, amount: '75.00', workOrderId: order.id, deviceId: dev.id });
      await archiveIncome(income.id);
      expect(await stock(part.id)).toEqual(afterUse);

      const totals = (await dashboard()).totals;
      expect(totals.partsInventoryValueCents).toBe(inventoryValue);
      // The part's cost is charged once to the work order and once to the device
      expect((await workOrder(order.id)).summary.partsCostCents).toBe(1600);
      expect((await device(dev.id)).summary.partsConsumed).toBe(1600);
    });

    it('recording income never changes a device status', async () => {
      const { dev, order } = await saleJob(0);
      await getPrisma().device.update({ where: { id: dev.id }, data: { status: 'LISTED' } });
      await addIncome({ amount: '50.00', workOrderId: order.id, deviceId: dev.id });
      expect((await getPrisma().device.findUniqueOrThrow({ where: { id: dev.id } })).status).toBe('LISTED');
    });
  });

  describe('the Sale Builder is gone', () => {
    const root = process.cwd();
    function sourceFiles(dir: string): string[] {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? sourceFiles(full) : [full];
      });
    }

    it('has no endpoint, no table and no model left', async () => {
      expect(fs.existsSync(path.join(root, 'src', 'routes', 'income', 'create-lines'))).toBe(false);
      expect((getPrisma() as any).incomeLine).toBeUndefined();
      const [row] = await getPrisma().$queryRawUnsafe<Array<{ table: string | null; type: string | null }>>(
        `SELECT to_regclass('public."IncomeLine"')::text AS "table", to_regtype('public."IncomeLineType"')::text AS "type"`
      );
      expect(row).toEqual({ table: null, type: null });
    });

    it('no application code reads income lines', () => {
      const files = [...sourceFiles(path.join(root, 'src')), path.join(root, 'prisma', 'schema.prisma'), path.join(root, 'prisma', 'seed.ts')];
      const offenders = files.filter((file) => /IncomeLine|incomeLine|create-lines|create_lines/.test(fs.readFileSync(file, 'utf8')));
      expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
    });
  });
});

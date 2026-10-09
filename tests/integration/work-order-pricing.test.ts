import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { actions as workOrderActions, load as workOrderLoad } from '../../src/routes/work-orders/[id]/+page.server';
import { actions as workOrderListActions } from '../../src/routes/work-orders/+page.server';
import { actions as incomeActions } from '../../src/routes/income/+page.server';
import { POST as createLinesPost } from '../../src/routes/income/create-lines/+server';
import { actions as pricingActions, load as pricingLoad } from '../../src/routes/settings/pricing/+page.server';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { loadDeviceFinancials } from '../../src/lib/server/device-financials';
import { disconnectDb, getPrisma, makeFormRequest, makeJsonRequest, makeLoadEvent, migrationDataStatements, resetAndSeedDb } from './helpers';

// Issue #21: every work order line carries a customer price.

const MIGRATION = '20261009130000_work_order_line_prices';

type Form = Record<string, string>;
const wo = (name: keyof typeof workOrderActions, id: string, form: Form = {}) =>
  (workOrderActions[name] as any)({ request: makeFormRequest(form), params: { id } }) as Promise<any>;
const load = async (id: string) => (await workOrderLoad({ params: { id } } as Parameters<typeof workOrderLoad>[0])) as any;
const dashboard = async () => (await dashboardLoad(makeLoadEvent<Parameters<typeof dashboardLoad>[0]>())) as any;
const setMarkup = (percent: string) => (pricingActions.save as any)({ request: makeFormRequest({ partsMarkup: percent }) }) as Promise<any>;
const addIncome = (form: Form) => (incomeActions.create as any)({ request: makeFormRequest({ date: '2026-03-01', type: 'SERVICE', ...form }) }) as Promise<any>;
const editIncome = (form: Form) => (incomeActions.update as any)({ request: makeFormRequest({ date: '2026-03-01', type: 'SERVICE', ...form }) }) as Promise<any>;
const archiveIncome = (id: string) => (incomeActions.delete as any)({ request: makeFormRequest({ id }) }) as Promise<any>;
const saleBuilder = (payload: Record<string, unknown>) =>
  createLinesPost({ request: makeJsonRequest({ date: '2026-03-01', type: 'SERVICE', ...payload }) } as Parameters<typeof createLinesPost>[0]);
const isFailure = (result: any) => result?.status === 400 && typeof result?.data?.error === 'string';

let seq = 0;
async function newWorkOrder(data: Record<string, unknown> = {}) {
  return getPrisma().workOrder.create({ data: { code: `WO-PRICE-${++seq}`, ...data } as any });
}
async function newPart(name: string, costCents: number, quantity = 20) {
  return getPrisma().part.create({ data: { name, quantity, averageCostCents: costCents } });
}
async function newDevice(sku: string, expenseCents = 0) {
  const prisma = getPrisma();
  const device = await prisma.device.create({ data: { sku, make: 'Sony', model: 'PS5' } });
  if (expenseCents > 0) {
    const category = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });
    await prisma.expense.create({ data: { date: new Date('2026-01-05'), amountCents: expenseCents, subtotalCents: expenseCents, categoryId: category.id, deviceId: device.id } });
  }
  return device;
}
async function addPart(workOrderId: string, partId: string, quantity = 1) {
  const result = await wo('add_item', workOrderId, { type: 'PART', partId, quantity: String(quantity) });
  expect(result).toEqual({ success: true });
  return getPrisma().workOrderItem.findFirstOrThrow({ where: { workOrderId, partId, archivedAt: null }, orderBy: { createdAt: 'desc' } });
}
async function addLabor(workOrderId: string, amount: string, description = 'Labor') {
  expect(await wo('add_item', workOrderId, { type: 'LABOR', description, amount })).toEqual({ success: true });
  return getPrisma().workOrderItem.findFirstOrThrow({ where: { workOrderId, type: 'LABOR', archivedAt: null }, orderBy: { createdAt: 'desc' } });
}
async function addDevice(workOrderId: string, deviceId: string, role = 'PRIMARY') {
  expect(await wo('add_device', workOrderId, { deviceId, role })).toEqual({ success: true });
  return getPrisma().workOrderDevice.findFirstOrThrow({ where: { workOrderId, deviceId, archivedAt: null }, orderBy: { createdAt: 'desc' } });
}
const itemOf = (data: any, id: string) => data.workOrder.items.find((it: any) => it.id === id);
const deviceOf = (data: any, id: string) => data.workOrder.devices.find((d: any) => d.id === id);
const invoiceState = async (id: string) => getPrisma().workOrder.findUniqueOrThrow({ where: { id }, select: { invoicedAt: true, invoicedMarkupBps: true } });

describe('work order line prices', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  describe('parts markup setting', () => {
    it('starts at 30% with nothing saved', async () => {
      expect(await getPrisma().settings.count()).toBe(0);
      expect(((await pricingLoad({} as any)) as any).partsMarkupBps).toBe(3000);
    });

    it('saves a new percentage and keeps a single settings row', async () => {
      expect(await setMarkup('45')).toEqual({ success: true });
      expect(await setMarkup('12.5')).toEqual({ success: true });
      expect(((await pricingLoad({} as any)) as any).partsMarkupBps).toBe(1250);
      expect(await getPrisma().settings.findMany({ select: { id: true, partsMarkupBps: true } })).toEqual([{ id: 1, partsMarkupBps: 1250 }]);
    });

    it('accepts 0% and refuses anything that is not a percentage from 0 to 1000', async () => {
      expect(await setMarkup('0')).toEqual({ success: true });
      expect(((await pricingLoad({} as any)) as any).partsMarkupBps).toBe(0);
      for (const bad of ['', '-5', 'abc', '12.345', '1000.01']) {
        expect(isFailure(await setMarkup(bad))).toBe(true);
      }
      expect(((await pricingLoad({} as any)) as any).partsMarkupBps).toBe(0);
    });
  });

  describe('default price', () => {
    it('is cost plus 30% for one unit and for several', async () => {
      const order = await newWorkOrder();
      const one = await addPart(order.id, (await newPart('Fan', 1500)).id, 1);
      const two = await addPart(order.id, (await newPart('Port', 2000)).id, 2);

      const data = await load(order.id);
      expect(itemOf(data, one.id).partPrice).toEqual({ source: 'default', unitPriceCents: 1950, priceCents: 1950, markupPercent: null, needsManualPrice: false });
      expect(itemOf(data, one.id).priceCents).toBe(1950);
      expect(itemOf(data, two.id).partPrice).toMatchObject({ source: 'default', unitPriceCents: 2600, priceCents: 5200 });
      expect(data.pricing).toMatchObject({ markupBps: 3000, markupSource: 'setting', invoicedAt: null });
      expect(data.summary.invoice.invoiceTotalCents).toBe(7150);
    });

    it('rounds each unit at the half cent, then multiplies by quantity', async () => {
      const order = await newWorkOrder();
      // 15 x 1.3 = 19.5 -> 20 each; three of them are 60, not round(58.5) = 59
      const half = await addPart(order.id, (await newPart('Screw', 15)).id, 3);
      // 8 x 1.3 = 10.4 -> 10 each
      const below = await addPart(order.id, (await newPart('Clip', 8)).id, 7);

      const data = await load(order.id);
      expect(itemOf(data, half.id).partPrice).toMatchObject({ unitPriceCents: 20, priceCents: 60 });
      expect(itemOf(data, below.id).partPrice).toMatchObject({ unitPriceCents: 10, priceCents: 70 });
      expect(data.summary.invoice.invoiceTotalCents).toBe(130);
      expect(data.summary.invoice.totalCostCents).toBe(45 + 56);
    });
  });

  describe('manual price', () => {
    it('is stored per unit and shown with the percentage it works out to', async () => {
      const order = await newWorkOrder();
      const part = await newPart('Screen', 1500);
      const above = await addPart(order.id, part.id, 1);
      const below = await addPart(order.id, part.id, 2);
      const underCost = await addPart(order.id, part.id, 1);

      expect(await wo('set_item_price', order.id, { id: above.id, price: '80.00' })).toEqual({ success: true });
      expect(await wo('set_item_price', order.id, { id: below.id, price: '18' })).toEqual({ success: true });
      expect(await wo('set_item_price', order.id, { id: underCost.id, price: '10.00' })).toEqual({ success: true });

      expect((await getPrisma().workOrderItem.findUniqueOrThrow({ where: { id: above.id } })).manualUnitPriceCents).toBe(8000);
      const data = await load(order.id);
      expect(itemOf(data, above.id).partPrice).toEqual({ source: 'manual', unitPriceCents: 8000, priceCents: 8000, markupPercent: 433, needsManualPrice: false });
      expect(itemOf(data, below.id).partPrice).toMatchObject({ source: 'manual', unitPriceCents: 1800, priceCents: 3600, markupPercent: 20 });
      expect(itemOf(data, underCost.id).partPrice).toMatchObject({ source: 'manual', unitPriceCents: 1000, priceCents: 1000, markupPercent: -33 });
      expect(data.summary.invoice.invoiceTotalCents).toBe(8000 + 3600 + 1000);
      // Cost is untouched by pricing
      expect(data.summary.partsCostCents).toBe(6000);
    });

    it('goes back to the default with "Use default"', async () => {
      const order = await newWorkOrder();
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 2);
      await wo('set_item_price', order.id, { id: item.id, price: '80' });
      expect((await load(order.id)).summary.invoice.invoiceTotalCents).toBe(16000);

      expect(await wo('clear_item_price', order.id, { id: item.id })).toEqual({ success: true });
      expect((await getPrisma().workOrderItem.findUniqueOrThrow({ where: { id: item.id } })).manualUnitPriceCents).toBeNull();
      const data = await load(order.id);
      expect(itemOf(data, item.id).partPrice).toMatchObject({ source: 'default', unitPriceCents: 1950, priceCents: 3900 });
      expect(data.summary.invoice.invoiceTotalCents).toBe(3900);
    });

    it('keeps a typed $0 as a price (a part given away)', async () => {
      const order = await newWorkOrder();
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 1);
      expect(await wo('set_item_price', order.id, { id: item.id, price: '0' })).toEqual({ success: true });
      const data = await load(order.id);
      expect(itemOf(data, item.id).partPrice).toMatchObject({ source: 'manual', priceCents: 0, markupPercent: -100 });
      expect(data.summary.invoice.invoiceTotalCents).toBe(0);
      expect(data.summary.invoice.expectedProfitCents).toBe(-1500);
    });

    it('refuses a price that is not a plain amount, and leaves the line as it was', async () => {
      const order = await newWorkOrder();
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 1);
      await wo('set_item_price', order.id, { id: item.id, price: '25' });
      for (const bad of ['', '-5', 'abc', '1.234', '1e3']) {
        expect(isFailure(await wo('set_item_price', order.id, { id: item.id, price: bad }))).toBe(true);
      }
      expect((await getPrisma().workOrderItem.findUniqueOrThrow({ where: { id: item.id } })).manualUnitPriceCents).toBe(2500);
    });

    it('refuses a line that is on another work order, archived, or a note', async () => {
      const order = await newWorkOrder();
      const other = await newWorkOrder();
      const part = await newPart('Screen', 1500);
      const foreign = await addPart(other.id, part.id, 1);
      const deleted = await addPart(order.id, part.id, 1);
      await wo('delete_item', order.id, { id: deleted.id });
      await wo('add_item', order.id, { type: 'NOTE', description: 'Checked ports' });
      const note = await getPrisma().workOrderItem.findFirstOrThrow({ where: { workOrderId: order.id, type: 'NOTE' } });

      for (const id of [foreign.id, deleted.id, note.id, 'missing']) {
        expect(isFailure(await wo('set_item_price', order.id, { id, price: '10' }))).toBe(true);
        expect(isFailure(await wo('clear_item_price', order.id, { id }))).toBe(true);
      }
      expect((await getPrisma().workOrderItem.findUniqueOrThrow({ where: { id: foreign.id } })).manualUnitPriceCents).toBeNull();
    });
  });

  describe('part with no cost', () => {
    it('defaults to $0 with no percentage and asks for a manual price', async () => {
      const order = await newWorkOrder();
      const free = await addPart(order.id, (await newPart('Harvested fan', 0)).id, 2);
      expect(free.unitCostCentsSnapshot).toBe(0);

      let data = await load(order.id);
      expect(itemOf(data, free.id).partPrice).toEqual({ source: 'default', unitPriceCents: 0, priceCents: 0, markupPercent: null, needsManualPrice: true });
      expect(data.summary.invoice).toMatchObject({ invoiceTotalCents: 0, totalCostCents: 0, expectedProfitCents: 0, unpricedPartLines: 1 });

      expect(await wo('set_item_price', order.id, { id: free.id, price: '25.00' })).toEqual({ success: true });
      data = await load(order.id);
      expect(itemOf(data, free.id).partPrice).toEqual({ source: 'manual', unitPriceCents: 2500, priceCents: 5000, markupPercent: null, needsManualPrice: false });
      expect(data.summary.invoice).toMatchObject({ invoiceTotalCents: 5000, expectedProfitCents: 5000, unpricedPartLines: 0 });
    });

    it('stays at $0 whatever the markup is', async () => {
      const order = await newWorkOrder();
      const free = await addPart(order.id, (await newPart('Harvested fan', 0)).id, 1);
      await setMarkup('900');
      expect(itemOf(await load(order.id), free.id).partPrice).toMatchObject({ priceCents: 0, needsManualPrice: true });
    });
  });

  describe('changing the global percentage', () => {
    it('moves default-priced lines on an open work order and leaves manual ones', async () => {
      const order = await newWorkOrder();
      const part = await newPart('Screen', 1500);
      const byDefault = await addPart(order.id, part.id, 2);
      const manual = await addPart(order.id, part.id, 1);
      await wo('set_item_price', order.id, { id: manual.id, price: '80' });
      expect((await load(order.id)).summary.invoice.invoiceTotalCents).toBe(3900 + 8000);

      await setMarkup('50');
      const data = await load(order.id);
      expect(itemOf(data, byDefault.id).partPrice).toMatchObject({ unitPriceCents: 2250, priceCents: 4500 });
      expect(itemOf(data, manual.id).partPrice).toMatchObject({ unitPriceCents: 8000, priceCents: 8000, markupPercent: 433 });
      expect(data.pricing).toMatchObject({ markupBps: 5000, markupSource: 'setting' });
      expect(data.summary.invoice.invoiceTotalCents).toBe(4500 + 8000);
    });

    it('does not move an invoiced work order at all', async () => {
      const order = await newWorkOrder();
      const part = await newPart('Screen', 1500);
      const byDefault = await addPart(order.id, part.id, 2);
      const manual = await addPart(order.id, part.id, 1);
      await wo('set_item_price', order.id, { id: manual.id, price: '80' });
      await wo('mark_invoiced', order.id);
      const before = await load(order.id);

      await setMarkup('50');
      const after = await load(order.id);
      expect(after.summary).toEqual(before.summary);
      expect(itemOf(after, byDefault.id).partPrice).toMatchObject({ unitPriceCents: 1950, priceCents: 3900 });
      expect(after.pricing).toMatchObject({ markupBps: 3000, markupSource: 'invoice', settingMarkupBps: 5000 });
    });

    it('applies to a new work order', async () => {
      await setMarkup('50');
      const created = await (workOrderListActions.create as any)({ request: makeFormRequest({ targetAction: 'RETURN_TO_CUSTOMER' }) });
      const item = await addPart(created.id, (await newPart('Screen', 1500)).id, 1);
      const data = await load(created.id);
      expect(data.pricing).toMatchObject({ markupBps: 5000, markupSource: 'setting', invoicedAt: null });
      expect(itemOf(data, item.id).partPrice).toMatchObject({ unitPriceCents: 2250 });
    });
  });

  describe('invoiced by the first payment', () => {
    it('a new income on the work order marks it and stores the percentage in force', async () => {
      const order = await newWorkOrder();
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 1);
      expect(await invoiceState(order.id)).toEqual({ invoicedAt: null, invoicedMarkupBps: null });

      await setMarkup('45');
      const startedAt = Date.now();
      expect(await addIncome({ amount: '50.00', workOrderId: order.id })).toEqual({ success: true });

      const state = await invoiceState(order.id);
      expect(state.invoicedMarkupBps).toBe(4500);
      expect(state.invoicedAt!.getTime()).toBeGreaterThanOrEqual(startedAt - 5000);

      await setMarkup('20');
      const data = await load(order.id);
      expect(data.pricing).toMatchObject({ markupBps: 4500, markupSource: 'invoice', settingMarkupBps: 2000 });
      expect(itemOf(data, item.id).partPrice).toMatchObject({ unitPriceCents: 2175 });
    });

    it('an income with no work order marks nothing', async () => {
      const order = await newWorkOrder();
      await addIncome({ amount: '50.00' });
      expect(await invoiceState(order.id)).toEqual({ invoicedAt: null, invoicedMarkupBps: null });
    });

    it('an existing income edited to point at the work order marks it', async () => {
      const order = await newWorkOrder();
      await addIncome({ amount: '50.00' });
      const income = await getPrisma().income.findFirstOrThrow({ where: { amountCents: 5000 } });
      await setMarkup('40');

      expect(await editIncome({ id: income.id, amount: '50.00', workOrderId: order.id })).toEqual({ success: true, id: income.id });
      expect((await invoiceState(order.id)).invoicedMarkupBps).toBe(4000);
      expect((await invoiceState(order.id)).invoicedAt).not.toBeNull();
    });

    it('a $0 income marks it', async () => {
      const order = await newWorkOrder();
      expect(await addIncome({ amount: '0', workOrderId: order.id })).toEqual({ success: true });
      const state = await invoiceState(order.id);
      expect(state.invoicedAt).not.toBeNull();
      expect(state.invoicedMarkupBps).toBe(3000);
      expect((await load(order.id)).summary.invoice.receivedCents).toBe(0);
    });

    it('a Sale Builder sale marks the work order on its head and on each line', async () => {
      const onHead = await newWorkOrder();
      const onLine = await newWorkOrder();
      const untouched = await newWorkOrder();
      await setMarkup('35');

      const response = await saleBuilder({
        workOrderId: onHead.id,
        lines: [
          { type: 'LABOR', amountCents: 5000 },
          { type: 'LABOR', amountCents: 2500, workOrderId: onLine.id }
        ]
      });
      expect(response.status).toBe(200);

      expect((await invoiceState(onHead.id)).invoicedMarkupBps).toBe(3500);
      expect((await invoiceState(onLine.id)).invoicedMarkupBps).toBe(3500);
      expect((await invoiceState(onLine.id)).invoicedAt).not.toBeNull();
      expect(await invoiceState(untouched.id)).toEqual({ invoicedAt: null, invoicedMarkupBps: null });
    });

    it('the Sale Builder form action marks it too', async () => {
      const order = await newWorkOrder();
      const result = await (incomeActions.create_lines as any)({
        request: makeJsonRequest({ date: '2026-03-01', type: 'SERVICE', workOrderId: order.id, lines: [{ type: 'LABOR', amountCents: 5000 }] })
      });
      expect(result.success).toBe(true);
      expect((await invoiceState(order.id)).invoicedMarkupBps).toBe(3000);
    });

    it('a Sale Builder sale that fails marks nothing', async () => {
      const order = await newWorkOrder();
      const part = await newPart('Screen', 1500, 1);
      const response = await saleBuilder({ workOrderId: order.id, lines: [{ type: 'PART', amountCents: 5000, partId: part.id, quantity: 5 }] });
      expect(response.status).toBe(400);
      expect(await invoiceState(order.id)).toEqual({ invoicedAt: null, invoicedMarkupBps: null });
      expect(await getPrisma().income.count({ where: { workOrderId: order.id } })).toBe(0);
    });

    it('second and later payments leave the date and stored percentage alone', async () => {
      const order = await newWorkOrder();
      await addIncome({ amount: '50.00', workOrderId: order.id });
      const first = await invoiceState(order.id);

      await setMarkup('80');
      await addIncome({ amount: '25.00', workOrderId: order.id });
      await saleBuilder({ workOrderId: order.id, lines: [{ type: 'LABOR', amountCents: 1000 }] });
      const other = await getPrisma().income.create({ data: { date: new Date(), type: 'SERVICE', amountCents: 700 } });
      await editIncome({ id: other.id, amount: '7.00', workOrderId: order.id });

      expect(await invoiceState(order.id)).toEqual(first);
      expect(first.invoicedMarkupBps).toBe(3000);
    });

    it('stays invoiced when the payment that triggered it is archived', async () => {
      const order = await newWorkOrder();
      await addIncome({ amount: '50.00', workOrderId: order.id });
      const first = await invoiceState(order.id);
      const income = await getPrisma().income.findFirstOrThrow({ where: { workOrderId: order.id } });

      await archiveIncome(income.id);
      expect(await invoiceState(order.id)).toEqual(first);
      expect((await load(order.id)).summary.invoice.receivedCents).toBe(0);
    });

    it('stays invoiced when the payment moves to another work order, which becomes invoiced', async () => {
      const first = await newWorkOrder();
      const second = await newWorkOrder();
      await addIncome({ amount: '50.00', workOrderId: first.id });
      const firstState = await invoiceState(first.id);
      const income = await getPrisma().income.findFirstOrThrow({ where: { workOrderId: first.id } });

      await setMarkup('60');
      await editIncome({ id: income.id, amount: '50.00', workOrderId: second.id });

      expect(await invoiceState(first.id)).toEqual(firstState);
      expect(firstState.invoicedMarkupBps).toBe(3000);
      const secondState = await invoiceState(second.id);
      expect(secondState.invoicedAt).not.toBeNull();
      expect(secondState.invoicedMarkupBps).toBe(6000);
      expect((await load(first.id)).summary.invoice.receivedCents).toBe(0);
      expect((await load(second.id)).summary.invoice.receivedCents).toBe(5000);
    });

    it('taking the work order off an income marks nothing', async () => {
      const order = await newWorkOrder();
      const income = await getPrisma().income.create({ data: { date: new Date(), type: 'SERVICE', amountCents: 5000, workOrderId: order.id } });
      expect(await editIncome({ id: income.id, amount: '50.00', workOrderId: '' })).toEqual({ success: true, id: income.id });
      expect(await invoiceState(order.id)).toEqual({ invoicedAt: null, invoicedMarkupBps: null });
    });
  });

  describe('mark invoiced by hand', () => {
    it('takes the percentage in force and releases it again on undo', async () => {
      const order = await newWorkOrder();
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 1);
      await setMarkup('40');

      expect(await wo('mark_invoiced', order.id)).toEqual({ success: true });
      expect((await invoiceState(order.id)).invoicedMarkupBps).toBe(4000);
      await setMarkup('10');
      expect(itemOf(await load(order.id), item.id).partPrice.unitPriceCents).toBe(2100);

      expect(await wo('unmark_invoiced', order.id)).toEqual({ success: true });
      expect(await invoiceState(order.id)).toEqual({ invoicedAt: null, invoicedMarkupBps: null });
      const data = await load(order.id);
      expect(data.pricing).toMatchObject({ markupBps: 1000, markupSource: 'setting', invoicedAt: null });
      expect(itemOf(data, item.id).partPrice.unitPriceCents).toBe(1650);
    });

    it('marking twice keeps the first date and percentage', async () => {
      const order = await newWorkOrder();
      await wo('mark_invoiced', order.id);
      const first = await invoiceState(order.id);
      await setMarkup('75');
      expect(await wo('mark_invoiced', order.id)).toEqual({ success: true });
      expect(await invoiceState(order.id)).toEqual(first);
    });

    it('a payment after marking by hand changes nothing', async () => {
      const order = await newWorkOrder();
      await wo('mark_invoiced', order.id);
      const first = await invoiceState(order.id);
      await setMarkup('75');
      await addIncome({ amount: '10.00', workOrderId: order.id });
      expect(await invoiceState(order.id)).toEqual(first);
    });

    it('un-marks a work order that has payments, and a further payment marks it again', async () => {
      const order = await newWorkOrder();
      await addIncome({ amount: '50.00', workOrderId: order.id });
      const income = await getPrisma().income.findFirstOrThrow({ where: { workOrderId: order.id } });

      expect(await wo('unmark_invoiced', order.id)).toEqual({ success: true });
      expect(await invoiceState(order.id)).toEqual({ invoicedAt: null, invoicedMarkupBps: null });

      // Correcting the existing payment is not a further payment
      await setMarkup('55');
      await editIncome({ id: income.id, amount: '55.00', workOrderId: order.id });
      expect(await invoiceState(order.id)).toEqual({ invoicedAt: null, invoicedMarkupBps: null });
      expect((await load(order.id)).summary.invoice.receivedCents).toBe(5500);

      await addIncome({ amount: '20.00', workOrderId: order.id });
      const state = await invoiceState(order.id);
      expect(state.invoicedAt).not.toBeNull();
      expect(state.invoicedMarkupBps).toBe(5500);
    });

    it('keeps manual prices through marking, un-marking and markup changes', async () => {
      const order = await newWorkOrder();
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 1);
      await wo('set_item_price', order.id, { id: item.id, price: '80' });
      await wo('mark_invoiced', order.id);
      await setMarkup('5');
      await wo('unmark_invoiced', order.id);
      await setMarkup('95');
      expect(itemOf(await load(order.id), item.id).partPrice).toMatchObject({ source: 'manual', unitPriceCents: 8000 });
    });

    it('a part added after invoicing uses the stored percentage, not the current one', async () => {
      const order = await newWorkOrder();
      await wo('mark_invoiced', order.id);
      await setMarkup('100');
      const late = await addPart(order.id, (await newPart('Screen', 1500)).id, 2);
      const data = await load(order.id);
      expect(itemOf(data, late.id).partPrice).toMatchObject({ source: 'default', unitPriceCents: 1950, priceCents: 3900 });
      expect(data.summary.invoice.invoiceTotalCents).toBe(3900);
    });

    it('prices can still be typed on an invoiced work order', async () => {
      const order = await newWorkOrder();
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 1);
      await wo('mark_invoiced', order.id);
      expect(await wo('set_item_price', order.id, { id: item.id, price: '30' })).toEqual({ success: true });
      expect((await load(order.id)).summary.invoice.invoiceTotalCents).toBe(3000);
      expect(await wo('clear_item_price', order.id, { id: item.id })).toEqual({ success: true });
      expect((await load(order.id)).summary.invoice.invoiceTotalCents).toBe(1950);
    });
  });

  describe('donor role', () => {
    it('never counts a donor\'s cost, even on its first work order', async () => {
      const order = await newWorkOrder();
      const donor = await newDevice('FZ-TEST-DONOR', 10000);
      const link = await addDevice(order.id, donor.id, 'DONOR');
      expect(link.includeDeviceCost).toBe(false);

      const data = await load(order.id);
      expect(data.summary.deviceExpensesCents).toBe(0);
      expect(data.summary.profitCents).toBe(0);
      expect(deviceOf(data, link.id)).toMatchObject({ role: 'DONOR', includeDeviceCost: false, costCountedOn: null });
    });

    it('refuses to count a donor row with set_device_cost', async () => {
      const order = await newWorkOrder();
      const donor = await newDevice('FZ-TEST-DONOR', 10000);
      const link = await addDevice(order.id, donor.id, 'DONOR');

      expect(isFailure(await wo('set_device_cost', order.id, { id: link.id, include: 'true' }))).toBe(true);
      expect((await getPrisma().workOrderDevice.findUniqueOrThrow({ where: { id: link.id } })).includeDeviceCost).toBe(false);
      expect((await load(order.id)).summary.deviceExpensesCents).toBe(0);
      // Excluding is a no-op and still allowed
      expect(await wo('set_device_cost', order.id, { id: link.id, include: 'false' })).toEqual({ success: true });
    });

    it('still counts on the work order where the same device is primary', async () => {
      const donorJob = await newWorkOrder();
      const ownJob = await newWorkOrder({ targetAction: 'SELL' });
      const device = await newDevice('FZ-TEST-BOTH', 10000);
      const asDonor = await addDevice(donorJob.id, device.id, 'DONOR');
      const asPrimary = await addDevice(ownJob.id, device.id, 'PRIMARY');

      expect(asDonor.includeDeviceCost).toBe(false);
      expect(asPrimary.includeDeviceCost).toBe(true);
      expect((await load(donorJob.id)).summary.deviceExpensesCents).toBe(0);
      expect((await load(ownJob.id)).summary.deviceExpensesCents).toBe(10000);
      expect(deviceOf(await load(donorJob.id), asDonor.id).costCountedOn).toMatchObject({ id: ownJob.id });
    });

    it('leaves the primary work order counted when the device is added elsewhere as a donor afterwards', async () => {
      const ownJob = await newWorkOrder({ targetAction: 'SELL' });
      const donorJob = await newWorkOrder();
      const device = await newDevice('FZ-TEST-BOTH', 10000);
      const asPrimary = await addDevice(ownJob.id, device.id, 'PRIMARY');
      const asDonor = await addDevice(donorJob.id, device.id, 'DONOR');

      expect(asPrimary.includeDeviceCost).toBe(true);
      expect(asDonor.includeDeviceCost).toBe(false);
      expect((await load(ownJob.id)).summary.deviceExpensesCents).toBe(10000);
      expect(isFailure(await wo('set_device_cost', donorJob.id, { id: asDonor.id, include: 'true' }))).toBe(true);
      expect((await load(ownJob.id)).summary.deviceExpensesCents).toBe(10000);
    });

    it('still counts primary and accessory devices as before', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P', 10000)).id, 'PRIMARY');
      const accessory = await addDevice(order.id, (await newDevice('FZ-TEST-A', 2500)).id, 'ACCESSORY');
      expect(primary.includeDeviceCost).toBe(true);
      expect(accessory.includeDeviceCost).toBe(true);
      expect((await load(order.id)).summary.deviceExpensesCents).toBe(12500);
    });

    it('the migration switches existing donor rows that count their cost to not counted', async () => {
      const prisma = getPrisma();
      const order = await newWorkOrder();
      const donor = await newDevice('FZ-TEST-DONOR', 10000);
      const primary = await newDevice('FZ-TEST-P', 4000);
      const donorRow = await prisma.workOrderDevice.create({ data: { workOrderId: order.id, deviceId: donor.id, role: 'DONOR', includeDeviceCost: true } });
      const primaryRow = await prisma.workOrderDevice.create({ data: { workOrderId: order.id, deviceId: primary.id, role: 'PRIMARY', includeDeviceCost: true } });
      await prisma.income.create({ data: { date: new Date(), type: 'SERVICE', amountCents: 20000, workOrderId: order.id } });
      expect((await load(order.id)).summary.profitCents).toBe(20000 - 14000);

      for (const statement of await migrationDataStatements(MIGRATION)) await prisma.$executeRawUnsafe(statement);

      expect((await prisma.workOrderDevice.findUniqueOrThrow({ where: { id: donorRow.id } })).includeDeviceCost).toBe(false);
      expect((await prisma.workOrderDevice.findUniqueOrThrow({ where: { id: primaryRow.id } })).includeDeviceCost).toBe(true);
      const data = await load(order.id);
      expect(data.summary.deviceExpensesCents).toBe(4000);
      expect(data.summary.profitCents).toBe(20000 - 4000);
      // The donor's own net is not affected: it never depended on the work order
      expect((await loadDeviceFinancials([donor.id])).get(donor.id)!.netCents).toBe(-10000);
    });
  });

  describe('device prices', () => {
    it('prices a primary device being sold, an accessory and a donor', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P', 15000)).id, 'PRIMARY');
      const accessory = await addDevice(order.id, (await newDevice('FZ-TEST-A', 2000)).id, 'ACCESSORY');
      const donor = await addDevice(order.id, (await newDevice('FZ-TEST-D', 6000)).id, 'DONOR');

      let data = await load(order.id);
      expect(deviceOf(data, primary.id)).toMatchObject({ priceApplies: true, priceCents: null });
      expect(data.summary.invoice.invoiceTotalCents).toBe(0);

      expect(await wo('set_device_price', order.id, { id: primary.id, price: '400.00' })).toEqual({ success: true });
      expect(await wo('set_device_price', order.id, { id: accessory.id, price: '35.50' })).toEqual({ success: true });
      expect(await wo('set_device_price', order.id, { id: donor.id, price: '20' })).toEqual({ success: true });

      data = await load(order.id);
      expect(deviceOf(data, primary.id).priceCents).toBe(40000);
      expect(deviceOf(data, accessory.id).priceCents).toBe(3550);
      expect(deviceOf(data, donor.id).priceCents).toBe(2000);
      expect(data.summary.invoice).toMatchObject({
        devicesPriceCents: 45550,
        invoiceTotalCents: 45550,
        // The donor's cost is not on the work order
        totalCostCents: 17000,
        expectedProfitCents: 28550
      });
    });

    it('clears a device price with an empty value', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P')).id, 'PRIMARY');
      await wo('set_device_price', order.id, { id: primary.id, price: '400' });
      expect(await wo('set_device_price', order.id, { id: primary.id, price: '' })).toEqual({ success: true });
      expect((await getPrisma().workOrderDevice.findUniqueOrThrow({ where: { id: primary.id } })).priceCents).toBeNull();
      expect((await load(order.id)).summary.invoice.invoiceTotalCents).toBe(0);
    });

    it('has no price for the customer\'s own device being returned', async () => {
      const order = await newWorkOrder({ targetAction: 'RETURN_TO_CUSTOMER' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P')).id, 'PRIMARY');
      const accessory = await addDevice(order.id, (await newDevice('FZ-TEST-A')).id, 'ACCESSORY');

      expect(isFailure(await wo('set_device_price', order.id, { id: primary.id, price: '400' }))).toBe(true);
      expect(await wo('set_device_price', order.id, { id: accessory.id, price: '15' })).toEqual({ success: true });

      const data = await load(order.id);
      expect(deviceOf(data, primary.id)).toMatchObject({ priceApplies: false, priceCents: null });
      expect(deviceOf(data, accessory.id)).toMatchObject({ priceApplies: true, priceCents: 1500 });
      expect(data.summary.invoice.invoiceTotalCents).toBe(1500);
    });

    it('drops a sale price from the total when the work order is switched to return to customer, and brings it back', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P')).id, 'PRIMARY');
      await wo('set_device_price', order.id, { id: primary.id, price: '400' });
      await addLabor(order.id, '50');

      await wo('update_header', order.id, { targetAction: 'RETURN_TO_CUSTOMER' });
      let data = await load(order.id);
      expect(deviceOf(data, primary.id)).toMatchObject({ priceApplies: false, priceCents: null });
      expect(data.summary.invoice.invoiceTotalCents).toBe(5000);

      await wo('update_header', order.id, { targetAction: 'SELL' });
      data = await load(order.id);
      expect(deviceOf(data, primary.id)).toMatchObject({ priceApplies: true, priceCents: 40000 });
      expect(data.summary.invoice.invoiceTotalCents).toBe(45000);
    });

    it('refuses a bad price or a device row from another work order', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const other = await newWorkOrder({ targetAction: 'SELL' });
      const mine = await addDevice(order.id, (await newDevice('FZ-TEST-P')).id, 'PRIMARY');
      const foreign = await addDevice(other.id, (await newDevice('FZ-TEST-Q')).id, 'PRIMARY');
      for (const bad of ['-1', 'abc', '1.999']) {
        expect(isFailure(await wo('set_device_price', order.id, { id: mine.id, price: bad }))).toBe(true);
      }
      expect(isFailure(await wo('set_device_price', order.id, { id: foreign.id, price: '10' }))).toBe(true);
      expect((await getPrisma().workOrderDevice.findUniqueOrThrow({ where: { id: foreign.id } })).priceCents).toBeNull();
    });

    it('a device price does not change which work order carries the device cost', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P', 15000)).id, 'PRIMARY');
      const before = (await load(order.id)).summary;
      await wo('set_device_price', order.id, { id: primary.id, price: '400' });
      const after = (await load(order.id)).summary;
      expect(after.deviceExpensesCents).toBe(before.deviceExpensesCents);
      expect(after.profitCents).toBe(before.profitCents);
    });
  });

  describe('labor price', () => {
    it('is the labor amount, and can be changed inline', async () => {
      const order = await newWorkOrder();
      const labor = await addLabor(order.id, '80.00');
      let data = await load(order.id);
      expect(itemOf(data, labor.id)).toMatchObject({ priceCents: 8000, partPrice: null });

      expect(await wo('set_item_price', order.id, { id: labor.id, price: '95.50' })).toEqual({ success: true });
      const row = await getPrisma().workOrderItem.findUniqueOrThrow({ where: { id: labor.id } });
      expect(row.amountCents).toBe(9550);
      expect(row.manualUnitPriceCents).toBeNull();
      data = await load(order.id);
      expect(data.summary.laborPlannedCents).toBe(9550);
      expect(data.summary.invoice.invoiceTotalCents).toBe(9550);
      // Labor has no default to go back to
      expect(isFailure(await wo('clear_item_price', order.id, { id: labor.id }))).toBe(true);
    });
  });

  describe('summary figures', () => {
    const invoiceOf = async (id: string) => (await load(id)).summary.invoice;

    it('is all zero with no lines', async () => {
      const order = await newWorkOrder();
      expect(await invoiceOf(order.id)).toEqual({
        partsPriceCents: 0,
        laborPriceCents: 0,
        devicesPriceCents: 0,
        invoiceTotalCents: 0,
        totalCostCents: 0,
        expectedProfitCents: 0,
        receivedCents: 0,
        balanceDueCents: 0,
        unpricedPartLines: 0
      });
    });

    it('parts only', async () => {
      const order = await newWorkOrder();
      await addPart(order.id, (await newPart('Screen', 1500)).id, 2);
      expect(await invoiceOf(order.id)).toMatchObject({ partsPriceCents: 3900, invoiceTotalCents: 3900, totalCostCents: 3000, expectedProfitCents: 900, receivedCents: 0, balanceDueCents: 3900 });
    });

    it('labor only', async () => {
      const order = await newWorkOrder();
      await addLabor(order.id, '80');
      await addLabor(order.id, '20.50');
      expect(await invoiceOf(order.id)).toMatchObject({ laborPriceCents: 10050, invoiceTotalCents: 10050, totalCostCents: 0, expectedProfitCents: 10050, balanceDueCents: 10050 });
    });

    it('devices only', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P', 15000)).id, 'PRIMARY');
      await wo('set_device_price', order.id, { id: primary.id, price: '400' });
      expect(await invoiceOf(order.id)).toMatchObject({ devicesPriceCents: 40000, invoiceTotalCents: 40000, totalCostCents: 15000, expectedProfitCents: 25000, balanceDueCents: 40000 });
    });

    it('a mix of parts, labor, devices and a note', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P', 15000)).id, 'PRIMARY');
      const accessory = await addDevice(order.id, (await newDevice('FZ-TEST-A', 2000)).id, 'ACCESSORY');
      await wo('set_device_price', order.id, { id: primary.id, price: '400' });
      await wo('set_device_price', order.id, { id: accessory.id, price: '30' });
      await addPart(order.id, (await newPart('Screen', 1500)).id, 2); // 3900 at default
      const manual = await addPart(order.id, (await newPart('Port', 700)).id, 1);
      await wo('set_item_price', order.id, { id: manual.id, price: '25' });
      await addPart(order.id, (await newPart('Free fan', 0)).id, 1); // $0, needs a price
      await addLabor(order.id, '60');
      // A note is never charged, even if an amount is posted with it
      await wo('add_item', order.id, { type: 'NOTE', description: 'Cleaned', amount: '99' });

      const data = await load(order.id);
      expect(data.summary.invoice).toEqual({
        partsPriceCents: 3900 + 2500,
        laborPriceCents: 6000,
        devicesPriceCents: 43000,
        invoiceTotalCents: 55400,
        totalCostCents: 3000 + 700 + 15000 + 2000,
        expectedProfitCents: 55400 - 20700,
        receivedCents: 0,
        balanceDueCents: 55400,
        unpricedPartLines: 1
      });
      // The parts of the total add up to it
      const { partsPriceCents, laborPriceCents, devicesPriceCents, invoiceTotalCents } = data.summary.invoice;
      expect(partsPriceCents + laborPriceCents + devicesPriceCents).toBe(invoiceTotalCents);
      const lineSum =
        data.workOrder.items.reduce((s: number, it: any) => s + (it.priceCents || 0), 0) +
        data.workOrder.devices.reduce((s: number, d: any) => s + (d.priceCents || 0), 0);
      expect(lineSum).toBe(invoiceTotalCents);
      // Profit so far is still income minus cost, with no income yet
      expect(data.summary.profitCents).toBe(-20700);
    });

    it('leaves out an archived line', async () => {
      const order = await newWorkOrder();
      const kept = await addLabor(order.id, '80', 'Kept');
      const dropped = await addLabor(order.id, '45', 'Dropped');
      expect((await invoiceOf(order.id)).invoiceTotalCents).toBe(12500);
      await wo('delete_item', order.id, { id: dropped.id });
      const data = await load(order.id);
      expect(data.summary.invoice.invoiceTotalCents).toBe(8000);
      expect(data.workOrder.items.map((it: any) => it.id)).toEqual([kept.id]);
    });

    it('drops price and cost when a part line is deleted, and returns the stock', async () => {
      const order = await newWorkOrder();
      const part = await newPart('Screen', 1500, 5);
      const item = await addPart(order.id, part.id, 2);
      await wo('set_item_price', order.id, { id: item.id, price: '40' });
      await addLabor(order.id, '10');
      expect(await invoiceOf(order.id)).toMatchObject({ invoiceTotalCents: 9000, totalCostCents: 3000 });

      await wo('delete_item', order.id, { id: item.id });
      expect(await invoiceOf(order.id)).toMatchObject({ partsPriceCents: 0, invoiceTotalCents: 1000, totalCostCents: 0, expectedProfitCents: 1000 });
      expect((await getPrisma().part.findUniqueOrThrow({ where: { id: part.id } })).quantity).toBe(5);
    });

    it('drops a device price when the device is removed', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P', 15000)).id, 'PRIMARY');
      await wo('set_device_price', order.id, { id: primary.id, price: '400' });
      await wo('remove_device', order.id, { id: primary.id });
      expect(await invoiceOf(order.id)).toMatchObject({ devicesPriceCents: 0, invoiceTotalCents: 0, totalCostCents: 0 });
    });

    it('adds up several payments and leaves out an archived one', async () => {
      const order = await newWorkOrder();
      await addLabor(order.id, '100');
      await addIncome({ amount: '30.00', workOrderId: order.id });
      await addIncome({ amount: '45.00', workOrderId: order.id });
      await addIncome({ amount: '10.00', workOrderId: order.id });
      expect(await invoiceOf(order.id)).toMatchObject({ invoiceTotalCents: 10000, receivedCents: 8500, balanceDueCents: 1500 });

      const smallest = await getPrisma().income.findFirstOrThrow({ where: { workOrderId: order.id, amountCents: 1000 } });
      await archiveIncome(smallest.id);
      expect(await invoiceOf(order.id)).toMatchObject({ receivedCents: 7500, balanceDueCents: 2500 });
    });

    it('shows a balance due when paid below the total, none when paid exactly, and a negative one when overpaid', async () => {
      const order = await newWorkOrder();
      await addLabor(order.id, '100');
      await addIncome({ amount: '60.00', workOrderId: order.id });
      expect(await invoiceOf(order.id)).toMatchObject({ receivedCents: 6000, balanceDueCents: 4000 });
      await addIncome({ amount: '40.00', workOrderId: order.id });
      expect(await invoiceOf(order.id)).toMatchObject({ receivedCents: 10000, balanceDueCents: 0 });
      await addIncome({ amount: '12.34', workOrderId: order.id });
      expect(await invoiceOf(order.id)).toMatchObject({ receivedCents: 11234, balanceDueCents: -1234 });
    });

    it('counts what the customer paid, before fees, shipping and tax', async () => {
      const order = await newWorkOrder();
      await addLabor(order.id, '100');
      await addIncome({ amount: '100.00', workOrderId: order.id, platformFees: '10', paymentFees: '3', shippingRevenue: '8', shippingCost: '6', taxCollected: '7' });
      const data = await load(order.id);
      expect(data.summary.invoice).toMatchObject({ receivedCents: 10000, balanceDueCents: 0, expectedProfitCents: 10000 });
      // Actual profit keeps its own definition: net of fees and shipping
      expect(data.summary.income.netRevenueCents).toBe(10000 + 800 - 1000 - 300 - 600);
      expect(data.summary.profitCents).toBe(8900);
    });

    it('counts Sale Builder lines and plain incomes together as received', async () => {
      const order = await newWorkOrder();
      const elsewhere = await newWorkOrder();
      await addLabor(order.id, '100');
      await addIncome({ amount: '20.00', workOrderId: order.id });
      // Head on this work order: one line stays here, one is pointed at another work order
      await saleBuilder({
        workOrderId: order.id,
        lines: [
          { type: 'LABOR', amountCents: 5000 },
          { type: 'LABOR', amountCents: 700, workOrderId: elsewhere.id }
        ]
      });
      expect(await invoiceOf(order.id)).toMatchObject({ receivedCents: 7000, balanceDueCents: 3000 });
      expect(await invoiceOf(elsewhere.id)).toMatchObject({ receivedCents: 700, balanceDueCents: -700 });

      // An archived Sale Builder sale drops out through its head
      const sale = await getPrisma().income.findFirstOrThrow({ where: { amountCents: 5700 } });
      await archiveIncome(sale.id);
      expect(await invoiceOf(order.id)).toMatchObject({ receivedCents: 2000 });
      expect(await invoiceOf(elsewhere.id)).toMatchObject({ receivedCents: 0 });
    });

    it('does not let prices change profit, parts cost or device expenses', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P', 15000)).id, 'PRIMARY');
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 2);
      await getPrisma().income.create({ data: { date: new Date(), type: 'SALE', amountCents: 30000, platformFeesCents: 900, workOrderId: order.id } });
      const pick = (s: any) => ({ profitCents: s.profitCents, partsCostCents: s.partsCostCents, deviceExpensesCents: s.deviceExpensesCents, income: s.income });
      const before = pick((await load(order.id)).summary);
      expect(before.profitCents).toBe(30000 - 900 - 3000 - 15000);

      await wo('set_item_price', order.id, { id: item.id, price: '99' });
      await wo('set_device_price', order.id, { id: primary.id, price: '400' });
      await setMarkup('75');
      await wo('mark_invoiced', order.id);
      expect(pick((await load(order.id)).summary)).toEqual(before);
      await wo('clear_item_price', order.id, { id: item.id });
      await wo('unmark_invoiced', order.id);
      expect(pick((await load(order.id)).summary)).toEqual(before);
    });
  });

  describe('work orders that existed before prices', () => {
    async function legacyOrders() {
      const prisma = getPrisma();
      const part = await newPart('Screen', 1500);
      const make = async (data: Record<string, unknown>) => {
        const order = await newWorkOrder(data);
        await prisma.workOrderItem.create({ data: { workOrderId: order.id, type: 'PART', partId: part.id, quantity: 2, unitCostCentsSnapshot: 1500 } });
        await prisma.workOrderItem.create({ data: { workOrderId: order.id, type: 'LABOR', description: 'Repair', amountCents: 8000 } });
        return order;
      };
      const delivered = await make({ status: 'DELIVERED' });
      const cancelled = await make({ status: 'CANCELLED' });
      const paid = await make({ status: 'IN_PROGRESS' });
      await prisma.income.create({ data: { date: new Date(), type: 'SERVICE', amountCents: 5000, workOrderId: paid.id } });
      const paidByLine = await make({ status: 'OPEN' });
      const head = await prisma.income.create({ data: { date: new Date(), type: 'SERVICE', amountCents: 2000 } });
      await prisma.incomeLine.create({ data: { incomeId: head.id, type: 'LABOR', amountCents: 2000, workOrderId: paidByLine.id } });
      const archivedPayment = await make({ status: 'OPEN' });
      await prisma.income.create({ data: { date: new Date(), type: 'SERVICE', amountCents: 5000, workOrderId: archivedPayment.id, archivedAt: new Date() } });
      const open = await make({ status: 'READY' });
      return { delivered, cancelled, paid, paidByLine, archivedPayment, open };
    }
    const runMigration = async () => {
      for (const statement of await migrationDataStatements(MIGRATION)) await getPrisma().$executeRawUnsafe(statement);
    };

    it('finished or paid work orders become invoiced with their parts left unpriced', async () => {
      const orders = await legacyOrders();
      await runMigration();

      for (const order of [orders.delivered, orders.cancelled, orders.paid, orders.paidByLine]) {
        const state = await invoiceState(order.id);
        expect(state.invoicedAt).not.toBeNull();
        expect(state.invoicedMarkupBps).toBeNull();
        const data = await load(order.id);
        expect(data.pricing).toMatchObject({ markupBps: null, markupSource: 'unpriced' });
        const partItem = data.workOrder.items.find((it: any) => it.type === 'PART');
        expect(partItem.partPrice).toEqual({ source: 'unpriced', unitPriceCents: null, priceCents: null, markupPercent: null, needsManualPrice: false });
        expect(partItem.priceCents).toBeNull();
        // Only what was already typed in (labor) is on the invoice
        expect(data.summary.invoice).toMatchObject({ partsPriceCents: 0, laborPriceCents: 8000, invoiceTotalCents: 8000, totalCostCents: 3000, unpricedPartLines: 1 });
      }
    });

    it('open work orders without a live payment are not invoiced and get the default markup', async () => {
      const orders = await legacyOrders();
      await runMigration();
      for (const order of [orders.open, orders.archivedPayment]) {
        expect(await invoiceState(order.id)).toEqual({ invoicedAt: null, invoicedMarkupBps: null });
        expect((await load(order.id)).summary.invoice).toMatchObject({ partsPriceCents: 3900, invoiceTotalCents: 11900 });
      }
    });

    it('profit and cost are the same before and after the migration', async () => {
      const orders = await legacyOrders();
      const pick = (s: any) => ({ profitCents: s.profitCents, partsCostCents: s.partsCostCents, deviceExpensesCents: s.deviceExpensesCents, laborPlannedCents: s.laborPlannedCents, income: s.income });
      const before = new Map<string, unknown>();
      for (const order of Object.values(orders)) before.set(order.id, pick((await load(order.id)).summary));
      await runMigration();
      for (const order of Object.values(orders)) expect(pick((await load(order.id)).summary)).toEqual(before.get(order.id));
    });

    it('is not moved by a markup change, and running the migration again changes nothing', async () => {
      const orders = await legacyOrders();
      await runMigration();
      const state = await invoiceState(orders.delivered.id);
      const before = (await load(orders.delivered.id)).summary;
      await setMarkup('90');
      await wo('mark_invoiced', orders.delivered.id);
      await runMigration();
      expect(await invoiceState(orders.delivered.id)).toEqual(state);
      expect((await load(orders.delivered.id)).summary).toEqual(before);
    });

    it('a part on such a work order can be given a manual price', async () => {
      const orders = await legacyOrders();
      await runMigration();
      const partItem = await getPrisma().workOrderItem.findFirstOrThrow({ where: { workOrderId: orders.delivered.id, type: 'PART' } });
      expect(await wo('set_item_price', orders.delivered.id, { id: partItem.id, price: '40' })).toEqual({ success: true });
      const data = await load(orders.delivered.id);
      expect(itemOf(data, partItem.id).partPrice).toMatchObject({ source: 'manual', priceCents: 8000, markupPercent: 167 });
      expect(data.summary.invoice).toMatchObject({ partsPriceCents: 8000, invoiceTotalCents: 16000, unpricedPartLines: 0 });
    });

    it('un-marking one puts its parts on the current percentage', async () => {
      const orders = await legacyOrders();
      await runMigration();
      await setMarkup('50');
      await wo('unmark_invoiced', orders.delivered.id);
      const data = await load(orders.delivered.id);
      expect(data.pricing).toMatchObject({ markupBps: 5000, markupSource: 'setting', invoicedAt: null });
      expect(data.summary.invoice).toMatchObject({ partsPriceCents: 4500, invoiceTotalCents: 12500 });
    });
  });

  describe('figures that must not move', () => {
    it('dashboard spending power and the 30 day figures are unchanged by prices, markup and invoicing', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const primary = await addDevice(order.id, (await newDevice('FZ-TEST-P', 15000)).id, 'PRIMARY');
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 2);
      const labor = await addLabor(order.id, '80');
      await getPrisma().income.create({ data: { date: new Date(), type: 'SALE', amountCents: 30000, platformFeesCents: 900, workOrderId: order.id } });

      const before = await dashboard();
      expect(before.totals.spendingPowerCents).toBe(13700 + 30000 - 900 - 15000);

      const steps: Array<() => Promise<unknown>> = [
        () => wo('set_item_price', order.id, { id: item.id, price: '99.99' }),
        () => wo('set_item_price', order.id, { id: labor.id, price: '120' }),
        () => wo('set_device_price', order.id, { id: primary.id, price: '400' }),
        () => setMarkup('75'),
        () => wo('mark_invoiced', order.id),
        () => setMarkup('5'),
        () => wo('clear_item_price', order.id, { id: item.id }),
        () => wo('set_device_price', order.id, { id: primary.id, price: '' }),
        () => wo('unmark_invoiced', order.id)
      ];
      for (const step of steps) {
        await step();
        const after = await dashboard();
        expect(after.totals).toEqual(before.totals);
        expect(after.last30).toEqual(before.last30);
      }
    });

    it('a payment marking the work order invoiced moves spending power by the payment only', async () => {
      const order = await newWorkOrder();
      await addPart(order.id, (await newPart('Screen', 1500)).id, 2);
      const before = await dashboard();
      await addIncome({ amount: '50.00', workOrderId: order.id, paymentFees: '2.00' });
      const after = await dashboard();
      expect((await invoiceState(order.id)).invoicedAt).not.toBeNull();
      expect(after.totals.spendingPowerCents - before.totals.spendingPowerCents).toBe(4800);
      expect(after.last30.partsConsumedCents).toBe(before.last30.partsConsumedCents);
    });

    it('device net is unchanged by prices, markup and invoicing', async () => {
      const order = await newWorkOrder({ targetAction: 'SELL' });
      const device = await newDevice('FZ-TEST-P', 15000);
      const primary = await addDevice(order.id, device.id, 'PRIMARY');
      const item = await addPart(order.id, (await newPart('Screen', 1500)).id, 2);
      await getPrisma().income.create({ data: { date: new Date(), type: 'SALE', amountCents: 30000, deviceId: device.id, workOrderId: order.id } });
      const before = (await loadDeviceFinancials([device.id])).get(device.id);
      expect(before!.netCents).toBe(30000 - 15000 - 3000);

      await wo('set_item_price', order.id, { id: item.id, price: '99.99' });
      await wo('set_device_price', order.id, { id: primary.id, price: '400' });
      await setMarkup('75');
      await wo('mark_invoiced', order.id);
      expect((await loadDeviceFinancials([device.id])).get(device.id)).toEqual(before);
    });
  });
});

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { actions as expenseActions, load as expenseLoad } from '../../src/routes/expenses/+page.server';
import { POST as splitPost } from '../../src/routes/expenses/split/+server';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { disconnectDb, getPrisma, makeFormRequest, makeJsonRequest, makeLoadEvent, resetAndSeedDb } from './helpers';

type CreateEvent = Parameters<typeof expenseActions.create>[0];
type UpdateEvent = Parameters<typeof expenseActions.update>[0];
type DeleteEvent = Parameters<typeof expenseActions.delete>[0];
type SplitEvent = Parameters<typeof splitPost>[0];

async function loadDashboard() {
  return (await dashboardLoad(makeLoadEvent<Parameters<typeof dashboardLoad>[0]>())) as any;
}

async function loadExpenses(query = '') {
  return (await expenseLoad(makeLoadEvent<Parameters<typeof expenseLoad>[0]>(`http://localhost/expenses${query}`))) as any;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function partsCategoryId() {
  const category = await getPrisma().category.findFirstOrThrow({ where: { kind: 'expense', name: 'Parts' }, select: { id: true } });
  return category.id;
}

describe('expense ledger actions', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  describe('create', () => {
    it('stores the amount as cents with subtotal = amount and lowers spending power', async () => {
      const prisma = getPrisma();
      const categoryId = await partsCategoryId();
      const vendor = await prisma.vendor.findFirstOrThrow({ where: { name: 'Amazon' }, select: { id: true } });
      const paymentMethod = await prisma.paymentMethod.findFirstOrThrow({ where: { name: 'Credit Card' }, select: { id: true } });
      const device = await prisma.device.findFirstOrThrow({ select: { id: true } });

      const request = makeFormRequest({
        date: todayStr(),
        amount: '45.55',
        categoryId,
        vendorId: vendor.id,
        paymentMethodId: paymentMethod.id,
        deviceId: device.id,
        notes: 'Replacement screen',
        vendorOrderNumber: '  113-555  '
      });
      const result = await expenseActions.create({ request } as CreateEvent);
      expect(result).toEqual({ success: true });

      const row = await prisma.expense.findFirstOrThrow({ where: { notes: 'Replacement screen' } });
      expect(row).toMatchObject({
        amountCents: 4555,
        subtotalCents: 4555,
        taxCents: 0,
        shippingCents: 0,
        otherFeesCents: 0,
        categoryId,
        vendorId: vendor.id,
        paymentMethodId: paymentMethod.id,
        deviceId: device.id,
        vendorOrderNumber: '113-555',
        splitGroupId: null,
        archivedAt: null
      });

      const data = await loadDashboard();
      expect(data.totals.moneyOutCents).toBe(15000 + 4555);
      expect(data.totals.expensesCents).toBe(15000 + 4555);
      expect(data.totals.spendingPowerCents).toBe(13700 - 4555);
      expect(data.last30.spendingPowerCents).toBe(13700 - 4555);
    });

    it('stores the local calendar date and nulls blank optional fields', async () => {
      const prisma = getPrisma();
      const request = makeFormRequest({
        date: '2026-01-15',
        amount: '10',
        categoryId: await partsCategoryId(),
        vendorId: '',
        paymentMethodId: '',
        deviceId: '',
        notes: '',
        vendorOrderNumber: ''
      });
      await expenseActions.create({ request } as CreateEvent);

      const row = await prisma.expense.findFirstOrThrow({ where: { amountCents: 1000 } });
      expect(row.date.getTime()).toBe(new Date(2026, 0, 15).getTime());
      expect(row.vendorId).toBeNull();
      expect(row.paymentMethodId).toBeNull();
      expect(row.deviceId).toBeNull();
      expect(row.notes).toBeNull();
      expect(row.vendorOrderNumber).toBeNull();
    });
  });

  describe('update', () => {
    it('changes the amount and the dashboard follows', async () => {
      const prisma = getPrisma();
      const fixture = await prisma.expense.findFirstOrThrow({ where: { notes: 'Fixture expense' } });

      const request = makeFormRequest({
        id: fixture.id,
        date: todayStr(),
        amount: '100.25',
        categoryId: fixture.categoryId,
        notes: 'Edited expense'
      });
      const result = await expenseActions.update({ request } as UpdateEvent);
      expect(result).toEqual({ success: true, id: fixture.id });

      const row = await prisma.expense.findUniqueOrThrow({ where: { id: fixture.id } });
      expect(row.amountCents).toBe(10025);
      expect(row.notes).toBe('Edited expense');

      const data = await loadDashboard();
      expect(data.totals.moneyOutCents).toBe(10025);
      expect(data.totals.spendingPowerCents).toBe(28700 - 10025);
    });

    it('keeps subtotal in step with the amount on a plain expense', async () => {
      const prisma = getPrisma();
      const fixture = await prisma.expense.findFirstOrThrow({ where: { notes: 'Fixture expense' } });

      await expenseActions.update({
        request: makeFormRequest({ id: fixture.id, date: todayStr(), amount: '100.25', categoryId: fixture.categoryId })
      } as UpdateEvent);

      const row = await prisma.expense.findUniqueOrThrow({ where: { id: fixture.id } });
      expect(row.amountCents).toBe(10025);
      expect(row.subtotalCents).toBe(10025);
    });

    it('preserves amount = subtotal + tax + shipping + fees when editing a split-receipt line', async () => {
      const prisma = getPrisma();
      const categoryId = await partsCategoryId();
      const line = await prisma.expense.create({
        data: {
          date: new Date(),
          amountCents: 1130,
          subtotalCents: 1000,
          taxCents: 80,
          shippingCents: 40,
          otherFeesCents: 10,
          splitGroupId: 'group-1',
          allocationMethod: 'MANUAL',
          categoryId
        }
      });

      const result = await expenseActions.update({
        request: makeFormRequest({ id: line.id, date: todayStr(), amount: '21.30', categoryId })
      } as UpdateEvent);
      expect(result).toEqual({ success: true, id: line.id });

      const row = await prisma.expense.findUniqueOrThrow({ where: { id: line.id } });
      expect(row).toMatchObject({ amountCents: 2130, subtotalCents: 2000, taxCents: 80, shippingCents: 40, otherFeesCents: 10 });
    });

    it('rejects an amount smaller than the line\'s allocated tax, shipping and fees', async () => {
      const prisma = getPrisma();
      const categoryId = await partsCategoryId();
      const line = await prisma.expense.create({
        data: { date: new Date(), amountCents: 1130, subtotalCents: 1000, taxCents: 80, shippingCents: 40, otherFeesCents: 10, splitGroupId: 'group-1', allocationMethod: 'MANUAL', categoryId }
      });

      const result = await expenseActions.update({
        request: makeFormRequest({ id: line.id, date: todayStr(), amount: '1.00', categoryId })
      } as UpdateEvent);
      expect(result).toEqual({ success: false, error: 'Amount cannot be less than allocated tax, shipping and fees' });

      const row = await prisma.expense.findUniqueOrThrow({ where: { id: line.id } });
      expect(row).toMatchObject({ amountCents: 1130, subtotalCents: 1000 });
    });

    it('rejects a missing id without touching the ledger', async () => {
      const result = await expenseActions.update({ request: makeFormRequest({ amount: '1.00' }) } as UpdateEvent);
      expect(result).toEqual({ success: false, error: 'Missing id' });

      const data = await loadDashboard();
      expect(data.totals.moneyOutCents).toBe(15000);
    });
  });

  describe('delete', () => {
    it('archives instead of deleting and removes the row from totals and the list', async () => {
      const prisma = getPrisma();
      const fixture = await prisma.expense.findFirstOrThrow({ where: { notes: 'Fixture expense' } });

      const result = await expenseActions.delete({ request: makeFormRequest({ id: fixture.id }) } as DeleteEvent);
      expect(result).toEqual({ success: true, id: fixture.id });

      const row = await prisma.expense.findUniqueOrThrow({ where: { id: fixture.id } });
      expect(row.archivedAt).not.toBeNull();

      const data = await loadDashboard();
      expect(data.totals.moneyOutCents).toBe(0);
      expect(data.totals.spendingPowerCents).toBe(28700);

      const list = await loadExpenses();
      expect(list.expenses).toHaveLength(0);
    });
  });

  describe('load', () => {
    it('filters by from/to and hides archived rows', async () => {
      const prisma = getPrisma();
      await prisma.expense.deleteMany();
      const base = { amountCents: 1000, subtotalCents: 1000, categoryId: await partsCategoryId() };
      await prisma.expense.create({ data: { ...base, date: new Date(2026, 0, 10, 12), notes: 'before' } });
      await prisma.expense.create({ data: { ...base, date: new Date(2026, 0, 20, 12), notes: 'inside' } });
      await prisma.expense.create({ data: { ...base, date: new Date(2026, 0, 21, 12), notes: 'inside-archived', archivedAt: new Date() } });
      await prisma.expense.create({ data: { ...base, date: new Date(2026, 1, 5, 12), notes: 'after' } });

      const all = await loadExpenses();
      expect(all.expenses.map((e: any) => e.notes)).toEqual(['after', 'inside', 'before']);

      const filtered = await loadExpenses('?from=2026-01-15&to=2026-01-31');
      expect(filtered.expenses.map((e: any) => e.notes)).toEqual(['inside']);
      expect(filtered.filters).toEqual({ from: '2026-01-15', to: '2026-01-31' });

      const toOnly = await loadExpenses('?to=2026-01-31');
      expect(toOnly.expenses.map((e: any) => e.notes)).toEqual(['inside', 'before']);
    });
  });
});

describe('split receipt effect on the ledger', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  async function postSplit(payload: unknown) {
    return splitPost({ request: makeJsonRequest(payload) } as SplitEvent);
  }

  it('EVEN allocation spreads remainders to the first lines and money out rises by the exact receipt total', async () => {
    const prisma = getPrisma();
    const categoryId = await partsCategoryId();

    const response = await postSplit({
      date: todayStr(),
      allocationMethod: 'EVEN',
      vendorOrderNumber: 'ORD-9',
      totals: { totalTaxCents: 100, totalShippingCents: 50, totalOtherFeesCents: 1 },
      lines: [
        { categoryId, subtotalCents: 1000, notes: 'A' },
        { categoryId, subtotalCents: 2000, notes: 'B' },
        { categoryId, subtotalCents: 3000, notes: 'C' }
      ]
    });
    expect(response.status).toBe(200);
    const { splitGroupId } = (await response.json()) as { splitGroupId: string };

    const rows = await prisma.expense.findMany({ where: { splitGroupId } });
    const byNote = Object.fromEntries(rows.map((r) => [r.notes, r]));
    expect(byNote.A).toMatchObject({ subtotalCents: 1000, taxCents: 34, shippingCents: 17, otherFeesCents: 1, amountCents: 1052 });
    expect(byNote.B).toMatchObject({ subtotalCents: 2000, taxCents: 33, shippingCents: 17, otherFeesCents: 0, amountCents: 2050 });
    expect(byNote.C).toMatchObject({ subtotalCents: 3000, taxCents: 33, shippingCents: 16, otherFeesCents: 0, amountCents: 3049 });
    for (const row of rows) {
      expect(row.allocationMethod).toBe('EVEN');
      expect(row.vendorOrderNumber).toBe('ORD-9');
    }

    const data = await loadDashboard();
    expect(data.totals.moneyOutCents).toBe(15000 + 6000 + 151);
    expect(data.totals.spendingPowerCents).toBe(13700 - 6151);
  });

  it('PROPORTIONAL allocation never gains or loses a cent on awkward totals', async () => {
    const prisma = getPrisma();
    const categoryId = await partsCategoryId();

    const response = await postSplit({
      date: todayStr(),
      allocationMethod: 'PROPORTIONAL_SUBTOTAL',
      totals: { totalTaxCents: 100, totalShippingCents: 7, totalOtherFeesCents: 1 },
      lines: [
        { categoryId, subtotalCents: 3333 },
        { categoryId, subtotalCents: 3333 },
        { categoryId, subtotalCents: 3333 }
      ]
    });
    expect(response.status).toBe(200);
    const { splitGroupId } = (await response.json()) as { splitGroupId: string };

    const rows = await prisma.expense.findMany({ where: { splitGroupId } });
    expect(rows).toHaveLength(3);
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(9999 + 108);

    const data = await loadDashboard();
    expect(data.totals.moneyOutCents).toBe(15000 + 9999 + 108);
    expect(data.totals.spendingPowerCents).toBe(13700 - 9999 - 108);
  });

  it('MANUAL allocation persists the per-line values when they match the totals', async () => {
    const prisma = getPrisma();
    const categoryId = await partsCategoryId();

    const response = await postSplit({
      date: todayStr(),
      allocationMethod: 'MANUAL',
      receiptNotes: 'Shared receipt note',
      totals: { totalTaxCents: 80, totalShippingCents: 500, totalOtherFeesCents: 25 },
      lines: [
        { categoryId, subtotalCents: 1000, taxCents: 80, shippingCents: 0, otherFeesCents: 25, notes: 'Own note' },
        { categoryId, subtotalCents: 2000, taxCents: 0, shippingCents: 500, otherFeesCents: 0 }
      ]
    });
    expect(response.status).toBe(200);
    const { splitGroupId } = (await response.json()) as { splitGroupId: string };

    const rows = await prisma.expense.findMany({ where: { splitGroupId }, orderBy: { subtotalCents: 'asc' } });
    expect(rows[0]).toMatchObject({ amountCents: 1105, taxCents: 80, shippingCents: 0, otherFeesCents: 25, notes: 'Own note', receiptNotes: 'Shared receipt note', allocationMethod: 'MANUAL' });
    expect(rows[1]).toMatchObject({ amountCents: 2500, taxCents: 0, shippingCents: 500, otherFeesCents: 0, notes: null, receiptNotes: 'Shared receipt note', allocationMethod: 'MANUAL' });

    const data = await loadDashboard();
    expect(data.totals.moneyOutCents).toBe(15000 + 3605);
  });

  it('receives a part line into inventory at the loaded cost and updates the average cost', async () => {
    const prisma = getPrisma();
    const categoryId = await partsCategoryId();
    const part = await prisma.part.create({ data: { name: 'USB-C Port', quantity: 4, averageCostCents: 500 } });

    const response = await postSplit({
      date: todayStr(),
      allocationMethod: 'EVEN',
      totals: { totalTaxCents: 100, totalShippingCents: 0, totalOtherFeesCents: 0 },
      lines: [{ categoryId, subtotalCents: 1000, notes: 'Ports', partId: part.id, quantity: 2 }]
    });
    expect(response.status).toBe(200);
    const { splitGroupId } = (await response.json()) as { splitGroupId: string };
    const expense = await prisma.expense.findFirstOrThrow({ where: { splitGroupId } });
    expect(expense.amountCents).toBe(1100);

    // (4 * 500 + 1100) / 6 = 516.67
    const after = await prisma.part.findUniqueOrThrow({ where: { id: part.id } });
    expect(after.quantity).toBe(6);
    expect(after.averageCostCents).toBe(517);

    const movement = await prisma.partInventoryMovement.findFirstOrThrow({ where: { partId: part.id } });
    expect(movement).toMatchObject({ type: 'RECEIPT', quantity: 2, unitCostCents: 550, totalCostCents: 1100, expenseId: expense.id });

    const data = await loadDashboard();
    expect(data.totals.partsInventoryValueCents).toBe(6 * 517);
    expect(data.totals.moneyOutCents).toBe(15000 + 1100);
  });

  it('averages a receipt against existing stock valued at its manually entered unit cost', async () => {
    const prisma = getPrisma();
    const categoryId = await partsCategoryId();
    // Stock entered on the Parts page: unit cost set, no average cost yet
    const part = await prisma.part.create({ data: { name: 'Legacy stock', quantity: 4, unitCostCents: 500 } });

    const response = await postSplit({
      date: todayStr(),
      allocationMethod: 'EVEN',
      totals: { totalTaxCents: 100, totalShippingCents: 0, totalOtherFeesCents: 0 },
      lines: [{ categoryId, subtotalCents: 1000, partId: part.id, quantity: 2 }]
    });
    expect(response.status).toBe(200);

    // (4 * 500 + 1100) / 6 = 516.67, not 1100 / 6
    const after = await prisma.part.findUniqueOrThrow({ where: { id: part.id } });
    expect(after.quantity).toBe(6);
    expect(after.averageCostCents).toBe(517);

    const data = await loadDashboard();
    expect(data.totals.partsInventoryValueCents).toBe(6 * 517);
  });

  it('creates a new part inline from a split line and leaves non-part lines out of inventory', async () => {
    const prisma = getPrisma();
    const categoryId = await partsCategoryId();

    const response = await postSplit({
      date: todayStr(),
      allocationMethod: 'EVEN',
      totals: { totalTaxCents: 0, totalShippingCents: 0, totalOtherFeesCents: 0 },
      lines: [
        { categoryId, subtotalCents: 900, newPartName: '  Fan  ', quantity: 3 },
        { categoryId, subtotalCents: 500, notes: 'No part', partId: null, newPartName: '', quantity: 0 }
      ]
    });
    expect(response.status).toBe(200);

    const parts = await prisma.part.findMany();
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ name: 'Fan', quantity: 3, averageCostCents: 300 });
    expect(await prisma.partInventoryMovement.count()).toBe(1);
  });

  it('rolls back the whole receipt when a part line references a missing part', async () => {
    const prisma = getPrisma();
    const categoryId = await partsCategoryId();

    const response = await postSplit({
      date: todayStr(),
      allocationMethod: 'EVEN',
      totals: { totalTaxCents: 0, totalShippingCents: 0, totalOtherFeesCents: 0 },
      lines: [
        { categoryId, subtotalCents: 500 },
        { categoryId, subtotalCents: 900, partId: '00000000-0000-0000-0000-000000000000', quantity: 1 }
      ]
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: 'Part not found' });
    expect(await prisma.expense.count()).toBe(1);
  });

  it('rejects invalid payloads without writing expenses', async () => {
    const prisma = getPrisma();
    const categoryId = await partsCategoryId();
    const totals = { totalTaxCents: 0, totalShippingCents: 0, totalOtherFeesCents: 0 };

    const noLines = await postSplit({ date: todayStr(), allocationMethod: 'EVEN', totals, lines: [] });
    expect(noLines.status).toBe(400);
    expect(await noLines.json()).toEqual({ success: false, error: 'No lines provided' });

    const noCategory = await postSplit({ date: todayStr(), allocationMethod: 'EVEN', totals, lines: [{ subtotalCents: 100 }] });
    expect(noCategory.status).toBe(400);
    expect(await noCategory.json()).toEqual({ success: false, error: 'Each line requires categoryId' });

    const negative = await postSplit({ date: todayStr(), allocationMethod: 'EVEN', totals, lines: [{ categoryId, subtotalCents: -5 }] });
    expect(negative.status).toBe(400);
    expect(await negative.json()).toEqual({ success: false, error: 'Invalid line subtotal' });

    expect(await prisma.expense.count()).toBe(1);
    const data = await loadDashboard();
    expect(data.totals.moneyOutCents).toBe(15000);
  });
});

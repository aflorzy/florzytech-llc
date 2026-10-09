import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { actions as incomeActions } from '../../src/routes/income/+page.server';
import { actions as expenseActions } from '../../src/routes/expenses/+page.server';
import { POST as splitPost } from '../../src/routes/expenses/split/+server';
import { load as workOrderLoad } from '../../src/routes/work-orders/[id]/+page.server';
import { loadDeviceFinancials } from '../../src/lib/server/device-financials';
import { disconnectDb, getPrisma, makeFormRequest, makeJsonRequest, makeLoadEvent, migrationDataStatements, resetDbOnly } from './helpers';

// Fixture produced by `npm run test:snapshot:export` (anonymized copy of the app database plus
// dashboard totals computed in SQL at export time). The suite is skipped when it is absent.
const SNAPSHOT_PATH = process.env.PROD_SNAPSHOT_PATH || path.join(process.cwd(), 'tests', 'fixtures', 'prod-snapshot.json');
const hasSnapshot = fs.existsSync(SNAPSHOT_PATH);

type Row = Record<string, any>;
type Snapshot = {
  asOf: string;
  expected: { totals: Row; last30: Row; devices: Row; workOrders: Row };
  tables: Record<string, Row[]>;
};

const DATE_KEYS = new Set(['date', 'purchaseDate']);

function reviveDates(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'string' && (key.endsWith('At') || DATE_KEYS.has(key)) ? new Date(value) : value;
  }
  return out;
}

function loadSnapshot(): Snapshot {
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;
  const tables = Object.fromEntries(Object.entries(raw.tables).map(([name, rows]) => [name, rows.map(reviveDates)]));
  return { ...raw, tables };
}

// Insert order respects foreign keys.
const REFERENCE_TABLES = ['category', 'salesChannel', 'vendor', 'paymentMethod', 'customer', 'device', 'part', 'workOrder', 'workOrderDevice', 'workOrderItem'];
const LEDGER_TABLES = ['expense', 'income', 'incomeLine', 'partInventoryMovement'];

async function insertTables(snapshot: Snapshot, names: string[]) {
  const prisma = getPrisma() as any;
  for (const name of names) {
    const rows = snapshot.tables[name] || [];
    if (rows.length > 0) await prisma[name].createMany({ data: rows });
  }
}

async function loadDashboard() {
  return (await dashboardLoad(makeLoadEvent<Parameters<typeof dashboardLoad>[0]>())) as any;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);
const localDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isConsistent = (e: Row) => e.amountCents === e.subtotalCents + e.taxCents + e.shippingCents + e.otherFeesCents;

describe.skipIf(!hasSnapshot)('production snapshot', () => {
  let snapshot: Snapshot;

  beforeEach(async () => {
    snapshot = loadSnapshot();
    await resetDbOnly();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('dashboard reproduces the totals recorded at export time', async () => {
    await insertTables(snapshot, [...REFERENCE_TABLES, ...LEDGER_TABLES]);

    // Freeze "now" at the export moment so the 30-day window matches the recorded one.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(snapshot.asOf));

    const data = await loadDashboard();
    expect(data.totals).toEqual(snapshot.expected.totals);
    expect(data.last30).toEqual(snapshot.expected.last30);
    expect(data.devices).toEqual(snapshot.expected.devices);
    expect(data.workOrders).toEqual(snapshot.expected.workOrders);
  });

  it('re-entering every income and expense through the app actions lands on the same totals', async () => {
    const prisma = getPrisma();
    // Expenses are re-entered below under new ids, so movements cannot keep pointing at the exported ones.
    const movements = snapshot.tables.partInventoryMovement.map((m) => ({ ...m, expenseId: null }));
    await insertTables({ ...snapshot, tables: { ...snapshot.tables, partInventoryMovement: movements } }, [...REFERENCE_TABLES, 'partInventoryMovement']);

    for (const income of snapshot.tables.income) {
      const result = await incomeActions.create({
        request: makeFormRequest({
          date: localDateStr(income.date),
          type: income.type,
          amount: dollars(income.amountCents),
          deviceId: income.deviceId || '',
          channelId: income.channelId || '',
          categoryId: income.categoryId || '',
          customerId: income.customerId || '',
          workOrderId: income.workOrderId || '',
          platformFees: dollars(income.platformFeesCents),
          paymentFees: dollars(income.paymentFeesCents),
          shippingRevenue: dollars(income.shippingRevenueCents),
          shippingCost: dollars(income.shippingCostCents),
          taxCollected: dollars(income.taxCollectedCents)
        })
      } as Parameters<typeof incomeActions.create>[0]);
      expect(result).toEqual({ success: true });
      if (income.archivedAt) {
        const created = await prisma.income.findFirstOrThrow({ orderBy: { createdAt: 'desc' }, select: { id: true } });
        await incomeActions.delete({ request: makeFormRequest({ id: created.id }) } as Parameters<typeof incomeActions.delete>[0]);
      }
    }

    const createExpense = async (expense: Row) => {
      const result = await expenseActions.create({
        request: makeFormRequest({
          date: localDateStr(expense.date),
          amount: dollars(expense.amountCents),
          categoryId: expense.categoryId,
          vendorId: expense.vendorId || '',
          paymentMethodId: expense.paymentMethodId || '',
          deviceId: expense.deviceId || ''
        })
      } as Parameters<typeof expenseActions.create>[0]);
      expect(result).toEqual({ success: true });
      if (expense.archivedAt) {
        const created = await prisma.expense.findFirstOrThrow({ orderBy: { createdAt: 'desc' }, select: { id: true } });
        await expenseActions.delete({ request: makeFormRequest({ id: created.id }) } as Parameters<typeof expenseActions.delete>[0]);
      }
    };

    const splitGroups = new Map<string, Row[]>();
    for (const expense of snapshot.tables.expense) {
      // Archived or internally inconsistent split lines are replayed one by one instead of as a receipt.
      if (expense.splitGroupId && !expense.archivedAt && isConsistent(expense)) {
        splitGroups.set(expense.splitGroupId, [...(splitGroups.get(expense.splitGroupId) || []), expense]);
      } else {
        await createExpense(expense);
      }
    }

    for (const lines of splitGroups.values()) {
      const sum = (key: string) => lines.reduce((s, l) => s + l[key], 0);
      const response = await splitPost({
        request: makeJsonRequest({
          date: localDateStr(lines[0].date),
          vendorId: lines[0].vendorId,
          paymentMethodId: lines[0].paymentMethodId,
          allocationMethod: 'MANUAL',
          totals: { totalTaxCents: sum('taxCents'), totalShippingCents: sum('shippingCents'), totalOtherFeesCents: sum('otherFeesCents') },
          lines: lines.map((l) => ({
            categoryId: l.categoryId,
            deviceId: l.deviceId,
            subtotalCents: l.subtotalCents,
            taxCents: l.taxCents,
            shippingCents: l.shippingCents,
            otherFeesCents: l.otherFeesCents
          }))
        })
      } as Parameters<typeof splitPost>[0]);
      expect(response.status).toBe(200);
    }

    expect(await prisma.income.count()).toBe(snapshot.tables.income.length);
    expect(await prisma.expense.count()).toBe(snapshot.tables.expense.length);

    const data = await loadDashboard();
    expect(data.totals).toEqual(snapshot.expected.totals);
  }, 600000);

  // Issue #21: the migration that adds line prices must leave every existing figure alone,
  // except that a donor's cost comes off the work order that was carrying it.
  it('adding line prices changes no work order profit except where a donor was counted, and no device net', async () => {
    const prisma = getPrisma();
    await insertTables(snapshot, [...REFERENCE_TABLES, ...LEDGER_TABLES]);
    const replay = async (migration: string) => {
      for (const statement of await migrationDataStatements(migration)) await prisma.$executeRawUnsafe(statement);
    };
    // A snapshot exported before "device cost on one work order" has no such column; give it
    // what that migration gave production.
    if (!snapshot.tables.workOrderDevice.some((r) => 'includeDeviceCost' in r)) await replay('20261006120000_work_order_device_cost');

    const workOrders = snapshot.tables.workOrder;
    const deviceIds = snapshot.tables.device.map((d) => d.id);
    const loadAll = async () => {
      const summaries = new Map<string, any>();
      for (const w of workOrders) summaries.set(w.id, (await workOrderLoad({ params: { id: w.id } } as Parameters<typeof workOrderLoad>[0])) as any);
      return summaries;
    };
    const actual = (s: any) => ({ profitCents: s.profitCents, partsCostCents: s.partsCostCents, deviceExpensesCents: s.deviceExpensesCents, laborPlannedCents: s.laborPlannedCents, income: s.income });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(snapshot.asOf));
    const dashboardBefore = await loadDashboard();
    vi.useRealTimers();
    const before = await loadAll();
    const devicesBefore = await loadDeviceFinancials(deviceIds);

    await replay('20261009130000_work_order_line_prices');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(snapshot.asOf));
    const dashboardAfter = await loadDashboard();
    vi.useRealTimers();
    const after = await loadAll();

    // Spending power and the 30 day figures: no money moved
    expect(dashboardAfter).toEqual(dashboardBefore);
    expect(dashboardAfter.totals).toEqual(snapshot.expected.totals);
    // Device net never depended on which work order carries a cost
    expect(await loadDeviceFinancials(deviceIds)).toEqual(devicesBefore);

    const changed: string[] = [];
    for (const w of workOrders) {
      const was = before.get(w.id);
      const now = after.get(w.id);
      // Cost a counted donor was putting on this work order before the migration
      const donorCostCents = was.workOrder.devices
        .filter((d: any) => d.role === 'DONOR' && d.includeDeviceCost)
        .reduce((s: number, d: any) => s + d.expensesCents, 0);
      expect(actual(now.summary), w.code).toEqual({
        ...actual(was.summary),
        deviceExpensesCents: was.summary.deviceExpensesCents - donorCostCents,
        profitCents: was.summary.profitCents + donorCostCents
      });
      if (donorCostCents !== 0) changed.push(w.code);
      expect(now.workOrder.devices.filter((d: any) => d.role === 'DONOR' && d.includeDeviceCost), w.code).toEqual([]);

      // Finished or paid work orders are invoiced with their parts left unpriced; the rest are open
      const hasLivePayment =
        snapshot.tables.income.some((i) => i.workOrderId === w.id && !i.archivedAt) ||
        snapshot.tables.incomeLine.some((l) => l.workOrderId === w.id && !l.archivedAt && !snapshot.tables.income.find((i) => i.id === l.incomeId)?.archivedAt);
      const alreadyInvoiced = !!w.invoicedAt;
      if (alreadyInvoiced) continue;
      if (['DELIVERED', 'CANCELLED'].includes(w.status) || hasLivePayment) {
        expect(now.pricing, w.code).toMatchObject({ markupBps: null, markupSource: 'unpriced' });
        expect(now.pricing.invoicedAt, w.code).not.toBeNull();
        expect(now.summary.invoice.partsPriceCents, w.code).toBe(0);
        expect(now.summary.invoice.invoiceTotalCents, w.code).toBe(now.summary.laborPlannedCents);
      } else {
        expect(now.pricing, w.code).toMatchObject({ markupBps: 3000, markupSource: 'setting', invoicedAt: null });
      }
    }
    // Listed in the pull request for #21; an export taken after that migration has none left
    console.log(`Work orders whose profit changes with the donor migration: ${changed.join(', ') || 'none'}`);
  }, 600000);
});

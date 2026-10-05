import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { actions as incomeActions } from '../../src/routes/income/+page.server';
import { actions as expenseActions } from '../../src/routes/expenses/+page.server';
import { POST as splitPost } from '../../src/routes/expenses/split/+server';
import { disconnectDb, getPrisma, makeFormRequest, makeJsonRequest, makeLoadEvent, resetDbOnly } from './helpers';

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
    await insertTables(snapshot, [...REFERENCE_TABLES, 'partInventoryMovement']);

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
});

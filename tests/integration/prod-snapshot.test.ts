import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { actions as incomeActions } from '../../src/routes/income/+page.server';
import { actions as expenseActions } from '../../src/routes/expenses/+page.server';
import { POST as splitPost } from '../../src/routes/expenses/split/+server';
import { load as workOrderLoad } from '../../src/routes/work-orders/[id]/+page.server';
import { loadDeviceFinancials } from '../../src/lib/server/device-financials';
import {
  createLegacyIncomeLineTable,
  disconnectDb,
  dropLegacyIncomeLineTable,
  getPrisma,
  insertLegacyIncomeLine,
  makeFormRequest,
  makeJsonRequest,
  makeLoadEvent,
  migrationDataStatements,
  resetDbOnly,
  runMigration,
  type LegacyIncomeLine
} from './helpers';

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
const LEDGER_TABLES = ['expense', 'income', 'partInventoryMovement'];

// The Sale Builder's lines, present in a snapshot exported before they were folded into
// their incomes (#14). They go into the table as it was, which the test puts back first.
const legacyLines = (snapshot: Snapshot) => (snapshot.tables.incomeLine || []) as LegacyIncomeLine[];
async function insertLegacyLines(snapshot: Snapshot) {
  await createLegacyIncomeLineTable();
  for (const line of legacyLines(snapshot)) await insertLegacyIncomeLine(line);
}

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

  afterEach(async () => {
    vi.useRealTimers();
    await dropLegacyIncomeLineTable();
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
    // That migration dates each work order by its payments, Sale Builder lines included
    await insertLegacyLines(snapshot);
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
      const headOf = (l: Row) => snapshot.tables.income.find((i) => i.id === l.incomeId);
      const livePayments = [
        ...snapshot.tables.income.filter((i) => i.workOrderId === w.id && !i.archivedAt),
        ...legacyLines(snapshot).filter((l) => l.workOrderId === w.id && !l.archivedAt && !headOf(l)?.archivedAt).map((l) => headOf(l)!)
      ];
      const hasLivePayment = livePayments.length > 0;
      const alreadyInvoiced = !!w.invoicedAt;
      if (alreadyInvoiced) continue;
      if (['DELIVERED', 'CANCELLED'].includes(w.status) || hasLivePayment) {
        expect(now.pricing, w.code).toMatchObject({ markupBps: null, markupSource: 'unpriced' });
        // Dated by its earliest payment, or when it was last changed if it has none
        const firstPaymentAt = Math.min(...livePayments.map((i) => i.date.getTime()));
        expect(new Date(now.pricing.invoicedAt).getTime(), w.code).toBe(hasLivePayment ? firstPaymentAt : w.updatedAt.getTime());
        expect(now.summary.invoice.partsPriceCents, w.code).toBe(0);
        expect(now.summary.invoice.invoiceTotalCents, w.code).toBe(now.summary.laborPlannedCents);
      } else {
        expect(now.pricing, w.code).toMatchObject({ markupBps: 3000, markupSource: 'setting', invoicedAt: null });
      }
    }
    // Listed in the pull request for #21; an export taken after that migration has none left
    console.log(`Work orders whose profit changes with the donor migration: ${changed.join(', ') || 'none'}`);
  }, 600000);

  // Issue #14: folding the Sale Builder's lines into their incomes must leave every figure
  // where it was. "Before" is worked out in SQL from the lines by the rules the app used while
  // it still read them, so it does not depend on the code that replaced them. The one decided
  // exception: a live sale of several devices becomes an income on its work order only, so
  // those devices lose the share their lines gave them and nothing else moves.
  it.skipIf(!hasSnapshot || legacyLines(loadSnapshot()).length === 0)(
    'retiring the Sale Builder changes no figure except the devices on a sale of several devices',
    async () => {
      const prisma = getPrisma();
      await insertTables(snapshot, [...REFERENCE_TABLES, ...LEDGER_TABLES]);
      await insertLegacyLines(snapshot);
      const lines = legacyLines(snapshot);
      const deviceIds = snapshot.tables.device.map((d) => d.id);
      const workOrders = snapshot.tables.workOrder;
      const n = (v: unknown) => Number(v ?? 0);

      // Device income as it was read: the device's own lines with their share of the fees, plus
      // incomes naming the device that have no device line.
      const legacyDeviceRows = await prisma.$queryRawUnsafe<Row[]>(`
        SELECT d."id",
          COALESCE(h.amount, 0) + COALESCE(l.amount, 0) AS income,
          COALESCE(h.fees, 0) + COALESCE(l.fees, 0) AS fees,
          COALESCE(h.shipping, 0) + COALESCE(l.shipping, 0) AS shipping,
          COALESCE(h.tax, 0) + COALESCE(l.tax, 0) AS tax
        FROM "Device" d
        LEFT JOIN (
          SELECT i."deviceId", SUM(i."amountCents") AS amount, SUM(i."platformFeesCents" + i."paymentFeesCents") AS fees,
                 SUM(i."shippingRevenueCents" - i."shippingCostCents") AS shipping, SUM(i."taxCollectedCents") AS tax
          FROM "Income" i
          WHERE i."archivedAt" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "IncomeLine" x WHERE x."incomeId" = i."id" AND x."archivedAt" IS NULL AND x."deviceId" IS NOT NULL)
          GROUP BY i."deviceId"
        ) h ON h."deviceId" = d."id"
        LEFT JOIN (
          SELECT x."deviceId", SUM(x."amountCents") AS amount, SUM(x."allocatedPlatformFeesCents" + x."allocatedPaymentFeesCents") AS fees,
                 SUM(x."allocatedShippingRevenueCents" - x."allocatedShippingCostCents") AS shipping, SUM(x."allocatedTaxCents") AS tax
          FROM "IncomeLine" x JOIN "Income" i ON i."id" = x."incomeId"
          WHERE x."archivedAt" IS NULL AND i."archivedAt" IS NULL
          GROUP BY x."deviceId"
        ) l ON l."deviceId" = d."id"`);
      const legacyDevice = new Map(legacyDeviceRows.map((r) => [r.id as string, { income: n(r.income), fees: n(r.fees), shipping: n(r.shipping), tax: n(r.tax) }]));

      // Work order revenue as it was read: the lines pointed at the work order, or its incomes
      // when no line was. Received: every line of an income on the work order (a line with no
      // work order follows its income), plus incomes with no lines.
      const legacyWorkOrderRows = await prisma.$queryRawUnsafe<Row[]>(`
        SELECT w."id",
          CASE WHEN l.lines > 0 THEN l.gross ELSE COALESCE(h.gross, 0) END AS gross,
          CASE WHEN l.lines > 0 THEN l.platform ELSE COALESCE(h.platform, 0) END AS platform,
          CASE WHEN l.lines > 0 THEN l.payment ELSE COALESCE(h.payment, 0) END AS payment,
          CASE WHEN l.lines > 0 THEN l.ship_rev ELSE COALESCE(h.ship_rev, 0) END AS ship_rev,
          CASE WHEN l.lines > 0 THEN l.ship_cost ELSE COALESCE(h.ship_cost, 0) END AS ship_cost,
          COALESCE(r.amount, 0) + COALESCE(p.amount, 0) AS received
        FROM "WorkOrder" w
        LEFT JOIN (
          SELECT x."workOrderId", COUNT(*) AS lines, SUM(x."amountCents") AS gross, SUM(x."allocatedPlatformFeesCents") AS platform,
                 SUM(x."allocatedPaymentFeesCents") AS payment, SUM(x."allocatedShippingRevenueCents") AS ship_rev, SUM(x."allocatedShippingCostCents") AS ship_cost
          FROM "IncomeLine" x JOIN "Income" i ON i."id" = x."incomeId"
          WHERE x."archivedAt" IS NULL AND i."archivedAt" IS NULL
          GROUP BY x."workOrderId"
        ) l ON l."workOrderId" = w."id"
        LEFT JOIN (
          SELECT i."workOrderId", SUM(i."amountCents") AS gross, SUM(i."platformFeesCents") AS platform, SUM(i."paymentFeesCents") AS payment,
                 SUM(i."shippingRevenueCents") AS ship_rev, SUM(i."shippingCostCents") AS ship_cost
          FROM "Income" i WHERE i."archivedAt" IS NULL GROUP BY i."workOrderId"
        ) h ON h."workOrderId" = w."id"
        LEFT JOIN (
          SELECT COALESCE(x."workOrderId", i."workOrderId") AS "workOrderId", SUM(x."amountCents") AS amount
          FROM "IncomeLine" x JOIN "Income" i ON i."id" = x."incomeId"
          WHERE x."archivedAt" IS NULL AND i."archivedAt" IS NULL
          GROUP BY 1
        ) r ON r."workOrderId" = w."id"
        LEFT JOIN (
          SELECT i."workOrderId", SUM(i."amountCents") AS amount
          FROM "Income" i
          WHERE i."archivedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "IncomeLine" x WHERE x."incomeId" = i."id" AND x."archivedAt" IS NULL)
          GROUP BY i."workOrderId"
        ) p ON p."workOrderId" = w."id"`);
      const legacyWorkOrder = new Map(legacyWorkOrderRows.map((r) => [r.id as string, r]));

      // Everything that never depended on the lines, read with the app before the migration
      const frozenDashboard = async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(snapshot.asOf));
        const data = await loadDashboard();
        vi.useRealTimers();
        return data;
      };
      const loadWorkOrders = async () => {
        const out = new Map<string, any>();
        for (const w of workOrders) out.set(w.id, (await workOrderLoad({ params: { id: w.id } } as Parameters<typeof workOrderLoad>[0])) as any);
        return out;
      };
      const stock = () =>
        Promise.all([prisma.part.findMany({ orderBy: { id: 'asc' } }), prisma.partInventoryMovement.findMany({ orderBy: { id: 'asc' } })]);
      const incomeMoney = { id: true, date: true, type: true, amountCents: true, platformFeesCents: true, paymentFeesCents: true, shippingRevenueCents: true, shippingCostCents: true, taxCollectedCents: true, workOrderId: true, customerId: true, channelId: true, categoryId: true, archivedAt: true, createdAt: true } as const;
      const incomes = () => prisma.income.findMany({ orderBy: { id: 'asc' }, select: incomeMoney });

      const dashboardBefore = await frozenDashboard();
      const devicesBefore = await loadDeviceFinancials(deviceIds);
      const workOrdersBefore = await loadWorkOrders();
      const stockBefore = await stock();
      const incomesBefore = await incomes();
      expect(dashboardBefore.totals).toEqual(snapshot.expected.totals);

      await runMigration('20261009140000_retire_sale_builder');

      // The lines are gone, and no income was added, removed or had its money touched
      const [gone] = await prisma.$queryRawUnsafe<Row[]>(`SELECT to_regclass('public."IncomeLine"')::text AS name`);
      expect(gone.name).toBeNull();
      expect(await incomes()).toEqual(incomesBefore);

      // Spending power, money in, fees, tax, the 30 day figures and parts inventory value
      const dashboardAfter = await frozenDashboard();
      expect(dashboardAfter).toEqual(dashboardBefore);
      expect(dashboardAfter.totals).toEqual(snapshot.expected.totals);
      expect(dashboardAfter.last30).toEqual(snapshot.expected.last30);

      // Every part's quantity and cost, and every stock movement
      expect(await stock()).toEqual(stockBefore);

      // Where each income ended up: one line device goes on the income, several clear it
      const lineDevicesOf = (incomeId: string) => [...new Set(lines.filter((l) => l.incomeId === incomeId && l.deviceId).map((l) => l.deviceId as string))];
      const liveMultiDevice = snapshot.tables.income.filter((i) => !i.archivedAt && lineDevicesOf(i.id).length > 1);
      for (const original of snapshot.tables.income) {
        const row = await prisma.income.findUniqueOrThrow({ where: { id: original.id }, select: { deviceId: true } });
        const lineDevices = lineDevicesOf(original.id);
        const expected = lineDevices.length > 1 ? null : lineDevices.length === 1 ? lineDevices[0] : original.deviceId;
        expect(row.deviceId, `income ${original.id}`).toBe(expected);
      }

      // Every device, row by row
      const devicesAfter = await loadDeviceFinancials(deviceIds);
      const skuOf = new Map(snapshot.tables.device.map((d) => [d.id as string, d.sku as string]));
      const movedDevices: string[] = [];
      for (const id of deviceIds) {
        const was = devicesBefore.get(id)!;
        const now = devicesAfter.get(id)!;
        const legacy = legacyDevice.get(id)!;
        // What the lines of a live sale of several devices gave this device
        const lost = lines.filter((l) => l.deviceId === id && !l.archivedAt && liveMultiDevice.some((i) => i.id === l.incomeId));
        const sum = (pick: (l: LegacyIncomeLine) => number) => lost.reduce((s, l) => s + pick(l), 0);
        const expectedIncome = legacy.income - sum((l) => l.amountCents || 0);
        const expectedFees = legacy.fees - sum((l) => (l.allocatedPlatformFeesCents || 0) + (l.allocatedPaymentFeesCents || 0));
        const expectedShipping = legacy.shipping - sum((l) => (l.allocatedShippingRevenueCents || 0) - (l.allocatedShippingCostCents || 0));
        const costs = { expensesCents: was.expensesCents, stockedExpensesCents: was.stockedExpensesCents, partsConsumedCents: was.partsConsumedCents, harvestedCents: was.harvestedCents };
        expect(now, skuOf.get(id)).toEqual({
          ...costs,
          incomeCents: expectedIncome,
          feesCents: expectedFees,
          shippingNetCents: expectedShipping,
          taxCollectedCents: legacy.tax - sum((l) => l.allocatedTaxCents || 0),
          netCents: expectedIncome - expectedFees + expectedShipping - Math.max(0, was.expensesCents - was.harvestedCents) - was.partsConsumedCents
        });
        const legacyNet = legacy.income - legacy.fees + legacy.shipping - Math.max(0, was.expensesCents - was.harvestedCents) - was.partsConsumedCents;
        if (now.netCents !== legacyNet) movedDevices.push(`${skuOf.get(id)} ${dollars(legacyNet)} -> ${dollars(now.netCents)}`);
        else expect(lost, skuOf.get(id)).toEqual([]);
      }
      // Only devices on a live sale of several devices move, and each by exactly its lines
      const expectedMoved = new Set(liveMultiDevice.flatMap((i) => lines.filter((l) => l.incomeId === i.id && l.deviceId && (l.amountCents || 0) !== 0).map((l) => skuOf.get(l.deviceId as string))));
      expect(new Set(movedDevices.map((m) => m.split(' ')[0]))).toEqual(expectedMoved);

      // Every work order, row by row: revenue, profit, received and prices
      const workOrdersAfter = await loadWorkOrders();
      for (const w of workOrders) {
        const was = workOrdersBefore.get(w.id);
        const now = workOrdersAfter.get(w.id);
        const legacy = legacyWorkOrder.get(w.id)!;
        const netRevenueCents = n(legacy.gross) + n(legacy.ship_rev) - n(legacy.platform) - n(legacy.payment) - n(legacy.ship_cost);
        expect(now.summary, w.code).toEqual({
          ...was.summary,
          income: {
            grossCents: n(legacy.gross),
            platformFeesCents: n(legacy.platform),
            paymentFeesCents: n(legacy.payment),
            shippingRevenueCents: n(legacy.ship_rev),
            shippingCostCents: n(legacy.ship_cost),
            netRevenueCents
          },
          profitCents: netRevenueCents - was.summary.partsCostCents - was.summary.deviceExpensesCents,
          invoice: { ...was.summary.invoice, receivedCents: n(legacy.received), balanceDueCents: was.summary.invoice.invoiceTotalCents - n(legacy.received) }
        });
        expect(now.pricing, w.code).toEqual(was.pricing);
      }

      // Listed in the pull request for #14
      console.log(`Sales of several devices tied to their work order: ${liveMultiDevice.map((i) => i.id).join(', ') || 'none'}`);
      console.log(`Device nets that move with them: ${movedDevices.join('; ') || 'none'}`);
    },
    600000
  );
});

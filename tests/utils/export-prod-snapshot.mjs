// Exports an anonymized, read-only snapshot of the app database (DATABASE_URL in .env) to
// tests/fixtures/prod-snapshot.json, together with dashboard totals computed independently in SQL.
// Run manually with `npm run test:snapshot:export` when you want to refresh the fixture.
//
// Safety: every query runs inside a single READ ONLY transaction, so this script cannot write.
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const OUT_PATH = process.env.SNAPSHOT_OUT || path.join(process.cwd(), 'tests', 'fixtures', 'prod-snapshot.json');

function readAppDatabaseUrl() {
  const envPath = path.join(process.cwd(), '.env');
  const match = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m) : null;
  const url = process.env.SNAPSHOT_SOURCE_URL || (match && match[1]);
  if (!url) throw new Error('No DATABASE_URL found in .env (or SNAPSHOT_SOURCE_URL in the environment).');
  return url;
}

// Free text and contact details never leave the source database.
const scrub = {
  customer: (r, i) => ({ ...r, name: `Customer ${i + 1}`, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, notes: null }),
  device: (r) => ({ ...r, serial: null, source: null, condition: null, notes: null }),
  expense: (r) => ({ ...r, notes: null, vendorOrderNumber: null }),
  income: (r) => ({ ...r, notes: null }),
  incomeLine: (r) => ({ ...r, description: null }),
  part: (r) => ({ ...r, notes: null, url: null }),
  partInventoryMovement: (r) => ({ ...r, notes: null }),
  workOrder: (r) => ({ ...r, notes: null }),
  workOrderItem: (r) => ({ ...r, description: null })
};

const num = (v) => Number(v ?? 0);

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: readAppDatabaseUrl() } } });
  try {
    const snapshot = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');

        const asOf = new Date();
        const d30 = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000);

        // The Sale Builder's lines exist only in a database that has not yet run the
        // retire_sale_builder migration. They are exported when present so the snapshot test can
        // check that migration against them.
        const [{ name: linesTable }] = await tx.$queryRawUnsafe(`SELECT to_regclass('public."IncomeLine"')::text AS name`);
        const incomeLines = linesTable ? await tx.$queryRawUnsafe('SELECT * FROM "IncomeLine"') : [];

        const tables = {
          category: await tx.category.findMany(),
          salesChannel: await tx.salesChannel.findMany(),
          vendor: await tx.vendor.findMany(),
          paymentMethod: await tx.paymentMethod.findMany(),
          customer: (await tx.customer.findMany({ orderBy: { createdAt: 'asc' } })).map(scrub.customer),
          device: (await tx.device.findMany()).map(scrub.device),
          part: (await tx.part.findMany()).map(scrub.part),
          workOrder: (await tx.workOrder.findMany()).map(scrub.workOrder),
          workOrderDevice: await tx.workOrderDevice.findMany(),
          workOrderItem: (await tx.workOrderItem.findMany()).map(scrub.workOrderItem),
          expense: (await tx.expense.findMany({ orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] })).map(scrub.expense),
          income: (await tx.income.findMany({ orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] })).map(scrub.income),
          partInventoryMovement: (await tx.partInventoryMovement.findMany()).map(scrub.partInventoryMovement),
          ...(linesTable ? { incomeLine: incomeLines.map(scrub.incomeLine) } : {})
        };

        // Expected dashboard numbers, computed in SQL so they do not depend on the app's own code.
        const incomeSql = (since) => `
          SELECT COALESCE(SUM("amountCents"),0) AS gross,
                 COALESCE(SUM("platformFeesCents"),0) AS platform,
                 COALESCE(SUM("paymentFeesCents"),0) AS payment,
                 COALESCE(SUM("shippingRevenueCents"),0) AS ship_rev,
                 COALESCE(SUM("shippingCostCents"),0) AS ship_cost,
                 COALESCE(SUM("taxCollectedCents"),0) AS tax
          FROM "Income" WHERE "archivedAt" IS NULL ${since ? 'AND "date" >= $1' : ''}`;
        const expenseSql = (since) => `
          SELECT COALESCE(SUM("amountCents"),0) AS total
          FROM "Expense" WHERE "archivedAt" IS NULL ${since ? 'AND "date" >= $1' : ''}`;

        const [incAll] = await tx.$queryRawUnsafe(incomeSql(false));
        const [expAll] = await tx.$queryRawUnsafe(expenseSql(false));
        const [inc30] = await tx.$queryRawUnsafe(incomeSql(true), d30);
        const [exp30] = await tx.$queryRawUnsafe(expenseSql(true), d30);
        const [partsValue] = await tx.$queryRawUnsafe(
          `SELECT COALESCE(SUM("quantity" * CASE WHEN "averageCostCents" > 0 THEN "averageCostCents" ELSE GREATEST(COALESCE("unitCostCents",0),0) END),0) AS total
           FROM "Part" WHERE "archivedAt" IS NULL`
        );
        const [consumed30] = await tx.$queryRawUnsafe(
          `SELECT GREATEST(0,
                    COALESCE(SUM("totalCostCents") FILTER (WHERE "type" = 'CONSUME'),0)
                  - COALESCE(SUM("totalCostCents") FILTER (WHERE "type" = 'ADJUSTMENT' AND "workOrderId" IS NOT NULL),0)) AS total
           FROM "PartInventoryMovement" WHERE "archivedAt" IS NULL AND "createdAt" >= $1`,
          d30
        );
        const [deviceCounts] = await tx.$queryRawUnsafe(
          `SELECT COUNT(*) FILTER (WHERE "archivedAt" IS NULL) AS active, COUNT(*) FILTER (WHERE "archivedAt" IS NOT NULL) AS archived FROM "Device"`
        );
        const [openWorkOrders] = await tx.$queryRawUnsafe(
          `SELECT COUNT(*) AS total FROM "WorkOrder" WHERE "archivedAt" IS NULL AND "status" NOT IN ('DELIVERED','CANCELLED')`
        );

        const net = (r) => num(r.gross) - num(r.platform) - num(r.payment) - num(r.ship_cost) + num(r.ship_rev);
        const expected = {
          totals: {
            incomeGrossCents: num(incAll.gross),
            moneyInNetCents: net(incAll),
            moneyOutCents: num(expAll.total),
            spendingPowerCents: net(incAll) - num(expAll.total),
            taxesCollectedCents: num(incAll.tax),
            feesCents: num(incAll.platform) + num(incAll.payment),
            expensesCents: num(expAll.total),
            partsInventoryValueCents: num(partsValue.total)
          },
          last30: {
            moneyInNetCents: net(inc30),
            moneyOutCents: num(exp30.total),
            spendingPowerCents: net(inc30) - num(exp30.total),
            taxesCollectedCents: num(inc30.tax),
            feesCents: num(inc30.platform) + num(inc30.payment),
            expensesCents: num(exp30.total),
            partsConsumedCents: num(consumed30.total)
          },
          devices: { activeDevices: num(deviceCounts.active), archivedDevices: num(deviceCounts.archived) },
          workOrders: { open: num(openWorkOrders.total) }
        };

        return { asOf: asOf.toISOString(), expected, tables };
      },
      { timeout: 120000, maxWait: 30000 }
    );

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 1) + '\n');
    const counts = Object.fromEntries(Object.entries(snapshot.tables).map(([k, v]) => [k, v.length]));
    console.log(`Wrote ${path.relative(process.cwd(), OUT_PATH)} as of ${snapshot.asOf}`);
    console.log('Row counts:', counts);
    console.log('Expected totals:', snapshot.expected.totals);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

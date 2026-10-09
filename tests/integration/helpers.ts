import { PrismaClient } from '@prisma/client';
import { loadTestEnv } from '../utils/env-loader';

let prisma: PrismaClient | null = null;

function ensurePrisma() {
  if (!prisma) {
    const env = loadTestEnv();
    prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL_TEST } } });
  }
  return prisma;
}

export async function resetAndSeedDb() {
  loadTestEnv();
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
  const { resetDb } = await import('../utils/db-reset.mjs');
  const { seedFixtures } = await import('../utils/seed-fixtures.mjs');
  await resetDb();
  await seedFixtures();
}

// Empty database with no fixtures, for suites that load their own data.
export async function resetDbOnly() {
  loadTestEnv();
  await disconnectDb();
  const { resetDb } = await import('../utils/db-reset.mjs');
  await resetDb();
}

export function getPrisma() {
  return ensurePrisma();
}

export function makeLoadEvent<T>(url = 'http://localhost/'): T {
  return { url: new URL(url) } as T;
}

export function makeJsonRequest(payload: unknown): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function makeFormRequest(data: Record<string, string>): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(data)) {
    form.set(k, v);
  }
  return new Request('http://localhost/test', {
    method: 'POST',
    body: form
  });
}

export async function disconnectDb() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

// The data-changing statements (UPDATE/INSERT) of a migration, so a test can replay them
// against rows that look like data from before the migration.
export async function migrationDataStatements(migrationName: string): Promise<string[]> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const file = path.join(process.cwd(), 'prisma', 'migrations', migrationName, 'migration.sql');
  const sql = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => /^(UPDATE|INSERT)\b/i.test(s));
}

// Every statement of a migration, in order. A DO $$ ... $$ block is kept whole.
export async function migrationStatements(migrationName: string): Promise<string[]> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const file = path.join(process.cwd(), 'prisma', 'migrations', migrationName, 'migration.sql');
  const statements: string[] = [];
  let current: string[] = [];
  let inDollarBlock = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!inDollarBlock && line.trim().startsWith('--')) continue;
    current.push(line);
    if ((line.match(/\$\$/g) || []).length % 2 === 1) inDollarBlock = !inDollarBlock;
    if (!inDollarBlock && line.trimEnd().endsWith(';')) {
      statements.push(current.join('\n').trim());
      current = [];
    }
  }
  if (current.join('').trim()) statements.push(current.join('\n').trim());
  return statements.filter(Boolean);
}

// Runs a whole migration in one transaction, as `prisma migrate deploy` does, so a
// statement that fails leaves nothing behind.
export async function runMigration(migrationName: string) {
  const statements = await migrationStatements(migrationName);
  await ensurePrisma().$transaction(
    async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    },
    { timeout: 60000, maxWait: 30000 }
  );
}

// The Sale Builder kept its lines in "IncomeLine", which the retire_sale_builder migration
// drops. Tests that replay a migration written while the table existed put it back first.
const INCOME_LINES_MIGRATION = '20250926155132_stage_c_income_lines';

export async function dropLegacyIncomeLineTable() {
  const db = ensurePrisma();
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS "IncomeLine"');
  await db.$executeRawUnsafe('DROP TYPE IF EXISTS "IncomeLineType"');
}

export async function createLegacyIncomeLineTable() {
  await dropLegacyIncomeLineTable();
  const db = ensurePrisma();
  for (const statement of await migrationStatements(INCOME_LINES_MIGRATION)) {
    if (/"IncomeLine/.test(statement)) await db.$executeRawUnsafe(statement);
  }
}

export type LegacyIncomeLine = {
  id?: string;
  incomeId: string;
  type: 'DEVICE' | 'PART' | 'LABOR' | 'OTHER';
  amountCents?: number;
  deviceId?: string | null;
  partId?: string | null;
  workOrderId?: string | null;
  quantity?: number | null;
  archivedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  allocatedPlatformFeesCents?: number;
  allocatedPaymentFeesCents?: number;
  allocatedShippingRevenueCents?: number;
  allocatedShippingCostCents?: number;
  allocatedTaxCents?: number;
};

export async function insertLegacyIncomeLine(line: LegacyIncomeLine) {
  const { randomUUID } = await import('node:crypto');
  const now = new Date();
  await ensurePrisma().$executeRawUnsafe(
    `INSERT INTO "IncomeLine" ("id", "createdAt", "updatedAt", "archivedAt", "incomeId", "type", "deviceId", "partId", "workOrderId", "quantity", "amountCents",
       "allocatedPlatformFeesCents", "allocatedPaymentFeesCents", "allocatedShippingRevenueCents", "allocatedShippingCostCents", "allocatedTaxCents")
     VALUES ($1, $2, $3, $4, $5, $6::"IncomeLineType", $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    line.id ?? randomUUID(),
    line.createdAt ?? now,
    line.updatedAt ?? now,
    line.archivedAt ?? null,
    line.incomeId,
    line.type,
    line.deviceId ?? null,
    line.partId ?? null,
    line.workOrderId ?? null,
    line.quantity ?? null,
    line.amountCents ?? 0,
    line.allocatedPlatformFeesCents ?? 0,
    line.allocatedPaymentFeesCents ?? 0,
    line.allocatedShippingRevenueCents ?? 0,
    line.allocatedShippingCostCents ?? 0,
    line.allocatedTaxCents ?? 0
  );
}

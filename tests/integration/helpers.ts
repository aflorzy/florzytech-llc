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

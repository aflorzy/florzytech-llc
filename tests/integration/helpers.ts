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

export function getPrisma() {
  return ensurePrisma();
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

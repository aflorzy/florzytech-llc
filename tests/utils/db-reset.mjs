import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { loadTestEnv } from './env.mjs';

async function truncateAllTables(url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    );
    const tables = Array.isArray(rows) ? rows.map((r) => r.tablename).filter(Boolean) : [];
    if (tables.length === 0) return;
    const quoted = tables.map((t) => `"${String(t).replace(/"/g, '""')}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
  } finally {
    await prisma.$disconnect();
  }
}

export async function resetDb() {
  const vars = loadTestEnv();
  await truncateAllTables(vars.DATABASE_URL_TEST);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  resetDb().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

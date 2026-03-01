import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetAndSeedDb, getPrisma, disconnectDb } from './helpers';

describe('integration smoke', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('connects to test database and sees seeded baseline records', async () => {
    const prisma = getPrisma();
    const incomes = await prisma.income.count({ where: { archivedAt: null } });
    const expenses = await prisma.expense.count({ where: { archivedAt: null } });
    expect(incomes).toBeGreaterThan(0);
    expect(expenses).toBeGreaterThan(0);
  });
});

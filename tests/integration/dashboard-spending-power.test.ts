import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { disconnectDb, getPrisma, resetAndSeedDb } from './helpers';

function makeLoadEvent(url: string) {
  return { url: new URL(url) } as Parameters<typeof dashboardLoad>[0];
}

describe('dashboard spending power contract', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('computes moneyInNet, moneyOut, and spendingPower from cents correctly', async () => {
    const data = (await dashboardLoad(makeLoadEvent('http://localhost/'))) as any;

    // Seed fixture: income=30000, fees=1500, shipNet=200, expense=15000
    expect(data.totals.moneyInNetCents).toBe(28700);
    expect(data.totals.moneyOutCents).toBe(15000);
    expect(data.totals.spendingPowerCents).toBe(13700);
  });

  it('excludes archived income and expense rows from totals', async () => {
    const prisma = getPrisma();

    const incomeCategory = await prisma.category.findFirstOrThrow({ where: { kind: 'income' }, select: { id: true } });
    const channel = await prisma.salesChannel.findFirstOrThrow({ select: { id: true } });
    const expenseCategory = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });

    await prisma.income.create({
      data: {
        date: new Date(),
        type: 'SALE',
        amountCents: 99999,
        platformFeesCents: 100,
        paymentFeesCents: 100,
        shippingRevenueCents: 50,
        shippingCostCents: 50,
        archivedAt: new Date(),
        categoryId: incomeCategory.id,
        channelId: channel.id
      }
    });

    await prisma.expense.create({
      data: {
        date: new Date(),
        amountCents: 88888,
        subtotalCents: 88888,
        archivedAt: new Date(),
        categoryId: expenseCategory.id
      }
    });

    const data = (await dashboardLoad(makeLoadEvent('http://localhost/'))) as any;
    expect(data.totals.moneyInNetCents).toBe(28700);
    expect(data.totals.moneyOutCents).toBe(15000);
    expect(data.totals.spendingPowerCents).toBe(13700);
  });

  it('applies 30-day window include/exclude correctly', async () => {
    const prisma = getPrisma();

    const incomeCategory = await prisma.category.findFirstOrThrow({ where: { kind: 'income' }, select: { id: true } });
    const channel = await prisma.salesChannel.findFirstOrThrow({ select: { id: true } });
    const expenseCategory = await prisma.category.findFirstOrThrow({ where: { kind: 'expense' }, select: { id: true } });

    const now = new Date();
    const d29 = new Date(now);
    d29.setDate(d29.getDate() - 29);
    const d31 = new Date(now);
    d31.setDate(d31.getDate() - 31);

    // Included in 30d
    await prisma.income.create({
      data: {
        date: d29,
        type: 'SERVICE',
        amountCents: 10000,
        platformFeesCents: 100,
        paymentFeesCents: 100,
        shippingRevenueCents: 0,
        shippingCostCents: 0,
        categoryId: incomeCategory.id,
        channelId: channel.id
      }
    });
    await prisma.expense.create({
      data: { date: d29, amountCents: 2000, subtotalCents: 2000, categoryId: expenseCategory.id }
    });

    // Excluded from 30d
    await prisma.income.create({
      data: {
        date: d31,
        type: 'SERVICE',
        amountCents: 7777,
        platformFeesCents: 0,
        paymentFeesCents: 0,
        shippingRevenueCents: 0,
        shippingCostCents: 0,
        categoryId: incomeCategory.id,
        channelId: channel.id
      }
    });
    await prisma.expense.create({
      data: { date: d31, amountCents: 3333, subtotalCents: 3333, categoryId: expenseCategory.id }
    });

    const data = (await dashboardLoad(makeLoadEvent('http://localhost/'))) as any;

    // Baseline 30d from fixture: 28,700 in net and 15,000 out
    // Add included row net: 10,000 - 100 - 100 = 9,800; add expense 2,000
    expect(data.last30.moneyInNetCents).toBe(28700 + 9800);
    expect(data.last30.moneyOutCents).toBe(15000 + 2000);
    expect(data.last30.spendingPowerCents).toBe((28700 + 9800) - (15000 + 2000));
  });
});

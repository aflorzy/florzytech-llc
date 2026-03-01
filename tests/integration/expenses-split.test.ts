import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as splitPost } from '../../src/routes/expenses/split/+server';
import { disconnectDb, getPrisma, makeJsonRequest, resetAndSeedDb } from './helpers';

describe('expenses split receipt integration', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('creates split expenses with exact allocated totals (proportional)', async () => {
    const prisma = getPrisma();
    const expenseCategory = await prisma.category.findFirstOrThrow({ where: { kind: 'expense', name: 'Parts' }, select: { id: true } });

    const payload = {
      date: '2026-03-01',
      allocationMethod: 'PROPORTIONAL_SUBTOTAL',
      totals: {
        totalTaxCents: 900,
        totalShippingCents: 300,
        totalOtherFeesCents: 100
      },
      lines: [
        { categoryId: expenseCategory.id, subtotalCents: 10000, notes: 'Line A' },
        { categoryId: expenseCategory.id, subtotalCents: 5000, notes: 'Line B' }
      ]
    };

    const response = await splitPost({ request: makeJsonRequest(payload) } as Parameters<typeof splitPost>[0]);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { success: boolean; splitGroupId: string };
    expect(body.success).toBe(true);

    const rows = await prisma.expense.findMany({ where: { splitGroupId: body.splitGroupId, archivedAt: null } });
    expect(rows).toHaveLength(2);

    const totalTax = rows.reduce((s, r) => s + r.taxCents, 0);
    const totalShipping = rows.reduce((s, r) => s + r.shippingCents, 0);
    const totalFees = rows.reduce((s, r) => s + r.otherFeesCents, 0);
    expect(totalTax).toBe(900);
    expect(totalShipping).toBe(300);
    expect(totalFees).toBe(100);

    for (const row of rows) {
      expect(row.amountCents).toBe(row.subtotalCents + row.taxCents + row.shippingCents + row.otherFeesCents);
    }
  });

  it('rejects manual allocations when totals mismatch', async () => {
    const prisma = getPrisma();
    const expenseCategory = await prisma.category.findFirstOrThrow({ where: { kind: 'expense', name: 'Parts' }, select: { id: true } });

    const payload = {
      date: '2026-03-01',
      allocationMethod: 'MANUAL',
      totals: {
        totalTaxCents: 100,
        totalShippingCents: 0,
        totalOtherFeesCents: 0
      },
      lines: [
        { categoryId: expenseCategory.id, subtotalCents: 1000, taxCents: 50, shippingCents: 0, otherFeesCents: 0 }
      ]
    };

    const response = await splitPost({ request: makeJsonRequest(payload) } as Parameters<typeof splitPost>[0]);
    expect(response.status).toBe(400);

    const body = (await response.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain('Manual allocations must match provided totals');
  });
});

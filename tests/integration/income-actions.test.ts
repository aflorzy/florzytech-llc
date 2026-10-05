import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { actions as incomeActions } from '../../src/routes/income/+page.server';
import { load as dashboardLoad } from '../../src/routes/+page.server';
import { disconnectDb, getPrisma, makeFormRequest, resetAndSeedDb } from './helpers';

function makeLoadEvent(url: string) {
  return { url: new URL(url) } as Parameters<typeof dashboardLoad>[0];
}

describe('income create action integration', () => {
  beforeEach(async () => {
    await resetAndSeedDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('Add Income create action updates dashboard moneyInNet and spendingPower', async () => {
    const prisma = getPrisma();

    const before = (await dashboardLoad(makeLoadEvent('http://localhost/'))) as any;

    const category = await prisma.category.findFirstOrThrow({ where: { kind: 'income', name: 'Repair Service' }, select: { id: true } });
    const channel = await prisma.salesChannel.findFirstOrThrow({ where: { name: 'In-Person' }, select: { id: true } });

    const request = makeFormRequest({
      date: '2026-03-01',
      type: 'SERVICE',
      amount: '250.00',
      categoryId: category.id,
      channelId: channel.id,
      platformFees: '10.00',
      paymentFees: '5.00',
      shippingRevenue: '2.00',
      shippingCost: '1.00',
      taxCollected: '0.00',
      notes: 'Integration test income'
    });

    const result = await incomeActions.create({ request } as Parameters<typeof incomeActions.create>[0]);
    expect(result).toEqual({ success: true });

    const after = (await dashboardLoad(makeLoadEvent('http://localhost/'))) as any;

    // Delta net = 25000 - 1000 - 500 - 100 + 200 = 23600
    expect(after.totals.moneyInNetCents - before.totals.moneyInNetCents).toBe(23600);
    expect(after.totals.spendingPowerCents - before.totals.spendingPowerCents).toBe(23600);
  });
});

import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

function zero(n: number | null | undefined): number { return n ?? 0; }

export const load: PageServerLoad = async () => {
  const now = new Date();
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);

  const [incomeAgg, expenseAgg, deviceAgg, incomeAgg30, expenseAgg30, deviceAgg30, deviceCounts] = await Promise.all([
    prisma.income.aggregate({
      where: { archivedAt: null },
      _sum: {
        amountCents: true,
        platformFeesCents: true,
        paymentFeesCents: true,
        shippingRevenueCents: true,
        shippingCostCents: true,
        taxCollectedCents: true
      }
    }),
    prisma.expense.aggregate({
      where: { archivedAt: null },
      _sum: { amountCents: true }
    }),
    prisma.device.aggregate({
      where: { archivedAt: null },
      _sum: { purchasePriceCents: true }
    }),
    prisma.income.aggregate({
      where: { archivedAt: null, date: { gte: d30 } },
      _sum: {
        amountCents: true,
        platformFeesCents: true,
        paymentFeesCents: true,
        shippingRevenueCents: true,
        shippingCostCents: true,
        taxCollectedCents: true
      }
    }),
    prisma.expense.aggregate({
      where: { archivedAt: null, date: { gte: d30 } },
      _sum: { amountCents: true }
    }),
    prisma.device.aggregate({
      where: { archivedAt: null, createdAt: { gte: d30 } },
      _sum: { purchasePriceCents: true }
    }),
    Promise.all([
      prisma.device.count({ where: { archivedAt: null } }),
      prisma.device.count({ where: { archivedAt: { not: null } } })
    ])
  ]);

  const [activeDevices, archivedDevices] = deviceCounts;

  const incomeSum = incomeAgg._sum;
  const incomeSum30 = incomeAgg30._sum;

  const moneyInNetCents = zero(incomeSum.amountCents) - zero(incomeSum.platformFeesCents) - zero(incomeSum.paymentFeesCents) - zero(incomeSum.shippingCostCents) + zero(incomeSum.shippingRevenueCents);
  const moneyInNetCents30 = zero(incomeSum30.amountCents) - zero(incomeSum30.platformFeesCents) - zero(incomeSum30.paymentFeesCents) - zero(incomeSum30.shippingCostCents) + zero(incomeSum30.shippingRevenueCents);

  const expensesCents = zero(expenseAgg._sum.amountCents);
  const expensesCents30 = zero(expenseAgg30._sum.amountCents);

  const devicePurchasesCents = zero(deviceAgg._sum.purchasePriceCents);
  const devicePurchasesCents30 = zero(deviceAgg30._sum.purchasePriceCents);

  const moneyOutCents = expensesCents + devicePurchasesCents;
  const moneyOutCents30 = expensesCents30 + devicePurchasesCents30;

  const spendingPowerCents = moneyInNetCents - moneyOutCents;
  const spendingPowerCents30 = moneyInNetCents30 - moneyOutCents30;

  return {
    totals: {
      moneyInNetCents,
      moneyOutCents,
      spendingPowerCents,
      taxesCollectedCents: zero(incomeSum.taxCollectedCents),
      feesCents: zero(incomeSum.platformFeesCents) + zero(incomeSum.paymentFeesCents),
      expensesCents,
      devicePurchasesCents
    },
    last30: {
      moneyInNetCents: moneyInNetCents30,
      moneyOutCents: moneyOutCents30,
      spendingPowerCents: spendingPowerCents30,
      taxesCollectedCents: zero(incomeSum30.taxCollectedCents),
      feesCents: zero(incomeSum30.platformFeesCents) + zero(incomeSum30.paymentFeesCents),
      expensesCents: expensesCents30,
      devicePurchasesCents: devicePurchasesCents30
    },
    devices: { activeDevices, archivedDevices }
  };
};

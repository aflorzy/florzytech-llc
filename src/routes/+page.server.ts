import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

function zero(n: number | null | undefined): number { return n ?? 0; }

export const load: PageServerLoad = async () => {
  const now = new Date();
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);

  const [incomeAgg, expenseAgg, incomeAgg30, expenseAgg30, deviceCounts, partsList, partsConsumed30, openWorkOrders] = await Promise.all([
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
    Promise.all([
      prisma.device.count({ where: { archivedAt: null } }),
      prisma.device.count({ where: { archivedAt: { not: null } } })
    ]),
    // Parts list to compute inventory value = quantity * averageCostCents
    prisma.part.findMany({ where: { archivedAt: null }, select: { id: true, quantity: true, averageCostCents: true } }),
    // Parts consumed in last 30 days (COGS from movements)
    prisma.partInventoryMovement.aggregate({ where: { archivedAt: null, type: 'CONSUME', createdAt: { gte: d30 } }, _sum: { totalCostCents: true } }),
    // Open work orders count (not cancelled or delivered)
    prisma.workOrder.count({ where: { archivedAt: null, status: { notIn: ['DELIVERED', 'CANCELLED'] } } })
  ]);

  const [activeDevices, archivedDevices] = deviceCounts;

  const incomeSum = incomeAgg._sum;
  const incomeSum30 = incomeAgg30._sum;

  const moneyInNetCents = zero(incomeSum.amountCents) - zero(incomeSum.platformFeesCents) - zero(incomeSum.paymentFeesCents) - zero(incomeSum.shippingCostCents) + zero(incomeSum.shippingRevenueCents);
  const moneyInNetCents30 = zero(incomeSum30.amountCents) - zero(incomeSum30.platformFeesCents) - zero(incomeSum30.paymentFeesCents) - zero(incomeSum30.shippingCostCents) + zero(incomeSum30.shippingRevenueCents);

  const expensesCents = zero(expenseAgg._sum.amountCents);
  const expensesCents30 = zero(expenseAgg30._sum.amountCents);

  const moneyOutCents = expensesCents; // device purchase price no longer used; all costs via Expenses
  const moneyOutCents30 = expensesCents30;

  const spendingPowerCents = moneyInNetCents - moneyOutCents;
  const spendingPowerCents30 = moneyInNetCents30 - moneyOutCents30;

  // Additional metrics
  const incomeGrossCents = zero(incomeSum.amountCents);
  const partsInventoryValueCents = partsList.reduce((s, p) => s + (zero(p.quantity) * zero(p.averageCostCents)), 0);
  const partsConsumedCents30 = zero(partsConsumed30._sum.totalCostCents);

  return {
    totals: {
      incomeGrossCents,
      moneyInNetCents,
      moneyOutCents,
      spendingPowerCents,
      taxesCollectedCents: zero(incomeSum.taxCollectedCents),
      feesCents: zero(incomeSum.platformFeesCents) + zero(incomeSum.paymentFeesCents),
      expensesCents,
      partsInventoryValueCents
    },
    last30: {
      moneyInNetCents: moneyInNetCents30,
      moneyOutCents: moneyOutCents30,
      spendingPowerCents: spendingPowerCents30,
      taxesCollectedCents: zero(incomeSum30.taxCollectedCents),
      feesCents: zero(incomeSum30.platformFeesCents) + zero(incomeSum30.paymentFeesCents),
      expensesCents: expensesCents30,
      partsConsumedCents: partsConsumedCents30
    },
    devices: { activeDevices, archivedDevices },
    workOrders: { open: openWorkOrders }
  };
};

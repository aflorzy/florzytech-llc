import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async ({ params }) => {
  const id = params.id;
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) {
    return { device: null };
  }

  const [expenseAgg, incomeAgg, expensesList, incomesList] = await Promise.all([
    prisma.expense.aggregate({ _sum: { amountCents: true }, where: { deviceId: id, archivedAt: null } }),
    prisma.income.aggregate({
      _sum: {
        amountCents: true,
        platformFeesCents: true,
        paymentFeesCents: true,
        shippingCostCents: true,
        shippingRevenueCents: true,
        taxCollectedCents: true
      },
      where: { deviceId: id, archivedAt: null }
    }),
    prisma.expense.findMany({
      where: { deviceId: id, archivedAt: null },
      orderBy: { date: 'desc' },
      include: { category: true, vendor: true, paymentMethod: true }
    }),
    prisma.income.findMany({
      where: { deviceId: id, archivedAt: null },
      orderBy: { date: 'desc' },
      include: { channel: true, category: true }
    })
  ]);

  const expensesTotalCents = expenseAgg._sum.amountCents || 0;
  const incomeTotalCents = incomeAgg._sum.amountCents || 0;
  const fees = (incomeAgg._sum.platformFeesCents || 0) + (incomeAgg._sum.paymentFeesCents || 0);
  const shippingNet = (incomeAgg._sum.shippingRevenueCents || 0) - (incomeAgg._sum.shippingCostCents || 0);
  const taxCollected = incomeAgg._sum.taxCollectedCents || 0;

  const netProfitCents = incomeTotalCents - expensesTotalCents - fees + shippingNet; // taxCollected excluded from profit

  return {
    device,
    summary: { expenses: expensesTotalCents, income: incomeTotalCents, fees, shippingNet, taxCollected, netProfitCents },
    expenses: expensesList,
    incomes: incomesList
  };
};

import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async ({ params }) => {
  const id = params.id;
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) {
    return { device: null };
  }

  const [expenseAgg, incomeAgg] = await Promise.all([
    prisma.expense.aggregate({ _sum: { amountCents: true }, where: { deviceId: id } }),
    prisma.income.aggregate({
      _sum: {
        amountCents: true,
        platformFeesCents: true,
        paymentFeesCents: true,
        shippingCostCents: true,
        shippingRevenueCents: true,
        taxCollectedCents: true
      },
      where: { deviceId: id }
    })
  ]);

  const expenses = expenseAgg._sum.amountCents || 0;
  const income = incomeAgg._sum.amountCents || 0;
  const fees = (incomeAgg._sum.platformFeesCents || 0) + (incomeAgg._sum.paymentFeesCents || 0);
  const shippingNet = (incomeAgg._sum.shippingRevenueCents || 0) - (incomeAgg._sum.shippingCostCents || 0);
  const taxCollected = incomeAgg._sum.taxCollectedCents || 0;

  const netProfitCents = income - device.purchasePriceCents - expenses - fees + shippingNet; // taxCollected excluded from profit

  return { device, summary: { expenses, income, fees, shippingNet, taxCollected, netProfitCents } };
};

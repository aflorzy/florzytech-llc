import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import { loadDeviceFinancials, loadDeviceIncomes, loadPartsUsed } from '$lib/server/device-financials';

export const load: PageServerLoad = async ({ params }) => {
  const id = params.id;
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) {
    return { device: null };
  }

  const [financials, expensesList, incomesList, partsUsed] = await Promise.all([
    loadDeviceFinancials([id]),
    prisma.expense.findMany({
      where: { deviceId: id, archivedAt: null },
      orderBy: { date: 'desc' },
      include: { category: true, vendor: true, paymentMethod: true, partMovements: { where: { type: 'RECEIPT', archivedAt: null }, select: { id: true } } }
    }),
    loadDeviceIncomes(id),
    loadPartsUsed([id])
  ]);
  const f = financials.get(id)!;

  return {
    device,
    summary: {
      expenses: f.expensesCents,
      stockedExpenses: f.stockedExpensesCents,
      partsConsumed: f.partsConsumedCents,
      income: f.incomeCents,
      fees: f.feesCents,
      shippingNet: f.shippingNetCents,
      taxCollected: f.taxCollectedCents,
      netProfitCents: f.netCents
    },
    expenses: expensesList.map(({ partMovements, ...e }) => ({ ...e, stocked: partMovements.length > 0 })),
    incomes: incomesList,
    partsUsed
  };
};

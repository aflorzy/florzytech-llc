import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async ({ params }) => {
  const groupId = params.groupId;
  const [lines, categories, vendors, paymentMethods, devices] = await Promise.all([
    prisma.expense.findMany({
      where: { splitGroupId: groupId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { category: true, vendor: true, paymentMethod: true, device: true }
    }),
    prisma.category.findMany({ where: { kind: 'expense', active: true }, orderBy: { name: 'asc' } }),
    prisma.vendor.findMany({ where: { active: true, archivedAt: null }, orderBy: { name: 'asc' } }),
    prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.device.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 200 })
  ]);

  if (lines.length === 0) {
    return { groupId, lines: [], totals: { tax: 0, shipping: 0, fees: 0 }, categories, vendors, paymentMethods, devices };
  }

  const head = lines[0];
  const totals = lines.reduce(
    (acc, l) => {
      acc.tax += l.taxCents || 0;
      acc.shipping += l.shippingCents || 0;
      acc.fees += l.otherFeesCents || 0;
      return acc;
    },
    { tax: 0, shipping: 0, fees: 0 }
  );

  return {
    groupId,
    lines,
    header: {
      date: head.date,
      vendorId: head.vendorId || null,
      paymentMethodId: head.paymentMethodId || null,
      allocationMethod: head.allocationMethod || null,
      vendorOrderNumber: head.vendorOrderNumber || null
    },
    totals,
    categories,
    vendors,
    paymentMethods,
    devices
  };
};

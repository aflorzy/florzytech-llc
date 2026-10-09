import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import { IncomeType } from '@prisma/client';
import { markWorkOrdersInvoiced } from '$lib/server/work-order-pricing';

function toCents(v: FormDataEntryValue | null) {
  const n = typeof v === 'string' ? parseFloat(v) : 0;
  return Math.round((n || 0) * 100);
}

function parseLocalDate(v: FormDataEntryValue | null): Date {
  const s = typeof v === 'string' ? v : '';
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export const load: PageServerLoad = async ({ url }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  // The filter is in local calendar days, like the date stored on each income
  const dateWhere: { gte?: Date; lte?: Date } = {};
  if (from) dateWhere.gte = parseLocalDate(from);
  if (to) { const t = parseLocalDate(to); t.setHours(23,59,59,999); dateWhere.lte = t; }
  const where = { archivedAt: null, ...(from || to ? { date: dateWhere } : {}) } as const;

  const [income, channels, devices, categories, customers, workOrders] = await Promise.all([
    prisma.income.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { channel: true, device: true, category: true, customer: true, workOrder: true }
    }),
    prisma.salesChannel.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.device.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.category.findMany({ where: { kind: 'income', active: true }, orderBy: { name: 'asc' } }),
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } }),
    prisma.workOrder.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 })
  ]);
  return { income, channels, devices, categories, customers, workOrders, filters: { from, to } };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const typeStr = String(form.get('type') || 'SALE') as keyof typeof IncomeType;
    const date = parseLocalDate(form.get('date'));
    const amountCents = toCents(form.get('amount'));
    const deviceId = String(form.get('deviceId') || '') || null;
    const channelId = String(form.get('channelId') || '') || null;
    const categoryId = String(form.get('categoryId') || '') || null;
    const platformFeesCents = toCents(form.get('platformFees'));
    const paymentFeesCents = toCents(form.get('paymentFees'));
    const shippingRevenueCents = toCents(form.get('shippingRevenue'));
    const shippingCostCents = toCents(form.get('shippingCost'));
    const taxCollectedCents = toCents(form.get('taxCollected'));
    const notes = String(form.get('notes') || '') || null;
    const customerId = String(form.get('customerId') || '') || null;
    const workOrderId = String(form.get('workOrderId') || '') || null;

    await prisma.$transaction(async (tx) => {
      await tx.income.create({
        data: {
          type: IncomeType[typeStr],
          date,
          amountCents,
          deviceId,
          channelId,
          categoryId,
          platformFeesCents,
          paymentFeesCents,
          shippingRevenueCents,
          shippingCostCents,
          taxCollectedCents,
          notes,
          customerId,
          workOrderId
        }
      });
      // The first payment against a work order marks it invoiced, as of the income's date
      await markWorkOrdersInvoiced(tx, [workOrderId], date);
    });
    return { success: true };
  },
  update: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };

    const typeStr = String(form.get('type') || 'SALE') as keyof typeof IncomeType;
    const date = parseLocalDate(form.get('date'));
    const amountCents = toCents(form.get('amount'));
    const deviceId = String(form.get('deviceId') || '') || null;
    const channelId = String(form.get('channelId') || '') || null;
    const categoryId = String(form.get('categoryId') || '') || null;
    const platformFeesCents = toCents(form.get('platformFees'));
    const paymentFeesCents = toCents(form.get('paymentFees'));
    const shippingRevenueCents = toCents(form.get('shippingRevenue'));
    const shippingCostCents = toCents(form.get('shippingCost'));
    const taxCollectedCents = toCents(form.get('taxCollected'));
    const notes = String(form.get('notes') || '') || null;
    const customerId = String(form.get('customerId') || '') || null;
    const workOrderId = String(form.get('workOrderId') || '') || null;

    await prisma.$transaction(async (tx) => {
      const previous = await tx.income.findUnique({ where: { id }, select: { workOrderId: true } });
      await tx.income.update({
        where: { id },
        data: {
          type: IncomeType[typeStr],
          date,
          amountCents,
          deviceId,
          channelId,
          categoryId,
          platformFeesCents,
          paymentFeesCents,
          shippingRevenueCents,
          shippingCostCents,
          taxCollectedCents,
          notes,
          customerId,
          workOrderId
        }
      });
      // Pointing an income at a work order is a payment against it and marks it invoiced.
      // Editing an income that was already on the work order is not a new payment.
      if (workOrderId !== (previous?.workOrderId ?? null)) await markWorkOrdersInvoiced(tx, [workOrderId], date);
    });

    return { success: true, id };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    await prisma.income.update({ where: { id }, data: { archivedAt: new Date() } });
    return { success: true, id };
  }
};

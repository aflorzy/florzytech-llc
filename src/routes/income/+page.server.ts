import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import { IncomeType } from '@prisma/client';

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

export const load: PageServerLoad = async () => {
  const [income, channels, devices] = await Promise.all([
    prisma.income.findMany({
      where: { archivedAt: null },
      orderBy: { date: 'desc' },
      take: 100,
      include: { channel: true, device: true }
    }),
    prisma.salesChannel.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.device.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 })
  ]);
  return { income, channels, devices };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const typeStr = String(form.get('type') || 'SALE') as keyof typeof IncomeType;
    const date = parseLocalDate(form.get('date'));
    const amountCents = toCents(form.get('amount'));
    const deviceId = String(form.get('deviceId') || '') || null;
    const channelId = String(form.get('channelId') || '') || null;
    const platformFeesCents = toCents(form.get('platformFees'));
    const paymentFeesCents = toCents(form.get('paymentFees'));
    const shippingRevenueCents = toCents(form.get('shippingRevenue'));
    const shippingCostCents = toCents(form.get('shippingCost'));
    const taxCollectedCents = toCents(form.get('taxCollected'));
    const notes = String(form.get('notes') || '') || null;

    await prisma.income.create({
      data: {
        type: IncomeType[typeStr],
        date,
        amountCents,
        deviceId,
        channelId,
        platformFeesCents,
        paymentFeesCents,
        shippingRevenueCents,
        shippingCostCents,
        taxCollectedCents,
        notes
      }
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
    const platformFeesCents = toCents(form.get('platformFees'));
    const paymentFeesCents = toCents(form.get('paymentFees'));
    const shippingRevenueCents = toCents(form.get('shippingRevenue'));
    const shippingCostCents = toCents(form.get('shippingCost'));
    const taxCollectedCents = toCents(form.get('taxCollected'));
    const notes = String(form.get('notes') || '') || null;

    await prisma.income.update({
      where: { id },
      data: {
        type: IncomeType[typeStr],
        date,
        amountCents,
        deviceId,
        channelId,
        platformFeesCents,
        paymentFeesCents,
        shippingRevenueCents,
        shippingCostCents,
        taxCollectedCents,
        notes
      }
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

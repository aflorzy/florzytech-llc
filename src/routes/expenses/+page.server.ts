import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

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
  const [expenses, categories, vendors, paymentMethods, devices] = await Promise.all([
    prisma.expense.findMany({
      where: { archivedAt: null },
      orderBy: { date: 'desc' },
      take: 100,
      include: { category: true, vendor: true, paymentMethod: true, device: true }
    }),
    prisma.category.findMany({ where: { kind: 'expense', active: true }, orderBy: { name: 'asc' } }),
    prisma.vendor.findMany({ where: { active: true, archivedAt: null }, orderBy: { name: 'asc' } }),
    prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.device.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 })
  ]);
  return { expenses, categories, vendors, paymentMethods, devices };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const amountCents = toCents(form.get('amount'));
    const date = parseLocalDate(form.get('date'));
    const categoryId = String(form.get('categoryId'));
    const vendorId = String(form.get('vendorId') || '') || null;
    const paymentMethodId = String(form.get('paymentMethodId') || '') || null;
    const deviceId = String(form.get('deviceId') || '') || null;
    const notes = String(form.get('notes') || '') || null;

    await prisma.expense.create({
      data: {
        amountCents,
        date,
        categoryId,
        vendorId,
        paymentMethodId,
        deviceId,
        notes
      }
    });

    return { success: true };
  },
  update: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };

    const amountCents = toCents(form.get('amount'));
    const date = parseLocalDate(form.get('date'));
    const categoryId = String(form.get('categoryId'));
    const vendorId = String(form.get('vendorId') || '') || null;
    const paymentMethodId = String(form.get('paymentMethodId') || '') || null;
    const deviceId = String(form.get('deviceId') || '') || null;
    const notes = String(form.get('notes') || '') || null;

    await prisma.expense.update({
      where: { id },
      data: { amountCents, date, categoryId, vendorId, paymentMethodId, deviceId, notes }
    });
    return { success: true, id };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    await prisma.expense.update({ where: { id }, data: { archivedAt: new Date() } });
    return { success: true, id };
  }
};

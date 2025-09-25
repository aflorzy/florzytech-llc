import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import { allocateProportional, allocateEven, type AllocationMethod } from '$lib/allocation';
import { randomUUID } from 'crypto';

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
        subtotalCents: amountCents,
        taxCents: 0,
        shippingCents: 0,
        otherFeesCents: 0,
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
  split: async ({ request }) => {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { success: false, error: 'Expected JSON payload' };
    }
    type Line = {
      categoryId: string;
      deviceId?: string | null;
      notes?: string | null;
      subtotalCents: number;
      taxCents?: number;
      shippingCents?: number;
      otherFeesCents?: number;
    };
    type Payload = {
      date: string;
      vendorId?: string | null;
      paymentMethodId?: string | null;
      receiptNotes?: string | null;
      allocationMethod: AllocationMethod;
      totals: { totalTaxCents: number; totalShippingCents: number; totalOtherFeesCents: number };
      lines: Line[];
    };
    const body = (await request.json()) as Payload;
    const date = parseLocalDate(body.date);
    const vendorId = body.vendorId || null;
    const paymentMethodId = body.paymentMethodId || null;
    const receiptNotes = (body.receiptNotes || '').trim() || null;
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) return { success: false, error: 'No lines provided' };
    for (const l of lines) {
      if (!l.categoryId) return { success: false, error: 'Each line requires categoryId' };
      if (!(Number.isFinite(l.subtotalCents) && l.subtotalCents >= 0)) return { success: false, error: 'Invalid line subtotal' };
    }

    const method = body.allocationMethod;
    let allocated = lines.map((l) => ({
      subtotalCents: Math.floor(l.subtotalCents),
      taxCents: Math.floor(l.taxCents || 0),
      shippingCents: Math.floor(l.shippingCents || 0),
      otherFeesCents: Math.floor(l.otherFeesCents || 0)
    }));

    if (method === 'PROPORTIONAL_SUBTOTAL' || method === 'EVEN') {
      const allocator = method === 'PROPORTIONAL_SUBTOTAL' ? allocateProportional : allocateEven;
      allocated = allocator(
        lines.map((l) => ({ subtotalCents: Math.floor(l.subtotalCents) })),
        {
          totalTaxCents: Math.floor(body.totals.totalTaxCents || 0),
          totalShippingCents: Math.floor(body.totals.totalShippingCents || 0),
          totalOtherFeesCents: Math.floor(body.totals.totalOtherFeesCents || 0)
        }
      ).map((a) => ({
        subtotalCents: a.subtotalCents,
        taxCents: a.taxCents,
        shippingCents: a.shippingCents,
        otherFeesCents: a.otherFeesCents
      }));
    } else {
      // MANUAL: verify totals match if provided
      const sum = (arr: number[]) => arr.reduce((x, y) => x + Math.floor(y || 0), 0);
      const taxSum = sum(allocated.map((a) => a.taxCents));
      const shipSum = sum(allocated.map((a) => a.shippingCents));
      const feeSum = sum(allocated.map((a) => a.otherFeesCents));
      const t = body.totals || { totalTaxCents: taxSum, totalShippingCents: shipSum, totalOtherFeesCents: feeSum };
      if (t.totalTaxCents !== taxSum || t.totalShippingCents !== shipSum || t.totalOtherFeesCents !== feeSum) {
        return { success: false, error: 'Manual allocations must match provided totals' };
      }
    }

    const splitGroupId = randomUUID();
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const a = allocated[i];
        const amountCents = a.subtotalCents + a.taxCents + a.shippingCents + a.otherFeesCents;
        const notes = (line.notes || receiptNotes) || null;
        await tx.expense.create({
          data: {
            date,
            amountCents,
            subtotalCents: a.subtotalCents,
            taxCents: a.taxCents,
            shippingCents: a.shippingCents,
            otherFeesCents: a.otherFeesCents,
            allocationMethod: method,
            splitGroupId,
            categoryId: line.categoryId,
            vendorId,
            paymentMethodId,
            deviceId: line.deviceId || null,
            notes
          }
        });
      }
    });

    return { success: true, splitGroupId };
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

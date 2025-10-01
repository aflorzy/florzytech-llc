import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import { IncomeType, IncomeLineType, DeviceStatus, PartInventoryMovementType } from '@prisma/client';

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
  const dateWhere: { gte?: Date; lte?: Date } = {};
  if (from) dateWhere.gte = new Date(from);
  if (to) { const t = new Date(to); t.setHours(23,59,59,999); dateWhere.lte = t; }
  const where = { archivedAt: null, ...(from || to ? { date: dateWhere } : {}) } as const;

  const [income, channels, devices, categories, customers, workOrders, parts] = await Promise.all([
    prisma.income.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { channel: true, device: true, category: true, customer: true, workOrder: true }
    }),
    prisma.salesChannel.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.device.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.category.findMany({ where: { kind: 'income', active: true }, orderBy: { name: 'asc' } }),
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } }),
    prisma.workOrder.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.part.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' }, take: 500 })
  ]);
  return { income, channels, devices, categories, customers, workOrders, parts, filters: { from, to } };
};

export const actions: Actions = {
  create_lines: async ({ request }) => {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { success: false, error: 'Expected JSON payload' };
    }
    type Line = {
      type: 'DEVICE' | 'PART' | 'LABOR' | 'OTHER';
      amountCents: number;
      description?: string | null;
      deviceId?: string | null;
      partId?: string | null;
      quantity?: number | null;
      workOrderId?: string | null;
    };
    type Payload = {
      date: string; // yyyy-mm-dd
      type: 'SALE' | 'SERVICE' | 'DEPOSIT';
      channelId?: string | null;
      workOrderId?: string | null;
      customerId?: string | null;
      notes?: string | null;
      platformFeesCents?: number;
      paymentFeesCents?: number;
      shippingRevenueCents?: number;
      shippingCostCents?: number;
      taxCollectedCents?: number;
      lines: Line[];
    };
    let body: Payload;
    try {
      body = (await request.json()) as Payload;
    } catch {
      return { success: false, error: 'Invalid JSON' };
    }
    const parseLocal = (s: string): Date => {
      const [y, m, d] = (s || '').split('-').map((n) => parseInt(n, 10));
      return new Date(y, (m || 1) - 1, d || 1);
    };
    const date = parseLocal(body.date);
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) return { success: false, error: 'At least one line required' };
    const totalLines = lines.reduce((s, l) => s + Math.floor(l.amountCents || 0), 0);
    if (!(Number.isFinite(totalLines) && totalLines > 0)) return { success: false, error: 'Invalid line totals' };

    const alloc = (total: number, amount: number) => Math.floor(((total || 0) * (amount || 0)) / totalLines);

    const inc = await prisma.$transaction(async (tx) => {
      const income = await tx.income.create({
        data: {
          date,
          type: IncomeType[body.type || 'SALE'],
          amountCents: totalLines,
          channelId: body.channelId || null,
          workOrderId: body.workOrderId || null,
          customerId: body.customerId || null,
          notes: (body.notes || '').trim() || null,
          platformFeesCents: Math.floor(body.platformFeesCents || 0),
          paymentFeesCents: Math.floor(body.paymentFeesCents || 0),
          shippingRevenueCents: Math.floor(body.shippingRevenueCents || 0),
          shippingCostCents: Math.floor(body.shippingCostCents || 0),
          taxCollectedCents: Math.floor(body.taxCollectedCents || 0)
        }
      });

      for (const ln of lines) {
        const amount = Math.floor(ln.amountCents || 0);
        const allocatedPlatform = alloc(Math.floor(body.platformFeesCents || 0), amount);
        const allocatedPayment = alloc(Math.floor(body.paymentFeesCents || 0), amount);
        const allocatedShipRev = alloc(Math.floor(body.shippingRevenueCents || 0), amount);
        const allocatedShipCost = alloc(Math.floor(body.shippingCostCents || 0), amount);
        const allocatedTax = alloc(Math.floor(body.taxCollectedCents || 0), amount);

        await tx.incomeLine.create({
          data: {
            incomeId: income.id,
            type: IncomeLineType[ln.type],
            description: (ln.description || '').trim() || null,
            amountCents: amount,
            quantity: ln.quantity || null,
            deviceId: ln.deviceId || null,
            partId: ln.partId || null,
            workOrderId: ln.workOrderId || body.workOrderId || null,
            allocatedPlatformFeesCents: allocatedPlatform,
            allocatedPaymentFeesCents: allocatedPayment,
            allocatedShippingRevenueCents: allocatedShipRev,
            allocatedShippingCostCents: allocatedShipCost,
            allocatedTaxCents: allocatedTax
          }
        });

        // If DEVICE sale, mark device SOLD if not already SOLD/SHIPPED/DELIVERED
        if (ln.type === 'DEVICE' && ln.deviceId) {
          const d = await tx.device.findUnique({ where: { id: ln.deviceId }, select: { id: true, status: true } });
          if (d && !['SOLD', 'SHIPPED', 'DELIVERED'].includes(d.status as string)) {
            await tx.device.update({ where: { id: d.id }, data: { status: DeviceStatus.SOLD } });
          }
        }

        // If PART sale line, auto-consume inventory using average cost snapshot
        if (ln.type === 'PART' && ln.partId && (ln.quantity || 0) > 0) {
          const qty = Math.floor(ln.quantity || 0);
          const part = await tx.part.findUnique({ where: { id: ln.partId }, select: { id: true, quantity: true, averageCostCents: true } });
          if (!part) throw new Error('Part not found');
          if ((part.quantity || 0) < qty) throw new Error('Insufficient stock for part sale');

          const unitCost = Math.max(0, part.averageCostCents || 0);
          const totalCost = unitCost * qty;
          await tx.part.update({ where: { id: part.id }, data: { quantity: (part.quantity || 0) - qty } });
          await tx.partInventoryMovement.create({
            data: {
              type: PartInventoryMovementType.CONSUME,
              partId: part.id,
              quantity: qty,
              unitCostCents: unitCost,
              totalCostCents: totalCost,
              workOrderId: ln.workOrderId || body.workOrderId || null
            }
          });
        }
      }

      return income;
    });

    return { success: true, id: inc.id };
  },
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

    await prisma.income.create({
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
        notes,
        customerId: String(form.get('customerId') || '') || null,
        workOrderId: String(form.get('workOrderId') || '') || null
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
    const categoryId = String(form.get('categoryId') || '') || null;
    const platformFeesCents = toCents(form.get('platformFees'));
    const paymentFeesCents = toCents(form.get('paymentFees'));
    const shippingRevenueCents = toCents(form.get('shippingRevenue'));
    const shippingCostCents = toCents(form.get('shippingCost'));
    const taxCollectedCents = toCents(form.get('taxCollected'));
    const notes = String(form.get('notes') || '') || null;
    const customerId = String(form.get('customerId') || '') || null;
    const workOrderId = String(form.get('workOrderId') || '') || null;

    await prisma.income.update({
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

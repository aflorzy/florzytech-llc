import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';

function parseLocalDateStr(s: string): Date {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export const PUT: RequestHandler = async ({ request, params }) => {
  const groupId = params.groupId;
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return new Response(JSON.stringify({ success: false, error: 'Expected JSON payload' }), { status: 400 });
  }

  type Line = {
    id?: string;
    categoryId: string;
    deviceId?: string | null;
    notes?: string | null;
    subtotalCents: number;
    taxCents: number;
    shippingCents: number;
    otherFeesCents: number;
  };
  type Payload = {
    date: string;
    vendorId?: string | null;
    paymentMethodId?: string | null;
    vendorOrderNumber?: string | null;
    allocationMethod: 'PROPORTIONAL_SUBTOTAL' | 'EVEN' | 'MANUAL';
    totals: { totalTaxCents: number; totalShippingCents: number; totalOtherFeesCents: number };
    lines: Line[];
  };

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { status: 400 });
  }

  const date = parseLocalDateStr(body.date);
  const vendorId = body.vendorId || null;
  const paymentMethodId = body.paymentMethodId || null;
  const vendorOrderNumber = (body.vendorOrderNumber || '').trim() || null;
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) return new Response(JSON.stringify({ success: false, error: 'No lines provided' }), { status: 400 });
  for (const l of lines) {
    if (!l.categoryId) return new Response(JSON.stringify({ success: false, error: 'Each line requires categoryId' }), { status: 400 });
    const ok = [l.subtotalCents, l.taxCents, l.shippingCents, l.otherFeesCents].every((n) => Number.isFinite(n) && n >= 0);
    if (!ok) return new Response(JSON.stringify({ success: false, error: 'Invalid numeric values' }), { status: 400 });
  }
  // If manual, ensure provided totals match sums
  if (body.allocationMethod === 'MANUAL') {
    const taxSum = lines.reduce((s, l) => s + Math.floor(l.taxCents || 0), 0);
    const shipSum = lines.reduce((s, l) => s + Math.floor(l.shippingCents || 0), 0);
    const feeSum = lines.reduce((s, l) => s + Math.floor(l.otherFeesCents || 0), 0);
    const t = body.totals || { totalTaxCents: taxSum, totalShippingCents: shipSum, totalOtherFeesCents: feeSum };
    if (t.totalTaxCents !== taxSum || t.totalShippingCents !== shipSum || t.totalOtherFeesCents !== feeSum) {
      return new Response(JSON.stringify({ success: false, error: 'Manual allocations must match provided totals' }), { status: 400 });
    }
  }

  const existing = await prisma.expense.findMany({
    where: { splitGroupId: groupId, archivedAt: null },
    select: { id: true }
  });
  const existingIds = new Set(existing.map((e) => e.id));
  const incomingIds = new Set(lines.filter((l) => !!l.id).map((l) => String(l.id)));
  const toArchive = [...existingIds].filter((id) => !incomingIds.has(id));

  await prisma.$transaction(async (tx) => {
    // Archive removed lines (soft delete)
    for (const id of toArchive) {
      await tx.expense.update({ where: { id }, data: { archivedAt: new Date() } });
    }
    // Upsert provided lines
    for (const l of lines) {
      const amountCents = l.subtotalCents + l.taxCents + l.shippingCents + l.otherFeesCents;
      if (l.id) {
        await tx.expense.update({
          where: { id: l.id },
          data: {
            date,
            vendorId,
            paymentMethodId,
            vendorOrderNumber,
            categoryId: l.categoryId,
            deviceId: l.deviceId || null,
            notes: (l.notes || '').trim() || null,
            amountCents,
            subtotalCents: l.subtotalCents,
            taxCents: l.taxCents,
            shippingCents: l.shippingCents,
            otherFeesCents: l.otherFeesCents,
            allocationMethod: body.allocationMethod
          }
        });
      } else {
        await tx.expense.create({
          data: {
            splitGroupId: groupId,
            date,
            vendorId,
            paymentMethodId,
            vendorOrderNumber,
            categoryId: l.categoryId,
            deviceId: l.deviceId || null,
            notes: (l.notes || '').trim() || null,
            amountCents,
            subtotalCents: l.subtotalCents,
            taxCents: l.taxCents,
            shippingCents: l.shippingCents,
            otherFeesCents: l.otherFeesCents,
            allocationMethod: body.allocationMethod
          }
        });
      }
    }
  });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};

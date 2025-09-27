import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { allocateProportional, allocateEven, type AllocationMethod } from '$lib/allocation';
import { randomUUID } from 'crypto';

function parseLocalDateStr(s: string): Date {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export const POST: RequestHandler = async ({ request }) => {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return new Response(JSON.stringify({ success: false, error: 'Expected JSON payload' }), { status: 400 });
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
    vendorOrderNumber?: string | null;
    allocationMethod: AllocationMethod;
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
  const receiptNotes = (body.receiptNotes || '').trim() || null;
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) return new Response(JSON.stringify({ success: false, error: 'No lines provided' }), { status: 400 });
  for (const l of lines) {
    if (!l.categoryId) return new Response(JSON.stringify({ success: false, error: 'Each line requires categoryId' }), { status: 400 });
    if (!(Number.isFinite(l.subtotalCents) && l.subtotalCents >= 0)) return new Response(JSON.stringify({ success: false, error: 'Invalid line subtotal' }), { status: 400 });
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
      return new Response(JSON.stringify({ success: false, error: 'Manual allocations must match provided totals' }), { status: 400 });
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
          notes,
          vendorOrderNumber: (body.vendorOrderNumber || undefined)
        }
      });
    }
  });

  return new Response(JSON.stringify({ success: true, splitGroupId }), { status: 200 });
}

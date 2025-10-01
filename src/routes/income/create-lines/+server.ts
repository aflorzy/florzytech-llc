import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { IncomeType, IncomeLineType, DeviceStatus, PartInventoryMovementType } from '@prisma/client';

export const POST: RequestHandler = async ({ request }) => {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return new Response(JSON.stringify({ success: false, error: 'Expected JSON payload' }), { status: 400 });
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
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { status: 400 });
  }

  const parseLocal = (s: string): Date => {
    const [y, m, d] = (s || '').split('-').map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const date = parseLocal(body.date);
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) return new Response(JSON.stringify({ success: false, error: 'At least one line required' }), { status: 400 });
  const totalLines = lines.reduce((s, l) => s + Math.floor(l.amountCents || 0), 0);
  if (!(Number.isFinite(totalLines) && totalLines > 0)) return new Response(JSON.stringify({ success: false, error: 'Invalid line totals' }), { status: 400 });

  const alloc = (total: number, amount: number) => Math.floor(((total || 0) * (amount || 0)) / totalLines);

  try {
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

        if (ln.type === 'DEVICE' && ln.deviceId) {
          const d = await tx.device.findUnique({ where: { id: ln.deviceId }, select: { id: true, status: true } });
          if (d && !['SOLD', 'SHIPPED', 'DELIVERED'].includes(d.status as string)) {
            await tx.device.update({ where: { id: d.id }, data: { status: DeviceStatus.SOLD } });
          }
        }

        if (ln.type === 'PART' && ln.partId && (ln.quantity || 0) > 0) {
          const qty = Math.floor(ln.quantity || 0);
          const part = await tx.part.findUnique({ where: { id: ln.partId }, select: { id: true, quantity: true, averageCostCents: true } });
          if (!part) throw new Response(JSON.stringify({ success: false, error: 'Part not found' }), { status: 400 });
          if ((part.quantity || 0) < qty) throw new Response(JSON.stringify({ success: false, error: 'Insufficient stock for part sale' }), { status: 400 });

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

    return new Response(JSON.stringify({ success: true, id: inc.id }), { status: 200 });
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ success: false, error: 'Failed to save income with lines' }), { status: 500 });
  }
};

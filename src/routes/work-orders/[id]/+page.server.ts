import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { WorkOrderItemType, WorkOrderDeviceRole, WorkOrderStatus, WorkOrderTargetAction, PartInventoryMovementType } from '@prisma/client';

export const load: PageServerLoad = async ({ params }) => {
  const id = params.id;
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      devices: {
        where: { archivedAt: null },
        include: { device: true },
        orderBy: { createdAt: 'asc' }
      },
      items: {
        where: { archivedAt: null },
        include: { part: true, device: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  // Income lines tied to this work order (for revenue and fee allocations)
  const incomeLines = await prisma.incomeLine.findMany({
    where: { workOrderId: id, archivedAt: null },
    select: {
      amountCents: true,
      allocatedPlatformFeesCents: true,
      allocatedPaymentFeesCents: true,
      allocatedShippingRevenueCents: true,
      allocatedShippingCostCents: true
    }
  });
  // If there are no income lines, fall back to Income heads linked to this WO
  const incomeHeads = incomeLines.length === 0
    ? await prisma.income.findMany({
        where: { workOrderId: id, archivedAt: null },
        select: {
          amountCents: true,
          platformFeesCents: true,
          paymentFeesCents: true,
          shippingRevenueCents: true,
          shippingCostCents: true
        }
      })
    : [];

  // Compute parts cost from WO items (snapshot cost * qty)
  const partsCostCents = (workOrder?.items || []).reduce((sum, it) => {
    if (it.type === 'PART') {
      const qty = it.quantity || 0;
      const unit = it.unitCostCentsSnapshot || 0;
      return sum + (qty * unit);
    }
    return sum;
  }, 0);
  const laborPlannedCents = (workOrder?.items || []).reduce((sum, it) => {
    if (it.type === 'LABOR') return sum + (it.amountCents || 0);
    return sum;
  }, 0);
  const incomeTotalsFromLines = incomeLines.reduce(
    (acc, ln) => {
      acc.gross += ln.amountCents || 0;
      acc.shipRev += ln.allocatedShippingRevenueCents || 0;
      acc.platform += ln.allocatedPlatformFeesCents || 0;
      acc.payment += ln.allocatedPaymentFeesCents || 0;
      acc.shipCost += ln.allocatedShippingCostCents || 0;
      return acc;
    },
    { gross: 0, platform: 0, payment: 0, shipRev: 0, shipCost: 0 }
  );
  const incomeTotalsFromHeads = incomeHeads.reduce(
    (acc, h) => {
      acc.gross += h.amountCents || 0;
      acc.shipRev += h.shippingRevenueCents || 0;
      acc.platform += h.platformFeesCents || 0;
      acc.payment += h.paymentFeesCents || 0;
      acc.shipCost += h.shippingCostCents || 0;
      return acc;
    },
    { gross: 0, platform: 0, payment: 0, shipRev: 0, shipCost: 0 }
  );
  const incomeTotals = incomeLines.length > 0 ? incomeTotalsFromLines : incomeTotalsFromHeads;
  const netRevenueCents = incomeTotals.gross + incomeTotals.shipRev - incomeTotals.platform - incomeTotals.payment - incomeTotals.shipCost;

  // Device-linked expenses: include all non-archived expenses linked to devices in this WO
  const deviceIds = (workOrder?.devices || []).map((od) => od.device.id);
  const deviceExpenses = deviceIds.length > 0
    ? await prisma.expense.findMany({ where: { archivedAt: null, deviceId: { in: deviceIds } }, select: { amountCents: true } })
    : [];
  const deviceExpensesCents = deviceExpenses.reduce((s, e) => s + (e.amountCents || 0), 0);

  const profitCents = netRevenueCents - partsCostCents - deviceExpensesCents;

  const [customers, devices, parts] = await Promise.all([
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } }),
    prisma.device.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.part.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' }, take: 500 })
  ]);
  return {
    workOrder,
    customers,
    devices,
    parts,
    summary: {
      partsCostCents,
      laborPlannedCents,
      income: {
        grossCents: incomeTotals.gross,
        platformFeesCents: incomeTotals.platform,
        paymentFeesCents: incomeTotals.payment,
        shippingRevenueCents: incomeTotals.shipRev,
        shippingCostCents: incomeTotals.shipCost,
        netRevenueCents
      },
      deviceExpensesCents,
      profitCents
    }
  };
};

export const actions: Actions = {
  update_header: async ({ request, params }) => {
    const id = params.id;
    const form = await request.formData();
    const data: {
      status?: WorkOrderStatus;
      targetAction?: WorkOrderTargetAction;
      customerId?: string | null;
      notes?: string | null;
    } = {};
    if (form.has('status')) {
      const s = String(form.get('status') || '').trim();
      if (s) data.status = WorkOrderStatus[s as keyof typeof WorkOrderStatus];
    }
    if (form.has('targetAction')) {
      const t = String(form.get('targetAction') || '').trim();
      if (t) data.targetAction = WorkOrderTargetAction[t as keyof typeof WorkOrderTargetAction];
    }
    if (form.has('customerId')) data.customerId = (String(form.get('customerId') || '') || null);
    if (form.has('notes')) data.notes = (String(form.get('notes') || '').trim() || null);
    await prisma.workOrder.update({ where: { id }, data });
    return { success: true };
  },
  add_device: async ({ request, params }) => {
    const id = params.id;
    const form = await request.formData();
    const deviceId = String(form.get('deviceId') || '');
    if (!deviceId) return { success: false, error: 'Missing deviceId' };
    const roleStr = String(form.get('role') || 'PRIMARY') as keyof typeof WorkOrderDeviceRole;
    await prisma.workOrderDevice.create({ data: { workOrderId: id, deviceId, role: WorkOrderDeviceRole[roleStr] } });
    return { success: true };
  },
  remove_device: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    await prisma.workOrderDevice.update({ where: { id }, data: { archivedAt: new Date() } });
    return { success: true };
  },
  add_item: async ({ request, params }) => {
    const id = params.id;
    const form = await request.formData();
    const typeStr = String(form.get('type') || 'NOTE') as keyof typeof WorkOrderItemType;

    if (typeStr === 'PART') {
      const partId = String(form.get('partId') || '');
      const deviceId = String(form.get('deviceId') || '') || null;
      const qty = Math.floor(parseInt(String(form.get('quantity') || '0'), 10));
      if (!partId) return fail(400, { error: 'Please select a part' });
      if (!(Number.isFinite(qty) && qty > 0)) return fail(400, { error: 'Quantity must be greater than 0' });

      try {
        // Transaction: stock check, decrement, movement, item with cost snapshot
        await prisma.$transaction(async (tx) => {
          const part = await tx.part.findUnique({ where: { id: partId }, select: { id: true, quantity: true, averageCostCents: true, unitCostCents: true } });
          if (!part) throw new Error('Part not found');
          if ((part.quantity || 0) < qty) {
            throw new Error('Insufficient stock for this part');
          }
          const newQty = (part.quantity || 0) - qty;
          const preferred = Math.max(0, part.averageCostCents || 0);
          const legacy = Math.max(0, part.unitCostCents || 0);
          let unitCost = preferred > 0 ? preferred : legacy;
          if (unitCost === 0) {
            const lastReceipt = await tx.partInventoryMovement.findFirst({
              where: { partId: part.id, type: PartInventoryMovementType.RECEIPT },
              orderBy: { createdAt: 'desc' },
              select: { unitCostCents: true }
            });
            unitCost = Math.max(0, lastReceipt?.unitCostCents || 0);
          }
          const totalCost = unitCost * qty;

          await tx.part.update({ where: { id: part.id }, data: { quantity: newQty } });
          await tx.partInventoryMovement.create({
            data: {
              type: PartInventoryMovementType.CONSUME,
              partId: part.id,
              quantity: qty,
              unitCostCents: unitCost,
              totalCostCents: totalCost,
              workOrderId: id
            }
          });
          await tx.workOrderItem.create({
            data: {
              workOrderId: id,
              type: WorkOrderItemType.PART,
              partId: part.id,
              deviceId,
              quantity: qty,
              unitCostCentsSnapshot: unitCost
            }
          });
        });
        return { success: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to add part to work order';
        return fail(400, { error: msg });
      }
    }

    // LABOR/NOTE
    const description = (String(form.get('description') || '').trim() || null);
    const amountCents = Math.round(parseFloat(String(form.get('amount') || '0')) * 100) || 0;
    await prisma.workOrderItem.create({ data: { workOrderId: id, type: WorkOrderItemType[typeStr], description, amountCents } });
    return { success: true };
  },
  delete_item: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };

    // Restock if PART consumption is being deleted
    try {
      await prisma.$transaction(async (tx) => {
        const it = await tx.workOrderItem.findUnique({
          where: { id },
          select: { id: true, type: true, partId: true, quantity: true, unitCostCentsSnapshot: true, workOrderId: true, archivedAt: true }
        });
        if (!it) throw new Error('Work order item not found');
        if (it.archivedAt) return; // already deleted; no-op

        if (it.type === 'PART' && it.partId && (it.quantity || 0) > 0) {
          const qty = Math.floor(it.quantity || 0);
          // increment stock back
          const part = await tx.part.findUnique({ where: { id: it.partId }, select: { id: true, quantity: true } });
          if (part) {
            await tx.part.update({ where: { id: part.id }, data: { quantity: (part.quantity || 0) + qty } });
          }
          await tx.partInventoryMovement.create({
            data: {
              type: PartInventoryMovementType.ADJUSTMENT,
              partId: it.partId,
              quantity: qty,
              unitCostCents: Math.max(0, it.unitCostCentsSnapshot || 0),
              totalCostCents: Math.max(0, it.unitCostCentsSnapshot || 0) * qty,
              workOrderId: it.workOrderId,
              notes: 'Reversal of part consumption from deleted work order item'
            }
          });
        }

        await tx.workOrderItem.update({ where: { id }, data: { archivedAt: new Date() } });
      });
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete item';
      return { success: false, error: msg };
    }
  }
};

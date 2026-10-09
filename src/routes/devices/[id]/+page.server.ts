import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { loadDeviceFinancials, loadDeviceIncomes, loadPartsUsed, unharvestedExpensesCents } from '$lib/server/device-financials';
import { effectiveUnitCostCents } from '$lib/parts';
import { formatUsd } from '$lib/format';
import { DeviceStatus, PartInventoryMovementType } from '@prisma/client';

export const load: PageServerLoad = async ({ params }) => {
  const id = params.id;
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) {
    return { device: null };
  }

  const [financials, expensesList, incomesList, partsUsed, workOrderLinks, harvested, parts] = await Promise.all([
    loadDeviceFinancials([id]),
    prisma.expense.findMany({
      where: { deviceId: id, archivedAt: null },
      orderBy: { date: 'desc' },
      include: { category: true, vendor: true, paymentMethod: true, partMovements: { where: { type: 'RECEIPT', archivedAt: null }, select: { id: true } } }
    }),
    loadDeviceIncomes(id),
    loadPartsUsed([id]),
    prisma.workOrderDevice.findMany({
      where: { deviceId: id, archivedAt: null, workOrder: { archivedAt: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        includeDeviceCost: true,
        createdAt: true,
        workOrder: { select: { id: true, code: true, status: true, targetAction: true, customer: { select: { name: true } } } }
      }
    }),
    prisma.partInventoryMovement.findMany({
      where: { sourceDeviceId: id, type: PartInventoryMovementType.RECEIPT, archivedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, quantity: true, unitCostCents: true, totalCostCents: true, part: { select: { id: true, name: true } } }
    }),
    prisma.part.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' }, take: 500, select: { id: true, name: true } })
  ]);
  const f = financials.get(id)!;

  return {
    device,
    summary: {
      expenses: f.expensesCents,
      stockedExpenses: f.stockedExpensesCents,
      partsConsumed: f.partsConsumedCents,
      harvested: f.harvestedCents,
      // Cost still sitting on the device, available to move into parts stock
      unharvested: unharvestedExpensesCents(f.expensesCents, f.harvestedCents),
      income: f.incomeCents,
      fees: f.feesCents,
      shippingNet: f.shippingNetCents,
      taxCollected: f.taxCollectedCents,
      netProfitCents: f.netCents
    },
    expenses: expensesList.map(({ partMovements, ...e }) => ({ ...e, stocked: partMovements.length > 0 })),
    incomes: incomesList,
    partsUsed,
    workOrders: workOrderLinks,
    harvested,
    parts
  };
};

export const actions: Actions = {
  // Pull parts off a donor into stock, moving that much of the donor's cost with them.
  // The cost then reaches a work order when the part is consumed there.
  harvest_part: async ({ request, params }) => {
    const id = params.id;
    const form = await request.formData();
    const partId = String(form.get('partId') || '');
    const newPartName = String(form.get('newPartName') || '').trim();
    const qty = Math.floor(parseInt(String(form.get('quantity') || '0'), 10));
    const unitCostCents = Math.round(parseFloat(String(form.get('unitCost') || '0')) * 100) || 0;
    if (!partId && !newPartName) return fail(400, { error: 'Select a part or name a new one' });
    if (!(Number.isFinite(qty) && qty > 0)) return fail(400, { error: 'Quantity must be greater than 0' });
    if (unitCostCents < 0) return fail(400, { error: 'Value cannot be negative' });

    const device = await prisma.device.findUnique({ where: { id }, select: { status: true, archivedAt: true } });
    if (!device || device.archivedAt) return fail(404, { error: 'Device not found' });
    if (device.status !== DeviceStatus.DONOR) return fail(400, { error: 'Set the device status to Donor before harvesting parts from it' });

    const totalCostCents = unitCostCents * qty;
    const f = (await loadDeviceFinancials([id])).get(id)!;
    const leftCents = unharvestedExpensesCents(f.expensesCents, f.harvestedCents);
    if (totalCostCents > leftCents) {
      return fail(400, { error: `Only ${formatUsd(leftCents)} of this device's cost is left to move into parts stock` });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const select = { id: true, quantity: true, averageCostCents: true, unitCostCents: true };
        const part = partId
          ? await tx.part.findFirst({ where: { id: partId, archivedAt: null }, select })
          : await tx.part.create({ data: { name: newPartName, quantity: 0, averageCostCents: 0 }, select });
        if (!part) throw new Error('Part not found');

        const newQty = part.quantity + qty;
        const newAvg = Math.round((effectiveUnitCostCents(part) * part.quantity + totalCostCents) / newQty);
        await tx.part.update({ where: { id: part.id }, data: { quantity: newQty, averageCostCents: newAvg } });
        await tx.partInventoryMovement.create({
          data: { type: PartInventoryMovementType.RECEIPT, partId: part.id, quantity: qty, unitCostCents, totalCostCents, sourceDeviceId: id }
        });
      });
      return { success: true };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed to harvest part' });
    }
  },
  // Take a harvest back out of stock and put its cost back on the donor
  undo_harvest: async ({ request, params }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return fail(400, { error: 'Missing id' });

    try {
      await prisma.$transaction(async (tx) => {
        const movement = await tx.partInventoryMovement.findFirst({
          where: { id, sourceDeviceId: params.id, type: PartInventoryMovementType.RECEIPT, archivedAt: null },
          select: { id: true, quantity: true, totalCostCents: true, part: { select: { id: true, quantity: true, averageCostCents: true, unitCostCents: true } } }
        });
        if (!movement) throw new Error('Harvest not found');
        const { part } = movement;
        const newQty = part.quantity - movement.quantity;
        if (newQty < 0) throw new Error('These parts have already been used; remove them from the work order first');

        // Back the harvest out of the running average; with nothing left the average is kept as is
        const newAvg = newQty > 0
          ? Math.max(0, Math.round((effectiveUnitCostCents(part) * part.quantity - movement.totalCostCents) / newQty))
          : part.averageCostCents;
        await tx.part.update({ where: { id: part.id }, data: { quantity: newQty, averageCostCents: newAvg } });
        await tx.partInventoryMovement.update({ where: { id }, data: { archivedAt: new Date() } });
      });
      return { success: true };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed to undo harvest' });
    }
  }
};

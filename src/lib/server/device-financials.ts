import { PartInventoryMovementType, WorkOrderItemType, type Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type DeviceFinancials = {
  incomeCents: number;
  feesCents: number;
  shippingNetCents: number;
  taxCollectedCents: number;
  // Device-linked expenses that were not received into parts stock
  expensesCents: number;
  // Device-linked expenses received into parts stock; charged through partsConsumedCents when used
  stockedExpensesCents: number;
  // Parts consumed for the device on work orders (snapshot cost * quantity)
  partsConsumedCents: number;
  // Cost moved into parts stock by harvesting parts from the device (donors); charged
  // through partsConsumedCents of whichever device the parts end up in
  harvestedCents: number;
  netCents: number;
};

// A sale with device lines is counted through those lines, so its head is skipped
const withoutDeviceLines: Prisma.IncomeWhereInput = { lines: { none: { archivedAt: null, deviceId: { not: null } } } };
const stockReceipt: Prisma.PartInventoryMovementWhereInput = { type: PartInventoryMovementType.RECEIPT, archivedAt: null };

function emptyFinancials(): DeviceFinancials {
  return { incomeCents: 0, feesCents: 0, shippingNetCents: 0, taxCollectedCents: 0, expensesCents: 0, stockedExpensesCents: 0, partsConsumedCents: 0, harvestedCents: 0, netCents: 0 };
}

// Value of the parts harvested from each device into stock
export async function loadHarvestedCents(deviceIds: string[]): Promise<Map<string, number>> {
  if (deviceIds.length === 0) return new Map();
  const groups = await prisma.partInventoryMovement.groupBy({
    by: ['sourceDeviceId'],
    where: { ...stockReceipt, sourceDeviceId: { in: deviceIds } },
    _sum: { totalCostCents: true }
  });
  return new Map(groups.flatMap((g) => (g.sourceDeviceId ? [[g.sourceDeviceId, g._sum.totalCostCents || 0] as const] : [])));
}

// What is left of a device's expenses once the value harvested into parts stock is taken off
export function unharvestedExpensesCents(expensesCents: number, harvestedCents: number): number {
  return Math.max(0, expensesCents - harvestedCents);
}

// PART items charged to the given devices: the item's own device, or the work order's device
// when the item has none and the work order has exactly one.
export async function loadPartsUsed(deviceIds: string[]) {
  const items = await prisma.workOrderItem.findMany({
    where: {
      archivedAt: null,
      type: WorkOrderItemType.PART,
      OR: [
        { deviceId: { in: deviceIds } },
        { deviceId: null, workOrder: { devices: { some: { archivedAt: null, deviceId: { in: deviceIds } } } } }
      ]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      part: { select: { id: true, name: true } },
      workOrder: { select: { id: true, code: true, devices: { where: { archivedAt: null }, select: { deviceId: true } } } }
    }
  });
  const wanted = new Set(deviceIds);
  return items.flatMap(({ workOrder: { devices, ...workOrder }, ...item }) => {
    const chargedDeviceId = item.deviceId ?? (devices.length === 1 ? devices[0].deviceId : null);
    if (!chargedDeviceId || !wanted.has(chargedDeviceId)) return [];
    const totalCostCents = (item.quantity || 0) * (item.unitCostCentsSnapshot || 0);
    return [{ ...item, workOrder, chargedDeviceId, totalCostCents }];
  });
}

const workOrderRef = { select: { id: true, code: true } };

// Income recorded for one device: plain incomes linked on the head, plus the device's own
// lines (with their allocated fees) from Sale Builder sales.
export async function loadDeviceIncomes(deviceId: string) {
  const [heads, lines] = await Promise.all([
    prisma.income.findMany({
      where: { deviceId, archivedAt: null, ...withoutDeviceLines },
      include: { channel: true, category: true, workOrder: workOrderRef }
    }),
    prisma.incomeLine.findMany({
      where: { deviceId, archivedAt: null, income: { archivedAt: null } },
      include: { workOrder: workOrderRef, income: { include: { channel: true, category: true, workOrder: workOrderRef } } }
    })
  ]);

  type Row = { id: string; date: Date; notes: string | null; channel: { name: string } | null; category: { name: string } | null; workOrder: { id: string; code: string } | null; amountCents: number; feesCents: number; shippingNetCents: number };
  const rows = new Map<string, Row>();
  for (const h of heads) {
    rows.set(h.id, {
      id: h.id,
      date: h.date,
      notes: h.notes,
      channel: h.channel,
      category: h.category,
      workOrder: h.workOrder,
      amountCents: h.amountCents,
      feesCents: h.platformFeesCents + h.paymentFeesCents,
      shippingNetCents: h.shippingRevenueCents - h.shippingCostCents
    });
  }
  for (const ln of lines) {
    const h = ln.income;
    const row = rows.get(h.id) ?? { id: h.id, date: h.date, notes: h.notes, channel: h.channel, category: h.category, workOrder: ln.workOrder ?? h.workOrder, amountCents: 0, feesCents: 0, shippingNetCents: 0 };
    row.amountCents += ln.amountCents;
    row.feesCents += ln.allocatedPlatformFeesCents + ln.allocatedPaymentFeesCents;
    row.shippingNetCents += ln.allocatedShippingRevenueCents - ln.allocatedShippingCostCents;
    rows.set(h.id, row);
  }
  return [...rows.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function loadDeviceFinancials(deviceIds: string[]): Promise<Map<string, DeviceFinancials>> {
  const out = new Map<string, DeviceFinancials>(deviceIds.map((id) => [id, emptyFinancials()]));
  if (deviceIds.length === 0) return out;

  const expenseWhere = { deviceId: { in: deviceIds }, archivedAt: null };
  const [expenses, stockedExpenses, incomeHeads, incomeLines, partsUsed, harvested] = await Promise.all([
    prisma.expense.groupBy({
      by: ['deviceId'],
      where: { ...expenseWhere, partMovements: { none: stockReceipt } },
      _sum: { amountCents: true }
    }),
    prisma.expense.groupBy({
      by: ['deviceId'],
      where: { ...expenseWhere, partMovements: { some: stockReceipt } },
      _sum: { amountCents: true }
    }),
    prisma.income.groupBy({
      by: ['deviceId'],
      where: { deviceId: { in: deviceIds }, archivedAt: null, ...withoutDeviceLines },
      _sum: { amountCents: true, platformFeesCents: true, paymentFeesCents: true, shippingRevenueCents: true, shippingCostCents: true, taxCollectedCents: true }
    }),
    prisma.incomeLine.groupBy({
      by: ['deviceId'],
      where: { deviceId: { in: deviceIds }, archivedAt: null, income: { archivedAt: null } },
      _sum: {
        amountCents: true,
        allocatedPlatformFeesCents: true,
        allocatedPaymentFeesCents: true,
        allocatedShippingRevenueCents: true,
        allocatedShippingCostCents: true,
        allocatedTaxCents: true
      }
    }),
    loadPartsUsed(deviceIds),
    loadHarvestedCents(deviceIds)
  ]);

  const entry = (id: string | null) => (id ? out.get(id) : undefined);
  for (const g of expenses) {
    const f = entry(g.deviceId);
    if (f) f.expensesCents += g._sum.amountCents || 0;
  }
  for (const g of stockedExpenses) {
    const f = entry(g.deviceId);
    if (f) f.stockedExpensesCents += g._sum.amountCents || 0;
  }
  for (const g of incomeHeads) {
    const f = entry(g.deviceId);
    if (!f) continue;
    f.incomeCents += g._sum.amountCents || 0;
    f.feesCents += (g._sum.platformFeesCents || 0) + (g._sum.paymentFeesCents || 0);
    f.shippingNetCents += (g._sum.shippingRevenueCents || 0) - (g._sum.shippingCostCents || 0);
    f.taxCollectedCents += g._sum.taxCollectedCents || 0;
  }
  for (const g of incomeLines) {
    const f = entry(g.deviceId);
    if (!f) continue;
    f.incomeCents += g._sum.amountCents || 0;
    f.feesCents += (g._sum.allocatedPlatformFeesCents || 0) + (g._sum.allocatedPaymentFeesCents || 0);
    f.shippingNetCents += (g._sum.allocatedShippingRevenueCents || 0) - (g._sum.allocatedShippingCostCents || 0);
    f.taxCollectedCents += g._sum.allocatedTaxCents || 0;
  }
  for (const item of partsUsed) {
    const f = entry(item.chargedDeviceId);
    if (f) f.partsConsumedCents += item.totalCostCents;
  }
  for (const [id, cents] of harvested) {
    const f = entry(id);
    if (f) f.harvestedCents = cents;
  }
  for (const f of out.values()) {
    // taxCollected is excluded from profit
    f.netCents = f.incomeCents - f.feesCents + f.shippingNetCents - unharvestedExpensesCents(f.expensesCents, f.harvestedCents) - f.partsConsumedCents;
  }
  return out;
}

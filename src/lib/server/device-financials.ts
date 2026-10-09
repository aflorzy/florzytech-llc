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

// Income recorded for one device: every income with the device picked on it
export async function loadDeviceIncomes(deviceId: string) {
  const incomes = await prisma.income.findMany({
    where: { deviceId, archivedAt: null },
    orderBy: { date: 'desc' },
    include: { channel: true, category: true, workOrder: workOrderRef }
  });
  return incomes.map((h) => ({
    id: h.id,
    date: h.date,
    notes: h.notes,
    channel: h.channel,
    category: h.category,
    workOrder: h.workOrder,
    amountCents: h.amountCents,
    feesCents: h.platformFeesCents + h.paymentFeesCents,
    shippingNetCents: h.shippingRevenueCents - h.shippingCostCents
  }));
}

export async function loadDeviceFinancials(deviceIds: string[]): Promise<Map<string, DeviceFinancials>> {
  const out = new Map<string, DeviceFinancials>(deviceIds.map((id) => [id, emptyFinancials()]));
  if (deviceIds.length === 0) return out;

  const expenseWhere = { deviceId: { in: deviceIds }, archivedAt: null };
  const [expenses, stockedExpenses, incomes, partsUsed, harvested] = await Promise.all([
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
      where: { deviceId: { in: deviceIds }, archivedAt: null },
      _sum: { amountCents: true, platformFeesCents: true, paymentFeesCents: true, shippingRevenueCents: true, shippingCostCents: true, taxCollectedCents: true }
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
  for (const g of incomes) {
    const f = entry(g.deviceId);
    if (!f) continue;
    f.incomeCents += g._sum.amountCents || 0;
    f.feesCents += (g._sum.platformFeesCents || 0) + (g._sum.paymentFeesCents || 0);
    f.shippingNetCents += (g._sum.shippingRevenueCents || 0) - (g._sum.shippingCostCents || 0);
    f.taxCollectedCents += g._sum.taxCollectedCents || 0;
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

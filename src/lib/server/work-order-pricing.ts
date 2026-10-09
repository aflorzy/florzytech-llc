import type { Prisma } from '@prisma/client';
import { DEFAULT_PARTS_MARKUP_BPS } from '$lib/pricing';
import { prisma } from './prisma';

type Db = Prisma.TransactionClient;

const SETTINGS_ID = 1;

// The default parts markup from Settings, in basis points
export async function getPartsMarkupBps(db: Db = prisma): Promise<number> {
  const row = await db.settings.findUnique({ where: { id: SETTINGS_ID }, select: { partsMarkupBps: true } });
  return row?.partsMarkupBps ?? DEFAULT_PARTS_MARKUP_BPS;
}

export async function setPartsMarkupBps(partsMarkupBps: number, db: Db = prisma): Promise<void> {
  await db.settings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, partsMarkupBps }, update: { partsMarkupBps } });
}

// Marks work orders invoiced, storing the markup in force right now. One that is already
// invoiced keeps its date and markup, so only the first payment (or "Mark invoiced") counts.
// `invoicedAt` is the date on the payment that triggers it, which can be earlier than today
// when an income is entered late; "Mark invoiced" uses now.
export async function markWorkOrdersInvoiced(db: Db, workOrderIds: Array<string | null | undefined>, invoicedAt: Date = new Date()): Promise<void> {
  const ids = [...new Set(workOrderIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  const invoicedMarkupBps = await getPartsMarkupBps(db);
  await db.workOrder.updateMany({ where: { id: { in: ids }, invoicedAt: null }, data: { invoicedAt, invoicedMarkupBps } });
}

// Money received against a work order: the amount on every income tied to it, before fees,
// shipping and tax
export async function loadReceivedCents(workOrderId: string, db: Db = prisma): Promise<number> {
  const received = await db.income.aggregate({ where: { workOrderId, archivedAt: null }, _sum: { amountCents: true } });
  return received._sum.amountCents || 0;
}

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as splitPost } from '../../src/routes/expenses/split/+server';
import { PUT as receiptPut } from '../../src/routes/expenses/receipt/[groupId]/+server';
import { load as receiptLoad } from '../../src/routes/expenses/receipt/[groupId]/+page.server';
import { load as partsLoad } from '../../src/routes/parts/+page.server';
import { disconnectDb, getPrisma, makeJsonRequest, resetAndSeedDb } from './helpers';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const noTotals = { totalTaxCents: 0, totalShippingCents: 0, totalOtherFeesCents: 0 };

async function createReceipt(payload: Record<string, unknown>): Promise<string> {
  const response = await splitPost({
    request: makeJsonRequest({ date: todayStr(), allocationMethod: 'EVEN', totals: noTotals, ...payload })
  } as Parameters<typeof splitPost>[0]);
  expect(response.status).toBe(200);
  return ((await response.json()) as { splitGroupId: string }).splitGroupId;
}

async function loadReceipt(groupId: string) {
  return (await receiptLoad({ params: { groupId } } as Parameters<typeof receiptLoad>[0])) as any;
}

async function saveReceipt(groupId: string, payload: Record<string, unknown>) {
  const request = new Request('http://localhost/test', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date: todayStr(), allocationMethod: 'EVEN', totals: noTotals, ...payload })
  });
  return receiptPut({ request, params: { groupId } } as Parameters<typeof receiptPut>[0]);
}

describe('split receipt notes and parts', () => {
  let categoryId: string;

  beforeEach(async () => {
    await resetAndSeedDb();
    categoryId = (await getPrisma().category.findFirstOrThrow({ where: { kind: 'expense', name: 'Parts' }, select: { id: true } })).id;
  });

  afterAll(async () => {
    await disconnectDb();
  });

  // Issue #2
  it('keeps the receipt note on the receipt and off the line notes when a receipt is created', async () => {
    const groupId = await createReceipt({
      receiptNotes: 'Order arrived late',
      lines: [
        { categoryId, subtotalCents: 1000, notes: 'Own note' },
        { categoryId, subtotalCents: 2000 }
      ]
    });

    const data = await loadReceipt(groupId);
    expect(data.header.receiptNotes).toBe('Order arrived late');
    expect(data.lines.map((l: { notes: string | null }) => l.notes)).toEqual(['Own note', null]);
    expect(data.lines.map((l: { receiptNotes: string | null }) => l.receiptNotes)).toEqual(['Order arrived late', 'Order arrived late']);
  });

  it('saves an edited receipt note without touching line notes, including on added lines', async () => {
    const groupId = await createReceipt({
      receiptNotes: 'Original',
      lines: [
        { categoryId, subtotalCents: 1000, notes: 'Own note' },
        { categoryId, subtotalCents: 2000 }
      ]
    });
    const before = await loadReceipt(groupId);
    const editable = (l: any) => ({
      id: l.id,
      categoryId: l.categoryId,
      notes: l.notes,
      subtotalCents: l.subtotalCents,
      taxCents: 0,
      shippingCents: 0,
      otherFeesCents: 0
    });

    const response = await saveReceipt(groupId, {
      receiptNotes: '  Refund requested  ',
      lines: [...before.lines.map(editable), { categoryId, notes: '', subtotalCents: 300, taxCents: 0, shippingCents: 0, otherFeesCents: 0 }]
    });
    expect(response.status).toBe(200);

    const after = await loadReceipt(groupId);
    expect(after.header.receiptNotes).toBe('Refund requested');
    expect(after.lines.map((l: { notes: string | null }) => l.notes)).toEqual(['Own note', null, null]);
    expect(after.lines.every((l: { receiptNotes: string | null }) => l.receiptNotes === 'Refund requested')).toBe(true);

    // Clearing the note clears it on every line
    const cleared = await saveReceipt(groupId, { receiptNotes: '', lines: after.lines.map(editable) });
    expect(cleared.status).toBe(200);
    expect((await loadReceipt(groupId)).header.receiptNotes).toBeNull();
  });

  // Issues #1 and #3
  it('shows a part created on a receipt on the Parts page and adds to its count on the next receipt', async () => {
    await createReceipt({ lines: [{ categoryId, subtotalCents: 900, newPartName: 'Fan', quantity: 3 }] });

    let data = (await partsLoad({} as Parameters<typeof partsLoad>[0])) as any;
    expect(data.parts).toHaveLength(1);
    expect(data.parts[0]).toMatchObject({ name: 'Fan', quantity: 3 });

    await createReceipt({ lines: [{ categoryId, subtotalCents: 600, partId: data.parts[0].id, quantity: 2 }] });
    data = (await partsLoad({} as Parameters<typeof partsLoad>[0])) as any;
    expect(data.parts).toHaveLength(1);
    expect(data.parts[0]).toMatchObject({ name: 'Fan', quantity: 5, averageCostCents: 300 });
  });
});

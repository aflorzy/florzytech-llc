import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async () => {
  const parts = await prisma.part.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } });
  return { parts };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') || '');
    const sku = (String(form.get('sku') || '') || undefined)?.trim() || undefined;
    const partNumber = ((String(form.get('partNumber') || '')).trim() || undefined);
    const quantity = Number(form.get('quantity') || 0) | 0;
    const unitCostCents = Math.round(parseFloat(String(form.get('unitCost') || '0')) * 100) || null;
    const notes = String(form.get('notes') || '') || null;
    const url = ((String(form.get('url') || '')).trim() || undefined);

    await prisma.part.create({
      data: { name, sku, partNumber, quantity, unitCostCents: unitCostCents ?? undefined, notes, url }
    });

    return { success: true };
  },
  update: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };

    const name = (String(form.get('name') || '')).trim();
    const skuRaw = (String(form.get('sku') || '')).trim();
    const partNumberRaw = (String(form.get('partNumber') || '')).trim();
    const urlRaw = (String(form.get('url') || '')).trim();
    const notesRaw = (String(form.get('notes') || '')).trim();
    const quantity = Number(form.get('quantity') || 0) | 0;
    const unitCostCents = Math.round(parseFloat(String(form.get('unitCost') || '0')) * 100) || null;

    await prisma.part.update({
      where: { id },
      data: {
        name,
        sku: skuRaw || undefined,
        partNumber: partNumberRaw || undefined,
        url: urlRaw || undefined,
        notes: notesRaw || null,
        quantity,
        unitCostCents: unitCostCents ?? undefined
      }
    });

    return { success: true, id };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    await prisma.part.update({ where: { id }, data: { archivedAt: new Date() } });
    return { success: true, id };
  },
  adjust: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id'));
    const delta = Number(form.get('delta') || 0) | 0;

    const part = await prisma.part.findUnique({ where: { id } });
    if (!part) return { success: false, error: 'Part not found' };

    const newQty = Math.max(0, part.quantity + delta);
    await prisma.part.update({ where: { id }, data: { quantity: newQty } });

    return { success: true, id, quantity: newQty };
  }
};

import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async () => {
  const parts = await prisma.part.findMany({ orderBy: { name: 'asc' } });
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

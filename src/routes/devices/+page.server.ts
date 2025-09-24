import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import { buildSku } from '$lib/sku';

function toCents(v: FormDataEntryValue | null) {
  const n = typeof v === 'string' ? parseFloat(v) : 0;
  return Math.round((n || 0) * 100);
}

export const load: PageServerLoad = async () => {
  const devices = await prisma.device.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: 'desc' }
  });
  return { devices };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const form = await request.formData();
    const make = String(form.get('make') || '');
    const model = String(form.get('model') || '');
    const serial = String(form.get('serial') || '') || null;
    const source = String(form.get('source') || '') || null;
    const condition = String(form.get('condition') || '') || null;
    const notes = String(form.get('notes') || '') || null;
    const purchasePriceCents = toCents(form.get('purchasePrice'));

    const now = new Date();
    const ymStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ymEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const countThisMonth = await prisma.device.count({
      where: { createdAt: { gte: ymStart, lt: ymEnd } }
    });
    const sku = buildSku(process.env.SKU_PREFIX || 'FZ', now, make, countThisMonth + 1);

    const device = await prisma.device.create({
      data: {
        make,
        model,
        serial,
        source,
        condition,
        notes,
        purchasePriceCents,
        sku
      }
    });

    return { success: true, device };
  },
  update: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };

    const make = (String(form.get('make') || '')).trim();
    const model = (String(form.get('model') || '')).trim();
    const serial = (String(form.get('serial') || '')).trim() || null;
    const source = (String(form.get('source') || '')).trim() || null;
    const condition = (String(form.get('condition') || '')).trim() || null;
    const notes = (String(form.get('notes') || '')).trim() || null;
    const purchasePriceCents = toCents(form.get('purchasePrice'));

    await prisma.device.update({
      where: { id },
      data: { make, model, serial, source, condition, notes, purchasePriceCents }
    });

    return { success: true, id };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    await prisma.device.update({ where: { id }, data: { archivedAt: new Date() } });
    return { success: true, id };
  }
};

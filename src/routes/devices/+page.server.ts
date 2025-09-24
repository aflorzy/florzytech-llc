import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import { buildSku } from '$lib/sku';

function toCents(v: FormDataEntryValue | null) {
  const n = typeof v === 'string' ? parseFloat(v) : 0;
  return Math.round((n || 0) * 100);
}

export const load: PageServerLoad = async () => {
  const devices = await prisma.device.findMany({
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
  }
};

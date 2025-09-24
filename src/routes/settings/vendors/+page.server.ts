import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async () => {
  const vendors = await prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  return { vendors };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const name = (String(form.get('name') || '')).trim();
    const type = ((String(form.get('type') || '')).trim() || undefined);
    if (!name) {
      return { success: false, error: 'Name is required' };
    }
    try {
      const vendor = await prisma.vendor.create({ data: { name, type } });
      return { success: true, vendor };
    } catch (e) {
      return { success: false, error: 'Could not create vendor (possibly duplicate name)' };
    }
  },
  update: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    const name = (String(form.get('name') || '')).trim();
    const type = ((String(form.get('type') || '')).trim() || undefined);
    if (!name) return { success: false, error: 'Name is required' };
    try {
      const vendor = await prisma.vendor.update({ where: { id }, data: { name, type } });
      return { success: true, vendor };
    } catch (e) {
      return { success: false, error: 'Could not update vendor (possibly duplicate name)' };
    }
  },
  toggle: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing vendor id' };
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) return { success: false, error: 'Vendor not found' };
    const updated = await prisma.vendor.update({ where: { id }, data: { active: !vendor.active } });
    return { success: true, vendor: updated };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    await prisma.vendor.update({ where: { id }, data: { archivedAt: new Date() } });
    return { success: true, id };
  }
};

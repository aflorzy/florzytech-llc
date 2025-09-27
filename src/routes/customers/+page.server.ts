import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async () => {
  const customers = await prisma.customer.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' }
  });
  return { customers };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') || '').trim();
    if (!name) return { success: false, error: 'Name is required' };
    const email = (String(form.get('email') || '').trim() || null);
    const phone = (String(form.get('phone') || '').trim() || null);
    const addressLine1 = (String(form.get('addressLine1') || '').trim() || null);
    const addressLine2 = (String(form.get('addressLine2') || '').trim() || null);
    const city = (String(form.get('city') || '').trim() || null);
    const state = (String(form.get('state') || '').trim() || null);
    const postalCode = (String(form.get('postalCode') || '').trim() || null);
    const notes = (String(form.get('notes') || '').trim() || null);

    await prisma.customer.create({
      data: { name, email, phone, addressLine1, addressLine2, city, state, postalCode, notes }
    });
    return { success: true };
  },
  update: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    const data: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      notes?: string | null;
    } = {};
    if (form.has('name')) {
      const name = String(form.get('name') || '').trim();
      if (!name) return { success: false, error: 'Name is required' };
      data.name = name;
    }
    if (form.has('email')) data.email = (String(form.get('email') || '').trim() || null);
    if (form.has('phone')) data.phone = (String(form.get('phone') || '').trim() || null);
    if (form.has('addressLine1')) data.addressLine1 = (String(form.get('addressLine1') || '').trim() || null);
    if (form.has('addressLine2')) data.addressLine2 = (String(form.get('addressLine2') || '').trim() || null);
    if (form.has('city')) data.city = (String(form.get('city') || '').trim() || null);
    if (form.has('state')) data.state = (String(form.get('state') || '').trim() || null);
    if (form.has('postalCode')) data.postalCode = (String(form.get('postalCode') || '').trim() || null);
    if (form.has('notes')) data.notes = (String(form.get('notes') || '').trim() || null);

    await prisma.customer.update({ where: { id }, data });
    return { success: true, id };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    await prisma.customer.update({ where: { id }, data: { archivedAt: new Date() } });
    return { success: true, id };
  }
};

import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async () => {
  const [expenseCategories, incomeCategories] = await Promise.all([
    prisma.category.findMany({ where: { kind: 'expense' }, orderBy: { name: 'asc' } }),
    prisma.category.findMany({ where: { kind: 'income' }, orderBy: { name: 'asc' } })
  ]);
  return { expenseCategories, incomeCategories };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const kind = String(form.get('kind') || '').trim();
    const name = String(form.get('name') || '').trim();
    if (!name) return { success: false, error: 'Name is required' };
    if (!['expense', 'income'].includes(kind)) return { success: false, error: 'Invalid kind' };
    try {
      const category = await prisma.category.create({ data: { name, kind } });
      return { success: true, category };
    } catch (e) {
      return { success: false, error: 'Category name must be unique' };
    }
  },
  update: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    const name = String(form.get('name') || '').trim();
    if (!id) return { success: false, error: 'Missing id' };
    if (!name) return { success: false, error: 'Name is required' };
    try {
      const category = await prisma.category.update({ where: { id }, data: { name } });
      return { success: true, category };
    } catch (e) {
      return { success: false, error: 'Could not update category (possibly duplicate name)' };
    }
  },
  toggle: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return { success: false, error: 'Category not found' };
    const updated = await prisma.category.update({ where: { id }, data: { active: !cat.active } });
    return { success: true, category: updated };
  }
};

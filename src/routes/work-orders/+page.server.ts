import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import { WorkOrderStatus, WorkOrderTargetAction } from '@prisma/client';

function buildWorkOrderCode(prefix = 'WO') {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return { prefix, yyyy, mm };
}

export const load: PageServerLoad = async () => {
  const [orders, customers] = await Promise.all([
    prisma.workOrder.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { customer: true }
    }),
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } })
  ]);
  return { orders, customers };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const target = String(form.get('targetAction') || 'RETURN_TO_CUSTOMER') as keyof typeof WorkOrderTargetAction;
    const customerId = String(form.get('customerId') || '') || null;
    const notes = (String(form.get('notes') || '').trim() || null);

    const { prefix, yyyy, mm } = buildWorkOrderCode();
    const monthStart = new Date(Number(yyyy), Number(mm) - 1, 1);
    const monthEnd = new Date(Number(yyyy), Number(mm), 1);
    const count = await prisma.workOrder.count({ where: { createdAt: { gte: monthStart, lt: monthEnd } } });
    const code = `${prefix}-${yyyy}${mm}-${String(count + 1).padStart(4, '0')}`;

    const wo = await prisma.workOrder.create({
      data: {
        code,
        status: WorkOrderStatus.OPEN,
        targetAction: WorkOrderTargetAction[target],
        customerId,
        notes
      }
    });
    return { success: true, id: wo.id };
  },
  update: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    const data: { status?: WorkOrderStatus; targetAction?: WorkOrderTargetAction; customerId?: string | null; notes?: string | null } = {};

    if (form.has('status')) {
      const statusStr = String(form.get('status') || '').trim();
      if (statusStr) data.status = WorkOrderStatus[statusStr as keyof typeof WorkOrderStatus];
    }
    if (form.has('targetAction')) {
      const taStr = String(form.get('targetAction') || '').trim();
      if (taStr) data.targetAction = WorkOrderTargetAction[taStr as keyof typeof WorkOrderTargetAction];
    }
    if (form.has('customerId')) data.customerId = (String(form.get('customerId') || '') || null);
    if (form.has('notes')) data.notes = (String(form.get('notes') || '').trim() || null);

    await prisma.workOrder.update({ where: { id }, data });
    return { success: true, id };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (!id) return { success: false, error: 'Missing id' };
    await prisma.workOrder.update({ where: { id }, data: { archivedAt: new Date() } });
    return { success: true, id };
  }
};

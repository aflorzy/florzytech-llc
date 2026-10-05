import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import { buildSku } from '$lib/sku';
import { loadDeviceFinancials } from '$lib/server/device-financials';
import { DeviceStatus } from '@prisma/client';

export const load: PageServerLoad = async () => {
  const devices = await prisma.device.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: 'desc' }
  });
  const ids = devices.map((d) => d.id);
  if (ids.length === 0) {
    const vendors = await prisma.vendor.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
    return { devices: [], vendors };
  }

  const financials = await loadDeviceFinancials(ids);
  const withNet = devices.map((d) => ({ ...d, netCents: financials.get(d.id)?.netCents ?? 0 }));

  const vendors = await prisma.vendor.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  return { devices: withNet, vendors };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const form = await request.formData();
    const make = String(form.get('make') || '');
    const model = String(form.get('model') || '');
    const serial = String(form.get('serial') || '') || null;
    const vendorId = String(form.get('vendorId') || '') || null;
    const condition = String(form.get('condition') || '') || null;
    const notes = String(form.get('notes') || '') || null;

    const now = new Date();
    const ymStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ymEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const countThisMonth = await prisma.device.count({
      where: { createdAt: { gte: ymStart, lt: ymEnd } }
    });
    const sku = buildSku(process.env.SKU_PREFIX || 'FZ', now, make, countThisMonth + 1);

    const vendorName = vendorId ? (await prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } }))?.name || null : null;

    const device = await prisma.device.create({
      data: {
        make,
        model,
        serial,
        source: vendorName,
        condition,
        notes,
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
    const vendorId = String(form.get('vendorId') || '') || null;
    const condition = (String(form.get('condition') || '')).trim() || null;
    const notes = (String(form.get('notes') || '')).trim() || null;
    const statusRaw = (String(form.get('status') || '')).trim();
    let status: DeviceStatus | undefined = undefined;
    if (statusRaw) {
      if (!(statusRaw in DeviceStatus)) {
        return { success: false, error: 'Invalid status' };
      }
      status = DeviceStatus[statusRaw as keyof typeof DeviceStatus];
    }

    const data: {
      make?: string;
      model?: string;
      serial?: string | null;
      source?: string | null;
      condition?: string | null;
      notes?: string | null;
      status?: DeviceStatus;
    } = {};

    if (form.has('make')) {
      if (!make) return { success: false, error: 'Make is required' };
      data.make = make;
    }
    if (form.has('model')) {
      data.model = model;
    }
    if (form.has('serial')) data.serial = serial;
    if (form.has('condition')) data.condition = condition;
    if (form.has('vendorId')) {
      if (vendorId) {
        const v = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } });
        data.source = v?.name || null;
      } else {
        data.source = null;
      }
    }
    if (status) data.status = status;

    if (Object.keys(data).length === 0) {
      return { success: false, error: 'No fields to update' };
    }
    await prisma.device.update({ where: { id }, data });

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

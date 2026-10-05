import { PrismaClient } from '@prisma/client';
import { loadTestEnv } from './env.mjs';
import { fileURLToPath } from 'node:url';

function todayLocalDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function seedFixtures() {
  loadTestEnv();
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  try {
    const expenseCategories = ['Parts', 'Shipping Supplies', 'Tools/Consumables', 'Platform Fees'];
    const incomeCategories = ['Device Sale', 'Repair Service', 'Deposit'];
    const channels = ['In-Person', 'Facebook Marketplace', 'eBay'];
    const vendors = ['Amazon', 'eBay', 'Facebook'];
    const paymentMethods = ['Credit Card', 'Cash', 'PayPal'];
    const baselineDate = todayLocalDate();

    await prisma.category.createMany({
      data: expenseCategories.map((name) => ({ name, kind: 'expense', active: true })),
      skipDuplicates: true
    });
    await prisma.category.createMany({
      data: incomeCategories.map((name) => ({ name, kind: 'income', active: true })),
      skipDuplicates: true
    });
    await prisma.salesChannel.createMany({
      data: channels.map((name) => ({ name, active: true })),
      skipDuplicates: true
    });
    await prisma.vendor.createMany({
      data: vendors.map((name) => ({ name, active: true })),
      skipDuplicates: true
    });
    await prisma.paymentMethod.createMany({
      data: paymentMethods.map((name) => ({ name, active: true })),
      skipDuplicates: true
    });

    const customer = await prisma.customer.create({
      data: {
        name: 'Fixture Customer',
        notes: 'Deterministic test fixture customer'
      }
    });

    await prisma.device.create({
      data: {
        sku: `FIX-${Date.now()}`,
        make: 'Apple',
        model: 'iPhone 13',
        serial: 'FIXTURE-SERIAL-001',
        notes: 'Deterministic test fixture device'
      }
    });

    await prisma.workOrder.create({
      data: {
        code: `WO-FIX-${Date.now()}`,
        customerId: customer.id,
        notes: 'Fixture work order'
      }
    });

    // Ledger fixture for smoke assertions
    const expenseCat = await prisma.category.findFirst({ where: { name: 'Parts', kind: 'expense' }, select: { id: true } });
    const incomeCat = await prisma.category.findFirst({ where: { name: 'Repair Service', kind: 'income' }, select: { id: true } });
    const channel = await prisma.salesChannel.findFirst({ where: { name: 'In-Person' }, select: { id: true } });

    if (!expenseCat || !incomeCat || !channel) {
      throw new Error('Fixture references missing after seed setup.');
    }

    await prisma.expense.create({
      data: {
        date: baselineDate,
        amountCents: 15000,
        subtotalCents: 15000,
        categoryId: expenseCat.id,
        notes: 'Fixture expense'
      }
    });

    await prisma.income.create({
      data: {
        date: baselineDate,
        type: 'SERVICE',
        amountCents: 30000,
        categoryId: incomeCat.id,
        channelId: channel.id,
        platformFeesCents: 1000,
        paymentFeesCents: 500,
        shippingRevenueCents: 300,
        shippingCostCents: 100,
        notes: 'Fixture income'
      }
    });

    console.log('Seed fixtures complete.');
  } finally {
    await prisma.$disconnect();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  seedFixtures().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Categories (expense only for now)
  const categories = [
    { name: 'Parts', kind: 'expense' },
    { name: 'Tools/Consumables', kind: 'expense' },
    { name: 'Device Purchases', kind: 'expense' },
    { name: 'Shipping Supplies', kind: 'expense' },
    { name: 'Cleaning Supplies', kind: 'expense' },
    { name: 'Platform Fees', kind: 'expense' },
    { name: 'Payment Fees', kind: 'expense' },
    { name: 'Shipping Costs', kind: 'expense' }
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: c
    });
  }

  // Sales Channels (exclude website; include eBay, Facebook, Custom)
  const channels = ['eBay', 'Facebook', 'AliExpress', 'Custom'];
  for (const name of channels) {
    await prisma.salesChannel.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  // Vendors (include AliExpress + examples)
  const vendors = ['AliExpress', 'Pawn America', 'Savers', 'Goodwill'];
  for (const name of vendors) {
    await prisma.vendor.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  // Payment Methods
  const pms = ['Cash', 'PayPal', 'Venmo', 'Zelle', 'CashApp', 'Card', 'Bank'];
  for (const name of pms) {
    await prisma.paymentMethod.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  // Nothing to seed for DeviceStatus/IncomeType since enums
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

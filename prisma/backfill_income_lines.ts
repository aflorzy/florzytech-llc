import { PrismaClient, IncomeLineType, DeviceStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const incomes = await prisma.income.findMany({
    where: {
      archivedAt: null,
      lines: { none: {} }
    },
    select: {
      id: true,
      date: true,
      type: true,
      amountCents: true,
      notes: true,
      deviceId: true,
      channelId: true,
      categoryId: true,
      customerId: true,
      workOrderId: true,
      platformFeesCents: true,
      paymentFeesCents: true,
      shippingRevenueCents: true,
      shippingCostCents: true,
      taxCollectedCents: true
    },
    orderBy: { date: 'asc' }
  });

  let created = 0;

  for (const inc of incomes) {
    const type = inc.deviceId ? IncomeLineType.DEVICE : IncomeLineType.OTHER;

    await prisma.$transaction(async (tx) => {
      await tx.incomeLine.create({
        data: {
          incomeId: inc.id,
          type,
          description: inc.notes || null,
          amountCents: inc.amountCents,
          quantity: type === IncomeLineType.DEVICE ? 1 : null,
          deviceId: inc.deviceId,
          partId: null,
          workOrderId: inc.workOrderId,
          allocatedPlatformFeesCents: inc.platformFeesCents || 0,
          allocatedPaymentFeesCents: inc.paymentFeesCents || 0,
          allocatedShippingRevenueCents: inc.shippingRevenueCents || 0,
          allocatedShippingCostCents: inc.shippingCostCents || 0,
          allocatedTaxCents: inc.taxCollectedCents || 0
        }
      });

      // If a device is linked and not yet SOLD/SHIPPED/DELIVERED, consider marking SOLD for consistency
      if (inc.deviceId) {
        const d = await tx.device.findUnique({ where: { id: inc.deviceId }, select: { id: true, status: true } });
        if (d && !['SOLD', 'SHIPPED', 'DELIVERED'].includes(d.status as string)) {
          await tx.device.update({ where: { id: d.id }, data: { status: DeviceStatus.SOLD } });
        }
      }
    });

    created += 1;
  }

  console.log(`Backfill complete. Created ${created} IncomeLine rows.`);
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

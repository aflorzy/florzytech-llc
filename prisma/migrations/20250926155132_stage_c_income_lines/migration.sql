-- CreateEnum
CREATE TYPE "IncomeLineType" AS ENUM ('DEVICE', 'PART', 'LABOR', 'OTHER');

-- CreateTable
CREATE TABLE "IncomeLine" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "incomeId" TEXT NOT NULL,
    "type" "IncomeLineType" NOT NULL,
    "deviceId" TEXT,
    "partId" TEXT,
    "workOrderId" TEXT,
    "description" TEXT,
    "quantity" INTEGER DEFAULT 0,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "allocatedPlatformFeesCents" INTEGER NOT NULL DEFAULT 0,
    "allocatedPaymentFeesCents" INTEGER NOT NULL DEFAULT 0,
    "allocatedShippingRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "allocatedShippingCostCents" INTEGER NOT NULL DEFAULT 0,
    "allocatedTaxCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IncomeLine_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "IncomeLine" ADD CONSTRAINT "IncomeLine_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "Income"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeLine" ADD CONSTRAINT "IncomeLine_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeLine" ADD CONSTRAINT "IncomeLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeLine" ADD CONSTRAINT "IncomeLine_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

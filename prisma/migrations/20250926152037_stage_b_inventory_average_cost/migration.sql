-- CreateEnum
CREATE TYPE "PartInventoryMovementType" AS ENUM ('RECEIPT', 'CONSUME', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "Part" ADD COLUMN     "averageCostCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PartInventoryMovement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "type" "PartInventoryMovementType" NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "totalCostCents" INTEGER NOT NULL,
    "workOrderId" TEXT,
    "expenseId" TEXT,
    "notes" TEXT,

    CONSTRAINT "PartInventoryMovement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PartInventoryMovement" ADD CONSTRAINT "PartInventoryMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartInventoryMovement" ADD CONSTRAINT "PartInventoryMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartInventoryMovement" ADD CONSTRAINT "PartInventoryMovement_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AllocationMethod" AS ENUM ('PROPORTIONAL_SUBTOTAL', 'EVEN', 'MANUAL');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "allocationMethod" "AllocationMethod",
ADD COLUMN     "otherFeesCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "splitGroupId" TEXT,
ADD COLUMN     "subtotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "invoicedAt" TIMESTAMP(3),
ADD COLUMN "invoicedMarkupBps" INTEGER;

-- AlterTable
ALTER TABLE "WorkOrderDevice" ADD COLUMN "priceCents" INTEGER;

-- AlterTable
ALTER TABLE "WorkOrderItem" ADD COLUMN "manualUnitPriceCents" INTEGER;

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "partsMarkupBps" INTEGER NOT NULL DEFAULT 3000,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- Work orders that are already finished or paid count as invoiced, with no stored markup,
-- so their part lines stay unpriced and no figure on them changes. Open work orders with
-- no payment are left alone and pick up the default markup.
-- The invoiced date is the date of the earliest payment still on the work order (the date
-- on the income, not when it was typed in). A finished work order with no payment gets the
-- date it was last changed.
UPDATE "WorkOrder" w
SET "invoicedAt" = COALESCE(
  LEAST(
    (
      SELECT MIN(i."date") FROM "Income" i
      WHERE i."workOrderId" = w."id" AND i."archivedAt" IS NULL
    ),
    (
      SELECT MIN(h."date") FROM "IncomeLine" l
      JOIN "Income" h ON h."id" = l."incomeId"
      WHERE l."workOrderId" = w."id" AND l."archivedAt" IS NULL AND h."archivedAt" IS NULL
    )
  ),
  w."updatedAt"
)
WHERE w."invoicedAt" IS NULL
  AND (
    w."status" IN ('DELIVERED', 'CANCELLED')
    OR EXISTS (
      SELECT 1 FROM "Income" i
      WHERE i."workOrderId" = w."id" AND i."archivedAt" IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM "IncomeLine" l
      JOIN "Income" h ON h."id" = l."incomeId"
      WHERE l."workOrderId" = w."id" AND l."archivedAt" IS NULL AND h."archivedAt" IS NULL
    )
  );

-- A donor's cost is never counted on a work order; it is recouped through its parts.
-- This raises the profit of any work order that was carrying a donor's cost.
UPDATE "WorkOrderDevice"
SET "includeDeviceCost" = false
WHERE "role" = 'DONOR' AND "includeDeviceCost" = true;

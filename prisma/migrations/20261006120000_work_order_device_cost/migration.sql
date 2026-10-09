-- AlterTable
ALTER TABLE "WorkOrderDevice" ADD COLUMN "includeDeviceCost" BOOLEAN NOT NULL DEFAULT true;

-- A device's expenses count against one work order only. Where a device is already on
-- several, keep them on the earliest and take them off the later ones.
UPDATE "WorkOrderDevice" d
SET "includeDeviceCost" = false
WHERE EXISTS (
  SELECT 1
  FROM "WorkOrderDevice" e
  JOIN "WorkOrder" w ON w."id" = e."workOrderId"
  WHERE e."deviceId" = d."deviceId"
    AND e."archivedAt" IS NULL
    AND w."archivedAt" IS NULL
    AND (e."createdAt", e."id") < (d."createdAt", d."id")
);

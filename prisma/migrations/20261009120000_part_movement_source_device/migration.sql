-- AlterTable
ALTER TABLE "PartInventoryMovement" ADD COLUMN "sourceDeviceId" TEXT;

-- AddForeignKey
ALTER TABLE "PartInventoryMovement" ADD CONSTRAINT "PartInventoryMovement_sourceDeviceId_fkey" FOREIGN KEY ("sourceDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "countEveryDays" INTEGER,
ADD COLUMN     "lastCountedAt" TIMESTAMP(3),
ADD COLUMN     "trackingMode" TEXT NOT NULL DEFAULT 'exact';

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "expectedQuantity" DOUBLE PRECISION NOT NULL,
    "countedQuantity" DOUBLE PRECISION NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_counts_companyId_idx" ON "inventory_counts"("companyId");

-- CreateIndex
CREATE INDEX "inventory_counts_inventoryItemId_idx" ON "inventory_counts"("inventoryItemId");

-- CreateIndex
CREATE INDEX "inventory_counts_countedAt_idx" ON "inventory_counts"("countedAt");

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

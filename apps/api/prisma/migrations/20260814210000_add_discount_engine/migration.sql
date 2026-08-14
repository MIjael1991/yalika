-- AlterTable
ALTER TABLE "order_items"
ADD COLUMN "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "total" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Existing sales had no item-level discount. Preserve their historical net total.
UPDATE "order_items"
SET "total" = "lineTotal";

-- CreateTable
CREATE TABLE "order_discounts" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "operationId" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "promotionId" TEXT,
    "authorizedById" TEXT NOT NULL,
    "voidedById" TEXT,

    CONSTRAINT "order_discounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_discounts_scope_check" CHECK ("scope" IN ('order', 'item')),
    CONSTRAINT "order_discounts_source_check" CHECK ("source" IN ('manual', 'promotion', 'vip', 'table', 'loyalty', 'system')),
    CONSTRAINT "order_discounts_type_check" CHECK ("type" IN ('percentage', 'fixed', 'special_price')),
    CONSTRAINT "order_discounts_status_check" CHECK ("status" IN ('applied', 'voided')),
    CONSTRAINT "order_discounts_value_check" CHECK ("value" >= 0),
    CONSTRAINT "order_discounts_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "order_discounts_scope_item_check" CHECK (
        ("scope" = 'item' AND "orderItemId" IS NOT NULL)
        OR ("scope" = 'order' AND "orderItemId" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "order_discounts_companyId_operationId_key" ON "order_discounts"("companyId", "operationId");

-- CreateIndex
CREATE INDEX "order_discounts_companyId_idx" ON "order_discounts"("companyId");

-- CreateIndex
CREATE INDEX "order_discounts_orderId_idx" ON "order_discounts"("orderId");

-- CreateIndex
CREATE INDEX "order_discounts_orderItemId_idx" ON "order_discounts"("orderItemId");

-- CreateIndex
CREATE INDEX "order_discounts_promotionId_idx" ON "order_discounts"("promotionId");

-- CreateIndex
CREATE INDEX "order_discounts_authorizedById_idx" ON "order_discounts"("authorizedById");

-- CreateIndex
CREATE INDEX "order_discounts_voidedById_idx" ON "order_discounts"("voidedById");

-- CreateIndex
CREATE INDEX "order_discounts_status_idx" ON "order_discounts"("status");

-- CreateIndex
CREATE INDEX "order_discounts_appliedAt_idx" ON "order_discounts"("appliedAt");

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "diningTableId" TEXT;

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "area" TEXT,
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_splits" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "order_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_split_items" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderSplitId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,

    CONSTRAINT "order_split_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dining_tables_companyId_idx" ON "dining_tables"("companyId");

-- CreateIndex
CREATE INDEX "dining_tables_status_idx" ON "dining_tables"("status");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_companyId_code_key" ON "dining_tables"("companyId", "code");

-- CreateIndex
CREATE INDEX "order_splits_orderId_idx" ON "order_splits"("orderId");

-- CreateIndex
CREATE INDEX "order_splits_companyId_idx" ON "order_splits"("companyId");

-- CreateIndex
CREATE INDEX "order_splits_status_idx" ON "order_splits"("status");

-- CreateIndex
CREATE INDEX "order_split_items_orderSplitId_idx" ON "order_split_items"("orderSplitId");

-- CreateIndex
CREATE INDEX "order_split_items_orderItemId_idx" ON "order_split_items"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "order_split_items_orderSplitId_orderItemId_key" ON "order_split_items"("orderSplitId", "orderItemId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_diningTableId_fkey" FOREIGN KEY ("diningTableId") REFERENCES "dining_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_splits" ADD CONSTRAINT "order_splits_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_splits" ADD CONSTRAINT "order_splits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_split_items" ADD CONSTRAINT "order_split_items_orderSplitId_fkey" FOREIGN KEY ("orderSplitId") REFERENCES "order_splits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_split_items" ADD CONSTRAINT "order_split_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

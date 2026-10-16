-- YALEKA NEGOCIO STUDIO R8.1
-- Migracion consolidada R7 + R8, aditiva y local primero.
-- No elimina columnas, tablas ni datos existentes.

ALTER TABLE "products"
  ADD COLUMN "unitCost" DOUBLE PRECISION,
  ADD COLUMN "unitsPerPack" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "packSalePrice" DOUBLE PRECISION,
  ADD COLUMN "webVisible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "product_variants"
  ADD COLUMN "unitCost" DOUBLE PRECISION;

CREATE TABLE "pos_stock_receipts" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "actorId" TEXT NOT NULL,
  "totalCost" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "companyId" TEXT NOT NULL,
  CONSTRAINT "pos_stock_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_stock_movements" (
  "id" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "unitCost" DOUBLE PRECISION,
  "packs" INTEGER,
  "unitsPerPack" INTEGER,
  "costPerPack" DOUBLE PRECISION,
  "totalCost" DOUBLE PRECISION,
  "reference" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "companyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "receiptId" TEXT,
  CONSTRAINT "pos_stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_stock_receipts_operationId_key"
  ON "pos_stock_receipts"("operationId");
CREATE INDEX "pos_stock_receipts_companyId_createdAt_idx"
  ON "pos_stock_receipts"("companyId", "createdAt");
CREATE INDEX "pos_stock_movements_companyId_createdAt_idx"
  ON "pos_stock_movements"("companyId", "createdAt");
CREATE INDEX "pos_stock_movements_productId_createdAt_idx"
  ON "pos_stock_movements"("productId", "createdAt");
CREATE INDEX "pos_stock_movements_receiptId_idx"
  ON "pos_stock_movements"("receiptId");
CREATE INDEX "products_companyId_webVisible_status_idx"
  ON "products"("companyId", "webVisible", "status");

ALTER TABLE "pos_stock_receipts"
  ADD CONSTRAINT "pos_stock_receipts_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_stock_movements"
  ADD CONSTRAINT "pos_stock_movements_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_stock_movements"
  ADD CONSTRAINT "pos_stock_movements_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_stock_movements"
  ADD CONSTRAINT "pos_stock_movements_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_stock_movements"
  ADD CONSTRAINT "pos_stock_movements_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "pos_stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Compatibilidad: los productos activos que ya eran publicos en un sitio publicado
-- siguen visibles despues de introducir el selector webVisible.
UPDATE "products" AS p
SET "webVisible" = true
FROM "sites" AS s
WHERE s."companyId" = p."companyId"
  AND s."status" = 'published'
  AND p."status" = 'active';

ALTER TABLE "site_sections"
  ADD COLUMN "content" JSONB;

CREATE TABLE "product_barcodes" (
  "id" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'CODE128',
  "kind" TEXT NOT NULL DEFAULT 'unit',
  "unitsPerScan" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "generated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "companyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  CONSTRAINT "product_barcodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_barcodes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_barcodes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_barcodes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "product_barcodes_companyId_value_key"
  ON "product_barcodes"("companyId", "value");
CREATE INDEX "product_barcodes_productId_idx"
  ON "product_barcodes"("productId");
CREATE INDEX "product_barcodes_variantId_idx"
  ON "product_barcodes"("variantId");
CREATE INDEX "product_barcodes_companyId_active_idx"
  ON "product_barcodes"("companyId", "active");

CREATE TABLE "business_assistant_memories" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'business',
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'user_confirmed',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "business_assistant_memories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_assistant_memories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_assistant_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "business_assistant_memories_userId_scope_key_key"
  ON "business_assistant_memories"("userId", "scope", "key");
CREATE INDEX "business_assistant_memories_companyId_status_idx"
  ON "business_assistant_memories"("companyId", "status");

CREATE TABLE "business_assistant_actions" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "risk" TEXT NOT NULL DEFAULT 'low',
  "status" TEXT NOT NULL DEFAULT 'proposed',
  "input" JSONB NOT NULL,
  "proposal" JSONB NOT NULL,
  "result" JSONB,
  "operationId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "business_assistant_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_assistant_actions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_assistant_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "business_assistant_actions_operationId_key"
  ON "business_assistant_actions"("operationId");
CREATE INDEX "business_assistant_actions_companyId_createdAt_idx"
  ON "business_assistant_actions"("companyId", "createdAt");
CREATE INDEX "business_assistant_actions_userId_status_idx"
  ON "business_assistant_actions"("userId", "status");

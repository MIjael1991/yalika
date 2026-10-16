-- YALEKA R11B-3A: additive tenant-scoped catalogs. Run with Prisma migrate deploy only after approval.
CREATE TABLE "commerce_catalogs" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "companyId" TEXT NOT NULL,
  CONSTRAINT "commerce_catalogs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "commerce_catalogs_companyId_name_key" ON "commerce_catalogs"("companyId", "name");
CREATE INDEX "commerce_catalogs_companyId_status_idx" ON "commerce_catalogs"("companyId", "status");
ALTER TABLE "commerce_catalogs" ADD CONSTRAINT "commerce_catalogs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_categories" ADD COLUMN "catalogId" TEXT;
ALTER TABLE "products" ADD COLUMN "catalogId" TEXT;
ALTER TABLE "sites" ADD COLUMN "catalogId" TEXT;
ALTER TABLE "orders" ADD COLUMN "catalogId" TEXT;
ALTER TABLE "commerce_reservations" ADD COLUMN "catalogId" TEXT;
-- One canonical default per existing company; do not guess product ownership from names.
INSERT INTO "commerce_catalogs" ("id", "name", "isDefault", "companyId", "updatedAt")
SELECT gen_random_uuid()::text, 'General', true, c."id", CURRENT_TIMESTAMP
FROM "companies" c;
UPDATE "product_categories" AS pc SET "catalogId" = cc."id"
FROM "commerce_catalogs" cc WHERE cc."companyId" = pc."companyId" AND cc."isDefault" = true;
UPDATE "products" AS p SET "catalogId" = cc."id"
FROM "commerce_catalogs" cc WHERE cc."companyId" = p."companyId" AND cc."isDefault" = true;
UPDATE "orders" AS o SET "catalogId" = cc."id"
FROM "commerce_catalogs" cc WHERE cc."companyId" = o."companyId" AND cc."isDefault" = true;
UPDATE "commerce_reservations" AS r SET "catalogId" = cc."id"
FROM "commerce_catalogs" cc WHERE cc."companyId" = r."companyId" AND cc."isDefault" = true;
DROP INDEX "product_categories_companyId_name_key";
CREATE UNIQUE INDEX "product_categories_catalogId_name_key" ON "product_categories"("catalogId", "name");
CREATE INDEX "product_categories_catalogId_idx" ON "product_categories"("catalogId");
CREATE INDEX "products_catalogId_idx" ON "products"("catalogId");
CREATE INDEX "sites_catalogId_idx" ON "sites"("catalogId");
CREATE INDEX "commerce_reservations_catalogId_idx" ON "commerce_reservations"("catalogId");
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "commerce_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "commerce_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sites" ADD CONSTRAINT "sites_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "commerce_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "commerce_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commerce_reservations" ADD CONSTRAINT "commerce_reservations_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "commerce_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

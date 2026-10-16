BEGIN;

ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "reservationId" TEXT;

CREATE INDEX IF NOT EXISTS "orders_reservationId_idx"
ON "orders"("reservationId");

CREATE TABLE "commerce_reservation_policies" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "depositRequired" BOOLEAN NOT NULL DEFAULT true,
  "depositType" TEXT NOT NULL DEFAULT 'fixed',
  "depositValue" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "holdMinutes" INTEGER NOT NULL DEFAULT 15,
  "activeDays" INTEGER NOT NULL DEFAULT 2,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commerce_reservation_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commerce_reservation_policies_companyId_key"
ON "commerce_reservation_policies"("companyId");

CREATE TABLE "commerce_reservations" (
  "id" TEXT NOT NULL,
  "reservationNumber" TEXT NOT NULL,
  "publicToken" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'hold',
  "source" TEXT NOT NULL DEFAULT 'web',
  "holdExpiresAt" TIMESTAMP(3),
  "pickupDeadline" TIMESTAMP(3),
  "depositRequiredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "depositStatus" TEXT NOT NULL DEFAULT 'pending',
  "depositMethod" TEXT,
  "depositReference" TEXT,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "deliveryMode" TEXT NOT NULL DEFAULT 'arrange',
  "notes" TEXT,
  "companyId" TEXT NOT NULL,
  "siteId" TEXT,
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "commerce_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commerce_reservations_publicToken_key"
ON "commerce_reservations"("publicToken");
CREATE UNIQUE INDEX "commerce_reservations_companyId_reservationNumber_key"
ON "commerce_reservations"("companyId", "reservationNumber");
CREATE UNIQUE INDEX "commerce_reservations_companyId_operationId_key"
ON "commerce_reservations"("companyId", "operationId");
CREATE INDEX "commerce_reservations_companyId_status_idx"
ON "commerce_reservations"("companyId", "status");
CREATE INDEX "commerce_reservations_companyId_holdExpiresAt_idx"
ON "commerce_reservations"("companyId", "holdExpiresAt");
CREATE INDEX "commerce_reservations_companyId_pickupDeadline_idx"
ON "commerce_reservations"("companyId", "pickupDeadline");
CREATE INDEX "commerce_reservations_siteId_idx"
ON "commerce_reservations"("siteId");
CREATE INDEX "commerce_reservations_orderId_idx"
ON "commerce_reservations"("orderId");

CREATE TABLE "commerce_reservation_items" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPriceSnapshot" DOUBLE PRECISION NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "variantSnapshot" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "reservationId" TEXT NOT NULL,
  CONSTRAINT "commerce_reservation_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commerce_reservation_items_reservationId_idx"
ON "commerce_reservation_items"("reservationId");
CREATE INDEX "commerce_reservation_items_productId_variantId_idx"
ON "commerce_reservation_items"("productId", "variantId");

CREATE TABLE "commerce_reservation_events" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "note" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reservationId" TEXT NOT NULL,
  CONSTRAINT "commerce_reservation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commerce_reservation_events_reservationId_createdAt_idx"
ON "commerce_reservation_events"("reservationId", "createdAt");
CREATE INDEX "commerce_reservation_events_type_idx"
ON "commerce_reservation_events"("type");

ALTER TABLE "commerce_reservation_items"
ADD CONSTRAINT "commerce_reservation_items_reservationId_fkey"
FOREIGN KEY ("reservationId") REFERENCES "commerce_reservations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commerce_reservation_events"
ADD CONSTRAINT "commerce_reservation_events_reservationId_fkey"
FOREIGN KEY ("reservationId") REFERENCES "commerce_reservations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

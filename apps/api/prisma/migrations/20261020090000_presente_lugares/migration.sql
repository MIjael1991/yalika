-- Presente: lugares guardados (Casa, Casa de mamá, Oficina), varias fotos por pedido y baja con respaldo.

CREATE TABLE "presente_places" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT,
    "neighborhood" TEXT,
    "municipalityCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "photoKey" TEXT,
    "photoMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "presente_places_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "presente_places_clientUserId_createdAt_idx" ON "presente_places"("clientUserId", "createdAt");

ALTER TABLE "presente_requests" ADD COLUMN "extraPhotos" JSONB;
ALTER TABLE "presente_requests" ADD COLUMN "placeId" TEXT;
ALTER TABLE "presente_requests" ADD COLUMN "placeLabel" TEXT;

ALTER TABLE "presente_providers" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "presente_providers" ADD COLUMN "statusBeforeWithdraw" TEXT;

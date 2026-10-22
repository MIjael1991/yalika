-- Presente P3: cliente, varios oficios por pedido, trabajo en curso, mensajes,
-- recorrido, calificaciones, fotos del trabajador y faltas.
-- Los pedidos existentes conservan su oficio dentro de la nueva lista "trades".

ALTER TABLE "presente_providers" ADD COLUMN "suspendedUntil" TIMESTAMP(3);

ALTER TABLE "presente_requests" ADD COLUMN "trades" TEXT[];
UPDATE "presente_requests" SET "trades" = ARRAY["trade"];
DROP INDEX "presente_requests_status_trade_createdAt_idx";
ALTER TABLE "presente_requests" DROP COLUMN "trade";
ALTER TABLE "presente_requests"
  ADD COLUMN "lat" DOUBLE PRECISION,
  ADD COLUMN "lng" DOUBLE PRECISION,
  ADD COLUMN "enRouteAt" TIMESTAMP(3),
  ADD COLUMN "etaAt" TIMESTAMP(3),
  ADD COLUMN "delayNote" TEXT,
  ADD COLUMN "arrivedAt" TIMESTAMP(3),
  ADD COLUMN "arrivalDistanceM" INTEGER,
  ADD COLUMN "pinFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pinLockedUntil" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "estimatedMinutes" INTEGER,
  ADD COLUMN "finishedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledBy" TEXT,
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "cancelFeeMxn" INTEGER;
CREATE INDEX "presente_requests_status_createdAt_idx" ON "presente_requests"("status", "createdAt");

ALTER TABLE "presente_quotes" ADD COLUMN "durationMinutes" INTEGER;

CREATE TABLE "presente_clients" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "homeLat" DOUBLE PRECISION,
  "homeLng" DOUBLE PRECISION,
  "homeReference" TEXT,
  "housePhotoKey" TEXT,
  "housePhotoMime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "presente_clients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presente_clients_userId_key" ON "presente_clients"("userId");

CREATE TABLE "presente_messages" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "senderRole" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presente_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "presente_messages_requestId_createdAt_idx" ON "presente_messages"("requestId", "createdAt");

CREATE TABLE "presente_track_points" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presente_track_points_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "presente_track_points_requestId_recordedAt_idx" ON "presente_track_points"("requestId", "recordedAt");
CREATE INDEX "presente_track_points_recordedAt_idx" ON "presente_track_points"("recordedAt");

CREATE TABLE "presente_reviews" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "toRole" TEXT NOT NULL,
  "stars" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presente_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presente_reviews_requestId_fromUserId_key" ON "presente_reviews"("requestId", "fromUserId");
CREATE INDEX "presente_reviews_toUserId_createdAt_idx" ON "presente_reviews"("toUserId", "createdAt");

CREATE TABLE "presente_provider_photos" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "caption" TEXT,
  "objectKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presente_provider_photos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "presente_provider_photos_providerId_createdAt_idx" ON "presente_provider_photos"("providerId", "createdAt");

CREATE TABLE "presente_strikes" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presente_strikes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "presente_strikes_providerId_createdAt_idx" ON "presente_strikes"("providerId", "createdAt");

ALTER TABLE "presente_messages" ADD CONSTRAINT "presente_messages_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "presente_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "presente_track_points" ADD CONSTRAINT "presente_track_points_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "presente_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "presente_reviews" ADD CONSTRAINT "presente_reviews_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "presente_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "presente_provider_photos" ADD CONSTRAINT "presente_provider_photos_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "presente_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "presente_strikes" ADD CONSTRAINT "presente_strikes_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "presente_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

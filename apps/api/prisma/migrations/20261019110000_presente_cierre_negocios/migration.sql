-- Presente: negocios y clases en el perfil, cierre confirmado por el cliente, precio final,
-- mano de obra en obras y trabajos de varios días. Solo agrega columnas.

ALTER TABLE "presente_providers"
  ADD COLUMN "isBusiness" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "businessName" TEXT,
  ADD COLUMN "delivers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "teaches" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "presente_requests"
  ADD COLUMN "finalAmountMxn" INTEGER,
  ADD COLUMN "finalLaborMxn" INTEGER,
  ADD COLUMN "clientConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "autoConfirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "problemAt" TIMESTAMP(3),
  ADD COLUMN "problemNote" TEXT;

ALTER TABLE "presente_quotes"
  ADD COLUMN "durationDays" INTEGER,
  ADD COLUMN "laborMxn" INTEGER;

-- Trabajos terminados que esperan confirmación del cliente.
CREATE INDEX "presente_requests_status_finishedAt_idx" ON "presente_requests"("status", "finishedAt");

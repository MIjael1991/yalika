-- Presente P2 (aditiva): municipio y rango del trabajador, pedidos y presupuestos.
-- Solo agrega columnas opcionales y tablas nuevas; zoneLabel pasa a ser opcional.

ALTER TABLE "presente_providers" ADD COLUMN "municipalityCode" TEXT;
ALTER TABLE "presente_providers" ALTER COLUMN "zoneLabel" DROP NOT NULL;

CREATE TABLE "presente_requests" (
  "id" TEXT NOT NULL,
  "clientUserId" TEXT NOT NULL,
  "trade" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "municipalityCode" TEXT NOT NULL,
  "addressHint" TEXT,
  "urgency" TEXT NOT NULL DEFAULT 'NOW',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "photoKey" TEXT,
  "photoMime" TEXT,
  "chosenQuoteId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "presente_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "presente_quotes" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "amountMxn" INTEGER NOT NULL,
  "etaMinutes" INTEGER NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "presente_quotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "presente_requests_chosenQuoteId_key" ON "presente_requests"("chosenQuoteId");
CREATE INDEX "presente_requests_status_trade_createdAt_idx" ON "presente_requests"("status", "trade", "createdAt");
CREATE INDEX "presente_requests_clientUserId_createdAt_idx" ON "presente_requests"("clientUserId", "createdAt");
CREATE UNIQUE INDEX "presente_quotes_requestId_providerId_key" ON "presente_quotes"("requestId", "providerId");
CREATE INDEX "presente_quotes_providerId_status_idx" ON "presente_quotes"("providerId", "status");

ALTER TABLE "presente_quotes" ADD CONSTRAINT "presente_quotes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "presente_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "presente_quotes" ADD CONSTRAINT "presente_quotes_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "presente_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

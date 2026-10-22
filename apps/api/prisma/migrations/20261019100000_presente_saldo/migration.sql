-- Presente: saldo del trabajador (bono de bienvenida, recargas y comisión por trabajo). Solo agrega.

CREATE TABLE "presente_wallet_entries" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "requestId" TEXT,
  "reference" TEXT,
  "note" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presente_wallet_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presente_wallet_entries_dedupeKey_key" ON "presente_wallet_entries"("dedupeKey");
CREATE INDEX "presente_wallet_entries_providerId_createdAt_idx" ON "presente_wallet_entries"("providerId", "createdAt");

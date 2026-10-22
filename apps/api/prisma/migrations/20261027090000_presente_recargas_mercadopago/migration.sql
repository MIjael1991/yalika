-- Tequio: recargas de saldo pagadas con Mercado Pago.

CREATE TABLE "presente_topups" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amountMxn" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "preferenceId" TEXT,
    "paymentId" TEXT,
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "presente_topups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presente_topups_paymentId_key" ON "presente_topups"("paymentId");
CREATE INDEX "presente_topups_providerId_createdAt_idx" ON "presente_topups"("providerId", "createdAt");

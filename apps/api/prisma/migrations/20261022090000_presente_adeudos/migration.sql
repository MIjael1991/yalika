-- Tequio: adeudos por cancelar con el trabajador en camino (se suman al siguiente pedido).

CREATE TABLE "presente_cancel_debts" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "amountMxn" INTEGER NOT NULL,
    "advancedKm" DOUBLE PRECISION,
    "appliedRequestId" TEXT,
    "lastRemindedAt" TIMESTAMP(3),
    "settledHow" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "presente_cancel_debts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presente_cancel_debts_requestId_key" ON "presente_cancel_debts"("requestId");
CREATE INDEX "presente_cancel_debts_clientUserId_settledAt_idx" ON "presente_cancel_debts"("clientUserId", "settledAt");
CREATE INDEX "presente_cancel_debts_providerId_settledAt_idx" ON "presente_cancel_debts"("providerId", "settledAt");
CREATE INDEX "presente_cancel_debts_appliedRequestId_idx" ON "presente_cancel_debts"("appliedRequestId");

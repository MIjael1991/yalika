-- Tequio: calificación ligada a la factura y llamadas dentro de la app (sin números).

ALTER TABLE "presente_reviews" ADD COLUMN "invoiceMissing" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "presente_calls" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "callerUserId" TEXT NOT NULL,
    "calleeUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RINGING',
    "offerSdp" TEXT NOT NULL,
    "answerSdp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "presente_calls_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "presente_calls_requestId_createdAt_idx" ON "presente_calls"("requestId", "createdAt");
CREATE INDEX "presente_calls_calleeUserId_status_idx" ON "presente_calls"("calleeUserId", "status");

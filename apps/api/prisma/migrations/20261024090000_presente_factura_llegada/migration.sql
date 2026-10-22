-- Tequio: factura por medio de Tequio y avisos de retraso al ir en camino.

ALTER TABLE "presente_providers" ADD COLUMN "invoices" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "presente_clients" ADD COLUMN "fiscalRfc" TEXT;
ALTER TABLE "presente_clients" ADD COLUMN "fiscalName" TEXT;
ALTER TABLE "presente_clients" ADD COLUMN "fiscalRegime" TEXT;
ALTER TABLE "presente_clients" ADD COLUMN "fiscalZip" TEXT;
ALTER TABLE "presente_clients" ADD COLUMN "fiscalUse" TEXT;
ALTER TABLE "presente_clients" ADD COLUMN "fiscalEmail" TEXT;

ALTER TABLE "presente_requests" ADD COLUMN "needsInvoice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "presente_requests" ADD COLUMN "invoiceData" JSONB;
ALTER TABLE "presente_requests" ADD COLUMN "delayCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "presente_invoices" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "uuid" TEXT,
    "receiverRfc" TEXT NOT NULL,
    "totalMxn" DOUBLE PRECISION,
    "pdfKey" TEXT NOT NULL,
    "xmlKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "presente_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presente_invoices_requestId_key" ON "presente_invoices"("requestId");
CREATE INDEX "presente_invoices_providerId_sentAt_idx" ON "presente_invoices"("providerId", "sentAt");
CREATE INDEX "presente_invoices_clientUserId_sentAt_idx" ON "presente_invoices"("clientUserId", "sentAt");

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "data" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_companyId_type_idx" ON "events"("companyId", "type");

-- CreateIndex
CREATE INDEX "events_occurredAt_idx" ON "events"("occurredAt");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

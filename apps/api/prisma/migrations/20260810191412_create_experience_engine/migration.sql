-- CreateTable
CREATE TABLE "experiences" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'incident_resolution',
    "category" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "delayMinutes" INTEGER,
    "extraCost" DOUBLE PRECISION,
    "estimatedLoss" DOUBLE PRECISION,
    "customersAffected" INTEGER,
    "notes" TEXT,
    "selectedAlternativeTitle" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "selectedAlternativeId" TEXT,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experiences_companyId_category_idx" ON "experiences"("companyId", "category");

-- CreateIndex
CREATE INDEX "experiences_incidentId_idx" ON "experiences"("incidentId");

-- CreateIndex
CREATE INDEX "experiences_workflowId_idx" ON "experiences"("workflowId");

-- CreateIndex
CREATE INDEX "experiences_selectedAlternativeId_idx" ON "experiences"("selectedAlternativeId");

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_selectedAlternativeId_fkey" FOREIGN KEY ("selectedAlternativeId") REFERENCES "incident_alternatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

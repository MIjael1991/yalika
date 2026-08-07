-- CreateTable
CREATE TABLE "incident_alternatives" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cost" DOUBLE PRECISION,
    "delayMinutes" INTEGER,
    "estimatedLoss" DOUBLE PRECISION,
    "continuityScore" INTEGER,
    "impact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "incidentId" TEXT NOT NULL,

    CONSTRAINT "incident_alternatives_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "incident_alternatives" ADD CONSTRAINT "incident_alternatives_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

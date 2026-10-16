CREATE TABLE "clinical_emergency_profiles" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "bloodType" TEXT,
  "bloodTypeSource" TEXT NOT NULL DEFAULT 'PATIENT',
  "bloodTypeConfirmationStatus" TEXT NOT NULL DEFAULT 'REPORTED',
  "emergencyContactName" TEXT,
  "emergencyContactRelationship" TEXT,
  "emergencyContactPhone" TEXT,
  "emergencyNotes" TEXT,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_emergency_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinical_chronic_conditions" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "conditionName" TEXT NOT NULL,
  "diagnosedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "source" TEXT NOT NULL DEFAULT 'PATIENT',
  "confirmationStatus" TEXT NOT NULL DEFAULT 'REPORTED',
  "notes" TEXT,
  "operationId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_chronic_conditions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clinical_emergency_profiles_clinicalProfileId_key"
ON "clinical_emergency_profiles"("clinicalProfileId");
CREATE INDEX "clinical_emergency_profiles_clinicalProfileId_idx"
ON "clinical_emergency_profiles"("clinicalProfileId");
CREATE UNIQUE INDEX "clinical_chronic_conditions_operationId_key"
ON "clinical_chronic_conditions"("operationId");
CREATE INDEX "clinical_chronic_conditions_clinicalProfileId_status_idx"
ON "clinical_chronic_conditions"("clinicalProfileId", "status");
CREATE INDEX "clinical_chronic_conditions_clinicalProfileId_createdAt_idx"
ON "clinical_chronic_conditions"("clinicalProfileId", "createdAt");

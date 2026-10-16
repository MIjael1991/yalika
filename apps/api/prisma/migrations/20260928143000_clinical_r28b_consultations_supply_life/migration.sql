-- YALEKA SALUD R2.8B
-- Additive only. Does not alter or drop existing clinical tables.

CREATE TABLE "clinical_subject_extensions" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL DEFAULT 'HUMAN',
  "species" TEXT,
  "breed" TEXT,
  "sex" TEXT,
  "birthDate" TIMESTAMP(3),
  "guardianUserId" TEXT,
  "animalIdentifier" TEXT,
  "weightValue" DOUBLE PRECISION,
  "weightUnit" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_subject_extensions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_subject_extensions_subjectType_check"
    CHECK ("subjectType" IN ('HUMAN', 'PET', 'LIVESTOCK')),
  CONSTRAINT "clinical_subject_extensions_weightValue_check"
    CHECK ("weightValue" IS NULL OR "weightValue" > 0)
);

CREATE UNIQUE INDEX "clinical_subject_extensions_clinicalProfileId_key"
ON "clinical_subject_extensions"("clinicalProfileId");

CREATE INDEX "clinical_subject_extensions_subjectType_idx"
ON "clinical_subject_extensions"("subjectType");

CREATE INDEX "clinical_subject_extensions_guardianUserId_idx"
ON "clinical_subject_extensions"("guardianUserId");

ALTER TABLE "clinical_subject_extensions"
ADD CONSTRAINT "clinical_subject_extensions_clinicalProfileId_fkey"
FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clinical_subject_extensions"
ADD CONSTRAINT "clinical_subject_extensions_guardianUserId_fkey"
FOREIGN KEY ("guardianUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "clinical_consultations" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "patientUserId" TEXT,
  "clinicianUserId" TEXT,
  "subjectType" TEXT NOT NULL DEFAULT 'HUMAN',
  "mode" TEXT NOT NULL DEFAULT 'online',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
  "reason" TEXT,
  "professionalSummary" TEXT,
  "priceCents" INTEGER NOT NULL DEFAULT 500,
  "currency" TEXT NOT NULL DEFAULT 'MXN',
  "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
  "paymentReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_consultations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_consultations_subjectType_check"
    CHECK ("subjectType" IN ('HUMAN', 'PET', 'LIVESTOCK')),
  CONSTRAINT "clinical_consultations_mode_check"
    CHECK ("mode" IN ('online', 'presential', 'follow_up')),
  CONSTRAINT "clinical_consultations_status_check"
    CHECK ("status" IN ('scheduled', 'active', 'completed', 'cancelled', 'expired')),
  CONSTRAINT "clinical_consultations_priceCents_check"
    CHECK ("priceCents" >= 0),
  CONSTRAINT "clinical_consultations_paymentStatus_check"
    CHECK ("paymentStatus" IN ('pending', 'paid', 'waived', 'refunded', 'cancelled'))
);

CREATE INDEX "clinical_consultations_clinicalProfileId_scheduledAt_idx"
ON "clinical_consultations"("clinicalProfileId", "scheduledAt");

CREATE INDEX "clinical_consultations_patientUserId_status_scheduledAt_idx"
ON "clinical_consultations"("patientUserId", "status", "scheduledAt");

CREATE INDEX "clinical_consultations_clinicianUserId_status_scheduledAt_idx"
ON "clinical_consultations"("clinicianUserId", "status", "scheduledAt");

ALTER TABLE "clinical_consultations"
ADD CONSTRAINT "clinical_consultations_clinicalProfileId_fkey"
FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clinical_consultations"
ADD CONSTRAINT "clinical_consultations_patientUserId_fkey"
FOREIGN KEY ("patientUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clinical_consultations"
ADD CONSTRAINT "clinical_consultations_clinicianUserId_fkey"
FOREIGN KEY ("clinicianUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "clinical_consultation_links" (
  "id" TEXT NOT NULL,
  "consultationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'consultation_access',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_consultation_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_consultation_links_maxUses_check"
    CHECK ("maxUses" > 0 AND "maxUses" <= 100),
  CONSTRAINT "clinical_consultation_links_useCount_check"
    CHECK ("useCount" >= 0)
);

CREATE UNIQUE INDEX "clinical_consultation_links_tokenHash_key"
ON "clinical_consultation_links"("tokenHash");

CREATE INDEX "clinical_consultation_links_consultationId_expiresAt_idx"
ON "clinical_consultation_links"("consultationId", "expiresAt");

CREATE INDEX "clinical_consultation_links_expiresAt_revokedAt_idx"
ON "clinical_consultation_links"("expiresAt", "revokedAt");

ALTER TABLE "clinical_consultation_links"
ADD CONSTRAINT "clinical_consultation_links_consultationId_fkey"
FOREIGN KEY ("consultationId") REFERENCES "clinical_consultations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clinical_consultation_links"
ADD CONSTRAINT "clinical_consultation_links_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "clinical_medication_regimens" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "consultationId" TEXT,
  "prescriptionId" TEXT,
  "prescriptionItemId" TEXT,
  "instructions" TEXT NOT NULL,
  "doseAmount" DOUBLE PRECISION NOT NULL,
  "doseUnit" TEXT NOT NULL,
  "administrationsPerDay" DOUBLE PRECISION NOT NULL,
  "durationDays" DOUBLE PRECISION NOT NULL,
  "requiredUnits" DOUBLE PRECISION NOT NULL,
  "dispensedUnits" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "remainingUnits" DOUBLE PRECISION NOT NULL,
  "packageUnits" DOUBLE PRECISION,
  "supplyStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "firstDoseAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_medication_regimens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_medication_regimens_positive_check"
    CHECK (
      "doseAmount" > 0 AND
      "administrationsPerDay" > 0 AND
      "durationDays" > 0 AND
      "requiredUnits" > 0 AND
      "dispensedUnits" >= 0 AND
      "remainingUnits" >= 0 AND
      ("packageUnits" IS NULL OR "packageUnits" > 0)
    ),
  CONSTRAINT "clinical_medication_regimens_supplyStatus_check"
    CHECK ("supplyStatus" IN ('PENDING', 'PARTIALLY_FILLED', 'FILLED'))
);

CREATE INDEX "clinical_medication_regimens_clinicalProfileId_supplyStatus_idx"
ON "clinical_medication_regimens"("clinicalProfileId", "supplyStatus");

CREATE INDEX "clinical_medication_regimens_prescriptionId_idx"
ON "clinical_medication_regimens"("prescriptionId");

CREATE INDEX "clinical_medication_regimens_prescriptionItemId_idx"
ON "clinical_medication_regimens"("prescriptionItemId");

CREATE INDEX "clinical_medication_regimens_consultationId_idx"
ON "clinical_medication_regimens"("consultationId");

ALTER TABLE "clinical_medication_regimens"
ADD CONSTRAINT "clinical_medication_regimens_clinicalProfileId_fkey"
FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clinical_medication_regimens"
ADD CONSTRAINT "clinical_medication_regimens_consultationId_fkey"
FOREIGN KEY ("consultationId") REFERENCES "clinical_consultations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clinical_medication_regimens"
ADD CONSTRAINT "clinical_medication_regimens_prescriptionId_fkey"
FOREIGN KEY ("prescriptionId") REFERENCES "clinical_prescriptions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clinical_medication_regimens"
ADD CONSTRAINT "clinical_medication_regimens_prescriptionItemId_fkey"
FOREIGN KEY ("prescriptionItemId") REFERENCES "clinical_prescription_items"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clinical_medication_regimens"
ADD CONSTRAINT "clinical_medication_regimens_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "clinical_dispense_events" (
  "id" TEXT NOT NULL,
  "regimenId" TEXT NOT NULL,
  "quantityPresented" DOUBLE PRECISION NOT NULL,
  "packageUnits" DOUBLE PRECISION,
  "packagesPresented" INTEGER,
  "prescriptionUnitsCovered" DOUBLE PRECISION NOT NULL,
  "surplusUnits" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "providerUserId" TEXT,
  "providerName" TEXT,
  "inventoryReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_dispense_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_dispense_events_quantities_check"
    CHECK (
      "quantityPresented" > 0 AND
      "prescriptionUnitsCovered" >= 0 AND
      "surplusUnits" >= 0 AND
      ("packageUnits" IS NULL OR "packageUnits" > 0) AND
      ("packagesPresented" IS NULL OR "packagesPresented" > 0)
    )
);

CREATE UNIQUE INDEX "clinical_dispense_events_idempotencyKey_key"
ON "clinical_dispense_events"("idempotencyKey");

CREATE INDEX "clinical_dispense_events_regimenId_dispensedAt_idx"
ON "clinical_dispense_events"("regimenId", "dispensedAt");

CREATE INDEX "clinical_dispense_events_providerUserId_dispensedAt_idx"
ON "clinical_dispense_events"("providerUserId", "dispensedAt");

ALTER TABLE "clinical_dispense_events"
ADD CONSTRAINT "clinical_dispense_events_regimenId_fkey"
FOREIGN KEY ("regimenId") REFERENCES "clinical_medication_regimens"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clinical_dispense_events"
ADD CONSTRAINT "clinical_dispense_events_providerUserId_fkey"
FOREIGN KEY ("providerUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "clinical_integration_events" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "title" TEXT NOT NULL,
  "sensitivity" TEXT NOT NULL DEFAULT 'PRIVATE',
  "metadata" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "dedupeKey" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_integration_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_integration_events_sensitivity_check"
    CHECK ("sensitivity" = 'PRIVATE'),
  CONSTRAINT "clinical_integration_events_status_check"
    CHECK ("status" IN ('pending', 'delivered', 'cancelled'))
);

CREATE UNIQUE INDEX "clinical_integration_events_dedupeKey_key"
ON "clinical_integration_events"("dedupeKey");

CREATE INDEX "clinical_integration_events_userId_status_dueAt_idx"
ON "clinical_integration_events"("userId", "status", "dueAt");

CREATE INDEX "clinical_integration_events_eventType_status_idx"
ON "clinical_integration_events"("eventType", "status");

ALTER TABLE "clinical_integration_events"
ADD CONSTRAINT "clinical_integration_events_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- YALEKA SALUD R2.9 - Complete care layer
-- Additive only. No DROP, no destructive column changes.

CREATE TABLE "clinical_visit_captures" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "consultationId" TEXT,
  "sourceType" TEXT NOT NULL,
  "documentId" TEXT,
  "sourceText" TEXT,
  "proposedData" JSONB,
  "confirmedData" JSONB,
  "confirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "operationId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_visit_captures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_visit_captures_sourceType_check" CHECK ("sourceType" IN ('PHOTO','FILE','VOICE','MANUAL')),
  CONSTRAINT "clinical_visit_captures_confirmationStatus_check" CHECK ("confirmationStatus" IN ('PENDING','CONFIRMED','REJECTED','PARTIAL'))
);
CREATE UNIQUE INDEX "clinical_visit_captures_operationId_key" ON "clinical_visit_captures"("operationId");
CREATE INDEX "clinical_visit_captures_clinicalProfileId_createdAt_idx" ON "clinical_visit_captures"("clinicalProfileId", "createdAt");
CREATE INDEX "clinical_visit_captures_consultationId_idx" ON "clinical_visit_captures"("consultationId");
CREATE INDEX "clinical_visit_captures_documentId_idx" ON "clinical_visit_captures"("documentId");
ALTER TABLE "clinical_visit_captures" ADD CONSTRAINT "clinical_visit_captures_profile_fkey" FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_visit_captures" ADD CONSTRAINT "clinical_visit_captures_consultation_fkey" FOREIGN KEY ("consultationId") REFERENCES "clinical_consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_visit_captures" ADD CONSTRAINT "clinical_visit_captures_document_fkey" FOREIGN KEY ("documentId") REFERENCES "clinical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_visit_captures" ADD CONSTRAINT "clinical_visit_captures_createdBy_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_medication_schedules" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "regimenId" TEXT NOT NULL,
  "firstDoseAt" TIMESTAMP(3) NOT NULL,
  "intervalMinutes" INTEGER NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "nextDoseAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "operationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_medication_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_medication_schedules_interval_check" CHECK ("intervalMinutes" >= 15 AND "intervalMinutes" <= 10080),
  CONSTRAINT "clinical_medication_schedules_status_check" CHECK ("status" IN ('ACTIVE','SUSPENDED','FINISHED','CANCELLED')),
  CONSTRAINT "clinical_medication_schedules_dates_check" CHECK ("endAt" >= "firstDoseAt")
);
CREATE UNIQUE INDEX "clinical_medication_schedules_operationId_key" ON "clinical_medication_schedules"("operationId");
CREATE INDEX "clinical_medication_schedules_profile_status_next_idx" ON "clinical_medication_schedules"("clinicalProfileId", "status", "nextDoseAt");
CREATE INDEX "clinical_medication_schedules_regimen_status_idx" ON "clinical_medication_schedules"("regimenId", "status");
ALTER TABLE "clinical_medication_schedules" ADD CONSTRAINT "clinical_medication_schedules_profile_fkey" FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_medication_schedules" ADD CONSTRAINT "clinical_medication_schedules_regimen_fkey" FOREIGN KEY ("regimenId") REFERENCES "clinical_medication_regimens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_medication_schedules" ADD CONSTRAINT "clinical_medication_schedules_createdBy_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_medication_administrations" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "note" TEXT,
  "operationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_medication_administrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_medication_administrations_status_check" CHECK ("status" IN ('TAKEN','OMITTED','SUSPENDED','RESUMED','FINISHED'))
);
CREATE UNIQUE INDEX "clinical_medication_administrations_operationId_key" ON "clinical_medication_administrations"("operationId");
CREATE INDEX "clinical_medication_administrations_schedule_scheduled_idx" ON "clinical_medication_administrations"("scheduleId", "scheduledAt");
CREATE INDEX "clinical_medication_administrations_status_scheduled_idx" ON "clinical_medication_administrations"("status", "scheduledAt");
ALTER TABLE "clinical_medication_administrations" ADD CONSTRAINT "clinical_medication_administrations_schedule_fkey" FOREIGN KEY ("scheduleId") REFERENCES "clinical_medication_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_medication_administrations" ADD CONSTRAINT "clinical_medication_administrations_createdBy_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_allergies" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "substance" TEXT NOT NULL,
  "allergyType" TEXT NOT NULL,
  "reaction" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
  "approximateDate" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'PATIENT',
  "confirmationStatus" TEXT NOT NULL DEFAULT 'REPORTED',
  "sourceDocumentId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "operationId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_allergies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_allergies_type_check" CHECK ("allergyType" IN ('MEDICATION','FOOD','ENVIRONMENTAL','OTHER')),
  CONSTRAINT "clinical_allergies_severity_check" CHECK ("severity" IN ('MILD','MODERATE','SEVERE','UNSPECIFIED')),
  CONSTRAINT "clinical_allergies_confirmation_check" CHECK ("confirmationStatus" IN ('REPORTED','DOCUMENTED','PROFESSIONAL_CONFIRMED'))
);
CREATE UNIQUE INDEX "clinical_allergies_operationId_key" ON "clinical_allergies"("operationId");
CREATE INDEX "clinical_allergies_profile_active_type_idx" ON "clinical_allergies"("clinicalProfileId", "active", "allergyType");
ALTER TABLE "clinical_allergies" ADD CONSTRAINT "clinical_allergies_profile_fkey" FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_allergies" ADD CONSTRAINT "clinical_allergies_document_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "clinical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_allergies" ADD CONSTRAINT "clinical_allergies_createdBy_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_restrictions" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "restrictionType" TEXT NOT NULL,
  "reactionOrReason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'PATIENT',
  "confirmationStatus" TEXT NOT NULL DEFAULT 'REPORTED',
  "sourceDocumentId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "operationId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_restrictions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_restrictions_type_check" CHECK ("restrictionType" IN ('FOOD_ALLERGY','INTOLERANCE','PREFERRED_AVOID','MEDICAL_RESTRICTION')),
  CONSTRAINT "clinical_restrictions_confirmation_check" CHECK ("confirmationStatus" IN ('REPORTED','DOCUMENTED','PROFESSIONAL_CONFIRMED'))
);
CREATE UNIQUE INDEX "clinical_restrictions_operationId_key" ON "clinical_restrictions"("operationId");
CREATE INDEX "clinical_restrictions_profile_active_type_idx" ON "clinical_restrictions"("clinicalProfileId", "active", "restrictionType");
ALTER TABLE "clinical_restrictions" ADD CONSTRAINT "clinical_restrictions_profile_fkey" FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_restrictions" ADD CONSTRAINT "clinical_restrictions_document_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "clinical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_restrictions" ADD CONSTRAINT "clinical_restrictions_createdBy_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_procedures" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "consultationId" TEXT,
  "procedureName" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "hospitalName" TEXT,
  "clinicianName" TEXT,
  "notes" TEXT,
  "dischargeDocumentId" TEXT,
  "followUpAt" TIMESTAMP(3),
  "operationId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_procedures_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_procedures_operationId_key" ON "clinical_procedures"("operationId");
CREATE INDEX "clinical_procedures_profile_occurred_idx" ON "clinical_procedures"("clinicalProfileId", "occurredAt");
ALTER TABLE "clinical_procedures" ADD CONSTRAINT "clinical_procedures_profile_fkey" FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_procedures" ADD CONSTRAINT "clinical_procedures_consultation_fkey" FOREIGN KEY ("consultationId") REFERENCES "clinical_consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_procedures" ADD CONSTRAINT "clinical_procedures_document_fkey" FOREIGN KEY ("dischargeDocumentId") REFERENCES "clinical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_procedures" ADD CONSTRAINT "clinical_procedures_createdBy_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_follow_up_proposals" (
  "id" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "consultationId" TEXT,
  "sourceDocumentId" TEXT,
  "recommendationText" TEXT NOT NULL,
  "targetAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "acceptedConsultationId" TEXT,
  "operationId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_follow_up_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_follow_up_proposals_status_check" CHECK ("status" IN ('PROPOSED','ACCEPTED','REJECTED','CANCELLED'))
);
CREATE UNIQUE INDEX "clinical_follow_up_proposals_operationId_key" ON "clinical_follow_up_proposals"("operationId");
CREATE INDEX "clinical_follow_up_proposals_profile_status_target_idx" ON "clinical_follow_up_proposals"("clinicalProfileId", "status", "targetAt");
ALTER TABLE "clinical_follow_up_proposals" ADD CONSTRAINT "clinical_follow_up_proposals_profile_fkey" FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_follow_up_proposals" ADD CONSTRAINT "clinical_follow_up_proposals_consultation_fkey" FOREIGN KEY ("consultationId") REFERENCES "clinical_consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_follow_up_proposals" ADD CONSTRAINT "clinical_follow_up_proposals_document_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "clinical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_follow_up_proposals" ADD CONSTRAINT "clinical_follow_up_proposals_acceptedConsultation_fkey" FOREIGN KEY ("acceptedConsultationId") REFERENCES "clinical_consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_follow_up_proposals" ADD CONSTRAINT "clinical_follow_up_proposals_createdBy_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_operation_receipts" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "clinicalProfileId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_operation_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_operation_receipts_operationId_key" ON "clinical_operation_receipts"("operationId");
CREATE INDEX "clinical_operation_receipts_profile_created_idx" ON "clinical_operation_receipts"("clinicalProfileId", "createdAt");
CREATE INDEX "clinical_operation_receipts_actor_created_idx" ON "clinical_operation_receipts"("actorUserId", "createdAt");
ALTER TABLE "clinical_operation_receipts" ADD CONSTRAINT "clinical_operation_receipts_profile_fkey" FOREIGN KEY ("clinicalProfileId") REFERENCES "clinical_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_operation_receipts" ADD CONSTRAINT "clinical_operation_receipts_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

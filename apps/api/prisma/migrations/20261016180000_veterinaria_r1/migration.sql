-- Veterinaria R1 (aditiva): solo CREATE TABLE / INDEX / FK sobre tablas nuevas.
-- No altera ninguna tabla existente.

CREATE TABLE "vet_pets" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "species" TEXT NOT NULL,
  "breed" TEXT,
  "sex" TEXT,
  "birthDate" TIMESTAMP(3),
  "birthDateApprox" BOOLEAN NOT NULL DEFAULT false,
  "microchip" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vet_pets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vet_pet_guardians" (
  "id" TEXT NOT NULL,
  "petId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'OWNER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "invitedById" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vet_pet_guardians_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vet_consultations" (
  "id" TEXT NOT NULL,
  "petId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "veterinarianUserId" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'presential',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
  "reason" TEXT,
  "professionalSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vet_consultations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vet_prescriptions" (
  "id" TEXT NOT NULL,
  "petId" TEXT NOT NULL,
  "consultationId" TEXT NOT NULL,
  "veterinarianUserId" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vet_prescriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vet_prescription_items" (
  "id" TEXT NOT NULL,
  "prescriptionId" TEXT NOT NULL,
  "medicationName" TEXT NOT NULL,
  "strength" TEXT,
  "form" TEXT,
  "route" TEXT,
  "dosageText" TEXT,
  "frequencyText" TEXT,
  "durationText" TEXT,
  "quantityText" TEXT,
  "instructions" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vet_prescription_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vet_audit_events" (
  "id" TEXT NOT NULL,
  "petId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "result" TEXT NOT NULL DEFAULT 'RECORDED',
  "resourceType" TEXT,
  "resourceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vet_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vet_pets_createdByUserId_idx" ON "vet_pets"("createdByUserId");
CREATE INDEX "vet_pets_microchip_idx" ON "vet_pets"("microchip");

CREATE UNIQUE INDEX "vet_pet_guardians_petId_userId_key" ON "vet_pet_guardians"("petId", "userId");
CREATE INDEX "vet_pet_guardians_userId_status_idx" ON "vet_pet_guardians"("userId", "status");

CREATE INDEX "vet_consultations_petId_scheduledAt_idx" ON "vet_consultations"("petId", "scheduledAt");
CREATE INDEX "vet_consultations_veterinarianUserId_status_scheduledAt_idx" ON "vet_consultations"("veterinarianUserId", "status", "scheduledAt");
CREATE INDEX "vet_consultations_requestedByUserId_status_idx" ON "vet_consultations"("requestedByUserId", "status");

CREATE UNIQUE INDEX "vet_prescriptions_consultationId_idempotencyKey_key" ON "vet_prescriptions"("consultationId", "idempotencyKey");
CREATE INDEX "vet_prescriptions_petId_issuedAt_idx" ON "vet_prescriptions"("petId", "issuedAt");

CREATE INDEX "vet_prescription_items_prescriptionId_sortOrder_idx" ON "vet_prescription_items"("prescriptionId", "sortOrder");

CREATE INDEX "vet_audit_events_petId_createdAt_idx" ON "vet_audit_events"("petId", "createdAt");
CREATE INDEX "vet_audit_events_actorUserId_createdAt_idx" ON "vet_audit_events"("actorUserId", "createdAt");

ALTER TABLE "vet_pet_guardians" ADD CONSTRAINT "vet_pet_guardians_petId_fkey" FOREIGN KEY ("petId") REFERENCES "vet_pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vet_consultations" ADD CONSTRAINT "vet_consultations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "vet_pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_petId_fkey" FOREIGN KEY ("petId") REFERENCES "vet_pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "vet_consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vet_prescription_items" ADD CONSTRAINT "vet_prescription_items_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "vet_prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vet_audit_events" ADD CONSTRAINT "vet_audit_events_petId_fkey" FOREIGN KEY ("petId") REFERENCES "vet_pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

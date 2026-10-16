CREATE TABLE "clinical_organization_locations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracyMeters" DOUBLE PRECISION,
  "source" TEXT NOT NULL DEFAULT 'DEVICE',
  "capturedById" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_organization_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinical_organization_evidence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "clinical_organization_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinical_professional_invitations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "invitedEmail" TEXT NOT NULL,
  "invitedUserId" TEXT,
  "relationshipType" TEXT NOT NULL DEFAULT 'AGREEMENT',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "createdById" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "membershipId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_professional_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinical_organization_review_submissions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "snapshot" JSONB NOT NULL,
  "submittedById" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_organization_review_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clinical_organization_locations_organizationId_key"
ON "clinical_organization_locations"("organizationId");

CREATE INDEX "clinical_organization_locations_capturedById_capturedAt_idx"
ON "clinical_organization_locations"("capturedById", "capturedAt");

CREATE INDEX "clinical_organization_evidence_organizationId_kind_deletedAt_idx"
ON "clinical_organization_evidence"("organizationId", "kind", "deletedAt");

CREATE INDEX "clinical_organization_evidence_createdById_createdAt_idx"
ON "clinical_organization_evidence"("createdById", "createdAt");

CREATE INDEX "clinical_professional_invitations_organizationId_status_idx"
ON "clinical_professional_invitations"("organizationId", "status");

CREATE INDEX "clinical_professional_invitations_invitedEmail_status_idx"
ON "clinical_professional_invitations"("invitedEmail", "status");

CREATE INDEX "clinical_professional_invitations_invitedUserId_status_idx"
ON "clinical_professional_invitations"("invitedUserId", "status");

CREATE INDEX "clinical_organization_review_submissions_organizationId_submittedAt_idx"
ON "clinical_organization_review_submissions"("organizationId", "submittedAt");

CREATE INDEX "clinical_organization_review_submissions_status_submittedAt_idx"
ON "clinical_organization_review_submissions"("status", "submittedAt");

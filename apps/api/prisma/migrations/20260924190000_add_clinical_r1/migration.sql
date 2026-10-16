-- YALIKA SALUD R1
-- Revisión manual obligatoria antes de aplicar.

CREATE TABLE "clinical_profiles" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "displayName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_profiles_ownerUserId_key" ON "clinical_profiles"("ownerUserId");

CREATE TABLE "clinical_documents" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'PATIENT_PROVIDED',
  "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "clinicalDate" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "clinical_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_documents_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "clinical_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "clinical_documents_profileId_sha256_key" ON "clinical_documents"("profileId","sha256");
CREATE INDEX "clinical_documents_profileId_clinicalDate_idx" ON "clinical_documents"("profileId","clinicalDate");
CREATE INDEX "clinical_documents_profileId_createdAt_idx" ON "clinical_documents"("profileId","createdAt");

CREATE TABLE "clinical_document_versions" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'ORIGINAL',
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_document_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "clinical_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "clinical_document_versions_documentId_versionNumber_key" ON "clinical_document_versions"("documentId","versionNumber");
CREATE INDEX "clinical_document_versions_documentId_createdAt_idx" ON "clinical_document_versions"("documentId","createdAt");

CREATE TABLE "clinical_timeline_events" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'PATIENT',
  "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "metadata" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_timeline_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_timeline_events_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "clinical_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "clinical_timeline_events_profileId_occurredAt_idx" ON "clinical_timeline_events"("profileId","occurredAt");
CREATE INDEX "clinical_timeline_events_profileId_kind_occurredAt_idx" ON "clinical_timeline_events"("profileId","kind","occurredAt");

CREATE TABLE "clinical_prescriptions" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "documentId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'PATIENT_PROVIDED',
  "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "prescriberName" TEXT,
  "institutionName" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_prescriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_prescriptions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "clinical_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_prescriptions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "clinical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "clinical_prescriptions_profileId_issuedAt_idx" ON "clinical_prescriptions"("profileId","issuedAt");

CREATE TABLE "clinical_prescription_items" (
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
  CONSTRAINT "clinical_prescription_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_prescription_items_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "clinical_prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "clinical_prescription_items_prescriptionId_sortOrder_idx" ON "clinical_prescription_items"("prescriptionId","sortOrder");

CREATE TABLE "clinical_share_links" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "resources" JSONB NOT NULL,
  "permissions" JSONB NOT NULL,
  "purpose" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "clinical_share_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_share_links_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "clinical_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "clinical_share_links_tokenHash_key" ON "clinical_share_links"("tokenHash");
CREATE INDEX "clinical_share_links_profileId_status_expiresAt_idx" ON "clinical_share_links"("profileId","status","expiresAt");

CREATE TABLE "clinical_access_requests" (
  "id" TEXT NOT NULL,
  "shareLinkId" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "decidedByUserId" TEXT,
  CONSTRAINT "clinical_access_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_access_requests_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "clinical_share_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "clinical_access_requests_shareLinkId_requesterUserId_key" ON "clinical_access_requests"("shareLinkId","requesterUserId");
CREATE INDEX "clinical_access_requests_requesterUserId_status_idx" ON "clinical_access_requests"("requesterUserId","status");

CREATE TABLE "clinical_access_grants" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "shareLinkId" TEXT NOT NULL,
  "accessRequestId" TEXT NOT NULL,
  "granteeUserId" TEXT NOT NULL,
  "resources" JSONB NOT NULL,
  "permissions" JSONB NOT NULL,
  "purpose" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_access_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_access_grants_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "clinical_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_access_grants_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "clinical_share_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinical_access_grants_accessRequestId_fkey" FOREIGN KEY ("accessRequestId") REFERENCES "clinical_access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "clinical_access_grants_accessRequestId_key" ON "clinical_access_grants"("accessRequestId");
CREATE INDEX "clinical_access_grants_profileId_status_expiresAt_idx" ON "clinical_access_grants"("profileId","status","expiresAt");
CREATE INDEX "clinical_access_grants_granteeUserId_status_expiresAt_idx" ON "clinical_access_grants"("granteeUserId","status","expiresAt");

CREATE TABLE "clinical_access_sessions" (
  "id" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "viewerUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "clinical_access_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_access_sessions_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "clinical_access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "clinical_access_sessions_grantId_status_idx" ON "clinical_access_sessions"("grantId","status");
CREATE INDEX "clinical_access_sessions_viewerUserId_status_expiresAt_idx" ON "clinical_access_sessions"("viewerUserId","status","expiresAt");

CREATE TABLE "clinical_audit_events" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "result" TEXT NOT NULL,
  "purpose" TEXT,
  "grantId" TEXT,
  "correlationId" TEXT,
  "operationId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_audit_events_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "clinical_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "clinical_audit_events_profileId_occurredAt_idx" ON "clinical_audit_events"("profileId","occurredAt");
CREATE INDEX "clinical_audit_events_actorUserId_occurredAt_idx" ON "clinical_audit_events"("actorUserId","occurredAt");

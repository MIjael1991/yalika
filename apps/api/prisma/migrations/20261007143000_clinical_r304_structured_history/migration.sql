CREATE TABLE "clinical_health_episodes" (
  "id" TEXT NOT NULL, "clinicalProfileId" TEXT NOT NULL, "episodeType" TEXT NOT NULL,
  "title" TEXT NOT NULL, "bodyRegion" TEXT, "startedAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "source" TEXT NOT NULL DEFAULT 'PATIENT',
  "confirmationStatus" TEXT NOT NULL DEFAULT 'REPORTED', "notes" TEXT, "operationId" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "clinical_health_episodes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_health_episodes_operationId_key" ON "clinical_health_episodes"("operationId");
CREATE INDEX "clinical_health_episodes_clinicalProfileId_status_startedAt_idx" ON "clinical_health_episodes"("clinicalProfileId","status","startedAt");
CREATE INDEX "clinical_health_episodes_clinicalProfileId_episodeType_idx" ON "clinical_health_episodes"("clinicalProfileId","episodeType");

CREATE TABLE "clinical_health_record_links" (
  "id" TEXT NOT NULL, "clinicalProfileId" TEXT NOT NULL, "parentType" TEXT NOT NULL,
  "parentId" TEXT NOT NULL, "resourceType" TEXT NOT NULL, "resourceId" TEXT NOT NULL,
  "relationType" TEXT NOT NULL DEFAULT 'RELATED', "operationId" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_health_record_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_health_record_links_operationId_key" ON "clinical_health_record_links"("operationId");
CREATE UNIQUE INDEX "clinical_health_record_links_profile_parent_resource_key" ON "clinical_health_record_links"("clinicalProfileId","parentType","parentId","resourceType","resourceId");
CREATE INDEX "clinical_health_record_links_profile_parent_idx" ON "clinical_health_record_links"("clinicalProfileId","parentType","parentId");
CREATE INDEX "clinical_health_record_links_profile_resource_idx" ON "clinical_health_record_links"("clinicalProfileId","resourceType","resourceId");

CREATE TABLE "clinical_health_privacy_settings" (
  "id" TEXT NOT NULL, "clinicalProfileId" TEXT NOT NULL, "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL, "sensitivity" TEXT NOT NULL DEFAULT 'STANDARD',
  "shareWithVerifiedProfessional" BOOLEAN NOT NULL DEFAULT false,
  "emergencyShare" BOOLEAN NOT NULL DEFAULT false, "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_health_privacy_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_health_privacy_settings_profile_resource_key" ON "clinical_health_privacy_settings"("clinicalProfileId","resourceType","resourceId");
CREATE INDEX "clinical_health_privacy_settings_profile_professional_idx" ON "clinical_health_privacy_settings"("clinicalProfileId","shareWithVerifiedProfessional");
CREATE INDEX "clinical_health_privacy_settings_profile_emergency_idx" ON "clinical_health_privacy_settings"("clinicalProfileId","emergencyShare");

CREATE TABLE "clinical_emergency_share_policies" (
  "id" TEXT NOT NULL, "clinicalProfileId" TEXT NOT NULL,
  "includeBloodType" BOOLEAN NOT NULL DEFAULT true, "includeAllergies" BOOLEAN NOT NULL DEFAULT true,
  "includeCurrentMedications" BOOLEAN NOT NULL DEFAULT true, "includeEmergencyContact" BOOLEAN NOT NULL DEFAULT true,
  "includeSharedConditions" BOOLEAN NOT NULL DEFAULT true, "includeSharedProcedures" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "clinical_emergency_share_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_emergency_share_policies_clinicalProfileId_key" ON "clinical_emergency_share_policies"("clinicalProfileId");

CREATE TABLE "clinical_emergency_relay_authorizations" (
  "id" TEXT NOT NULL, "clinicalProfileId" TEXT NOT NULL, "delegateUserId" TEXT NOT NULL,
  "relationship" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "canRelay" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_emergency_relay_authorizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_emergency_relay_authorizations_profile_delegate_key" ON "clinical_emergency_relay_authorizations"("clinicalProfileId","delegateUserId");
CREATE INDEX "clinical_emergency_relay_authorizations_delegate_status_idx" ON "clinical_emergency_relay_authorizations"("delegateUserId","status");
CREATE INDEX "clinical_emergency_relay_authorizations_profile_status_idx" ON "clinical_emergency_relay_authorizations"("clinicalProfileId","status");

CREATE TABLE "clinical_emergency_relay_links" (
  "id" TEXT NOT NULL, "clinicalProfileId" TEXT NOT NULL, "authorizationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL, "tokenPrefix" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "maxUses" INTEGER NOT NULL DEFAULT 10, "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL, "lastUsedAt" TIMESTAMP(3), "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_emergency_relay_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_emergency_relay_links_tokenHash_key" ON "clinical_emergency_relay_links"("tokenHash");
CREATE INDEX "clinical_emergency_relay_links_profile_status_expires_idx" ON "clinical_emergency_relay_links"("clinicalProfileId","status","expiresAt");
CREATE INDEX "clinical_emergency_relay_links_authorization_status_idx" ON "clinical_emergency_relay_links"("authorizationId","status");

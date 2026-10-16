CREATE TABLE "clinical_care_organizations" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "organizationType" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "legalName" TEXT,
  "rfc" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "neighborhood" TEXT,
  "municipality" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "sanitaryNoticeNumber" TEXT,
  "healthAuthorizationNumber" TEXT,
  "responsibleName" TEXT,
  "responsibleRole" TEXT,
  "responsibleProfessionalLicense" TEXT,
  "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "verificationSource" TEXT,
  "verificationNotes" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_care_organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinical_professional_profiles" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "professionalLicenseNumber" TEXT NOT NULL,
  "profession" TEXT NOT NULL,
  "specialty" TEXT,
  "specialistLicenseNumber" TEXT,
  "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "canPrescribe" BOOLEAN NOT NULL DEFAULT false,
  "verificationSource" TEXT,
  "verificationReference" TEXT,
  "verificationNotes" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_professional_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinical_organization_professionals" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL DEFAULT 'AGREEMENT',
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "endReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clinical_organization_professionals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinical_credential_verifications" (
  "id" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "verificationType" TEXT NOT NULL,
  "credentialValue" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceReference" TEXT,
  "result" TEXT NOT NULL,
  "notes" TEXT,
  "checkedById" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_credential_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinical_organization_verifications" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "verificationType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceReference" TEXT,
  "result" TEXT NOT NULL,
  "notes" TEXT,
  "checkedById" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_organization_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clinical_professional_profiles_userId_key" ON "clinical_professional_profiles"("userId");
CREATE UNIQUE INDEX "clinical_professional_profiles_professionalLicenseNumber_key" ON "clinical_professional_profiles"("professionalLicenseNumber");
CREATE INDEX "clinical_professional_profiles_verificationStatus_active_idx" ON "clinical_professional_profiles"("verificationStatus", "active");
CREATE INDEX "clinical_care_organizations_ownerUserId_active_idx" ON "clinical_care_organizations"("ownerUserId", "active");
CREATE INDEX "clinical_care_organizations_verificationStatus_organizationType_idx" ON "clinical_care_organizations"("verificationStatus", "organizationType");
CREATE UNIQUE INDEX "clinical_organization_professionals_organizationId_professionalProfileId_key" ON "clinical_organization_professionals"("organizationId", "professionalProfileId");
CREATE INDEX "clinical_organization_professionals_professionalProfileId_status_idx" ON "clinical_organization_professionals"("professionalProfileId", "status");
CREATE INDEX "clinical_organization_professionals_organizationId_status_idx" ON "clinical_organization_professionals"("organizationId", "status");
CREATE INDEX "clinical_credential_verifications_professionalProfileId_checkedAt_idx" ON "clinical_credential_verifications"("professionalProfileId", "checkedAt");
CREATE INDEX "clinical_credential_verifications_result_verificationType_idx" ON "clinical_credential_verifications"("result", "verificationType");
CREATE INDEX "clinical_organization_verifications_organizationId_checkedAt_idx" ON "clinical_organization_verifications"("organizationId", "checkedAt");
CREATE INDEX "clinical_organization_verifications_result_verificationType_idx" ON "clinical_organization_verifications"("result", "verificationType");

ALTER TABLE "clinical_organization_professionals"
ADD CONSTRAINT "clinical_organization_professionals_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "clinical_care_organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clinical_organization_professionals"
ADD CONSTRAINT "clinical_organization_professionals_professionalProfileId_fkey"
FOREIGN KEY ("professionalProfileId") REFERENCES "clinical_professional_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clinical_credential_verifications"
ADD CONSTRAINT "clinical_credential_verifications_professionalProfileId_fkey"
FOREIGN KEY ("professionalProfileId") REFERENCES "clinical_professional_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clinical_organization_verifications"
ADD CONSTRAINT "clinical_organization_verifications_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "clinical_care_organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

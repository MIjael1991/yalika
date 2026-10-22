-- Presente P1 (aditiva): solo CREATE TABLE / INDEX / FK sobre tablas nuevas.
-- No altera ninguna tabla existente.

CREATE TABLE "presente_providers" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "trades" TEXT[],
  "zoneLabel" TEXT NOT NULL,
  "radiusKm" INTEGER NOT NULL DEFAULT 5,
  "scheduleNote" TEXT,
  "curpHash" TEXT,
  "curpEncrypted" TEXT,
  "curpLast4" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "biometricConsentAt" TIMESTAMP(3),
  "consentVersion" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "reviewNote" TEXT,
  "presence" TEXT NOT NULL DEFAULT 'ABSENT',
  "presenceChangedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "presente_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "presente_documents" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presente_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "presente_audit_events" (
  "id" TEXT NOT NULL,
  "providerId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presente_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "presente_providers_userId_key" ON "presente_providers"("userId");
CREATE UNIQUE INDEX "presente_providers_curpHash_key" ON "presente_providers"("curpHash");
CREATE INDEX "presente_providers_status_submittedAt_idx" ON "presente_providers"("status", "submittedAt");
CREATE INDEX "presente_providers_presence_lastSeenAt_idx" ON "presente_providers"("presence", "lastSeenAt");
CREATE UNIQUE INDEX "presente_documents_providerId_kind_key" ON "presente_documents"("providerId", "kind");
CREATE INDEX "presente_audit_events_providerId_createdAt_idx" ON "presente_audit_events"("providerId", "createdAt");

ALTER TABLE "presente_documents" ADD CONSTRAINT "presente_documents_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "presente_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

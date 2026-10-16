-- CreateTable
CREATE TABLE "mobility_experience_preferences" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es-MX',
    "voiceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "spokenConfirmations" BOOLEAN NOT NULL DEFAULT true,
    "fareMode" TEXT NOT NULL DEFAULT 'BALANCED',
    "searchRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "simpleMode" BOOLEAN NOT NULL DEFAULT true,
    "largeControls" BOOLEAN NOT NULL DEFAULT false,
    "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_experience_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_voice_commands" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'INTERPRETED',
    "requestId" TEXT,
    "proposalId" TEXT,
    "amount" DOUBLE PRECISION,
    "payload" JSONB,
    "result" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_voice_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_negotiation_contexts" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "city" TEXT,
    "requestedMode" TEXT NOT NULL DEFAULT 'BALANCED',
    "createdByVoice" BOOLEAN NOT NULL DEFAULT false,
    "preferredSearchRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "source" TEXT NOT NULL DEFAULT 'YALEKA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_negotiation_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mobility_experience_preferences_subjectType_subjectId_idx" ON "mobility_experience_preferences"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_experience_preferences_subjectType_subjectId_key" ON "mobility_experience_preferences"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "mobility_voice_commands_subjectType_subjectId_createdAt_idx" ON "mobility_voice_commands"("subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_voice_commands_status_expiresAt_idx" ON "mobility_voice_commands"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "mobility_voice_commands_requestId_createdAt_idx" ON "mobility_voice_commands"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_negotiation_contexts_requestId_key" ON "mobility_negotiation_contexts"("requestId");

-- CreateIndex
CREATE INDEX "mobility_negotiation_contexts_city_createdAt_idx" ON "mobility_negotiation_contexts"("city", "createdAt");

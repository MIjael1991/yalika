-- DropIndex
DROP INDEX "survey_ine_submissions_backupConfirmedAt_idx";

-- CreateTable
CREATE TABLE "MobilitySavedPlace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "lastUsedAt" TIMESTAMP(3),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilitySavedPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobilitySearchPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rememberFrequentPlaces" BOOLEAN NOT NULL DEFAULT true,
    "showPremiumUi" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'PREMIUM_DARK',
    "homeLabel" TEXT,
    "workLabel" TEXT,
    "lastDestinationAddress" TEXT,
    "lastDestinationLat" DOUBLE PRECISION,
    "lastDestinationLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilitySearchPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobilitySavedPlace_userId_isActive_idx" ON "MobilitySavedPlace"("userId", "isActive");

-- CreateIndex
CREATE INDEX "MobilitySavedPlace_userId_visits_lastUsedAt_idx" ON "MobilitySavedPlace"("userId", "visits", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MobilitySavedPlace_userId_address_key" ON "MobilitySavedPlace"("userId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "MobilitySearchPreference_userId_key" ON "MobilitySearchPreference"("userId");

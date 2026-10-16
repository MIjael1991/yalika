-- CreateTable
CREATE TABLE "mobility_referral_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "appliesTo" TEXT NOT NULL DEFAULT 'BOTH',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "inviterRewardType" TEXT NOT NULL DEFAULT 'PROMO_CREDIT',
    "inviterRewardAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invitedRewardType" TEXT NOT NULL DEFAULT 'PROMO_CREDIT',
    "invitedRewardAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualificationType" TEXT NOT NULL DEFAULT 'FIRST_COMPLETED_TRIP',
    "qualificationCount" INTEGER NOT NULL DEFAULT 1,
    "maxRewardsPerInviter" INTEGER NOT NULL DEFAULT 20,
    "minQualifyingFare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_referral_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_referral_codes" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerDriverId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER NOT NULL DEFAULT 100,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_referral_attributions" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "inviterDriverId" TEXT,
    "referredUserId" TEXT NOT NULL,
    "referredRole" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "qualifyingTrips" INTEGER NOT NULL DEFAULT 0,
    "fraudReason" TEXT,
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_referral_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_referral_rewards" (
    "id" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "beneficiaryType" TEXT NOT NULL,
    "beneficiaryUserId" TEXT,
    "beneficiaryDriverId" TEXT,
    "rewardType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "referenceKey" TEXT NOT NULL,
    "metadata" JSONB,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_promo_balances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "available" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_promo_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_promo_movements" (
    "id" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_promo_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_verification_profiles" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "phone" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "identityStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "selfieVerified" BOOLEAN NOT NULL DEFAULT false,
    "documentVerified" BOOLEAN NOT NULL DEFAULT false,
    "trustLevel" TEXT NOT NULL DEFAULT 'BASIC',
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "riskFlags" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_verification_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_verification_events" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_vehicle_compliance" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL DEFAULT 'PRIVATE',
    "taxiPermitNumber" TEXT,
    "taxiConcessionRef" TEXT,
    "permitExpiresAt" TIMESTAMP(3),
    "insuranceExpiresAt" TIMESTAMP(3),
    "inspectionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_vehicle_compliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_pin_attempts" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "passengerUserId" TEXT,
    "driverId" TEXT,
    "success" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'APP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_pin_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_safe_rides" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "passengerUserId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "originAddress" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION,
    "originLng" DOUBLE PRECISION,
    "destinationAddress" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION,
    "destinationLng" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "safetyPinHash" TEXT NOT NULL,
    "shareToken" TEXT,
    "shareExpiresAt" TIMESTAMP(3),
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "notes" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_safe_rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_safe_ride_traces" (
    "id" TEXT NOT NULL,
    "safeRideId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'PHONE',
    "isBackground" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_safe_ride_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_safe_ride_incidents" (
    "id" TEXT NOT NULL,
    "safeRideId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "silentMode" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "mobility_safe_ride_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mobility_referral_campaigns_isActive_startsAt_endsAt_idx" ON "mobility_referral_campaigns"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_referral_codes_code_key" ON "mobility_referral_codes"("code");

-- CreateIndex
CREATE INDEX "mobility_referral_codes_campaignId_ownerUserId_idx" ON "mobility_referral_codes"("campaignId", "ownerUserId");

-- CreateIndex
CREATE INDEX "mobility_referral_codes_ownerDriverId_idx" ON "mobility_referral_codes"("ownerDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_referral_attributions_referredUserId_key" ON "mobility_referral_attributions"("referredUserId");

-- CreateIndex
CREATE INDEX "mobility_referral_attributions_campaignId_inviterUserId_sta_idx" ON "mobility_referral_attributions"("campaignId", "inviterUserId", "status");

-- CreateIndex
CREATE INDEX "mobility_referral_attributions_inviterDriverId_status_idx" ON "mobility_referral_attributions"("inviterDriverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_referral_rewards_referenceKey_key" ON "mobility_referral_rewards"("referenceKey");

-- CreateIndex
CREATE INDEX "mobility_referral_rewards_attributionId_idx" ON "mobility_referral_rewards"("attributionId");

-- CreateIndex
CREATE INDEX "mobility_referral_rewards_beneficiaryUserId_issuedAt_idx" ON "mobility_referral_rewards"("beneficiaryUserId", "issuedAt");

-- CreateIndex
CREATE INDEX "mobility_referral_rewards_beneficiaryDriverId_issuedAt_idx" ON "mobility_referral_rewards"("beneficiaryDriverId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_promo_balances_userId_key" ON "mobility_promo_balances"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_promo_movements_referenceKey_key" ON "mobility_promo_movements"("referenceKey");

-- CreateIndex
CREATE INDEX "mobility_promo_movements_userId_createdAt_idx" ON "mobility_promo_movements"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_verification_profiles_identityStatus_trustLevel_idx" ON "mobility_verification_profiles"("identityStatus", "trustLevel");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_verification_profiles_subjectType_subjectId_key" ON "mobility_verification_profiles"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "mobility_verification_events_subjectType_subjectId_createdA_idx" ON "mobility_verification_events"("subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_vehicle_compliance_vehicleId_key" ON "mobility_vehicle_compliance"("vehicleId");

-- CreateIndex
CREATE INDEX "mobility_vehicle_compliance_serviceType_status_idx" ON "mobility_vehicle_compliance"("serviceType", "status");

-- CreateIndex
CREATE INDEX "mobility_vehicle_compliance_permitExpiresAt_idx" ON "mobility_vehicle_compliance"("permitExpiresAt");

-- CreateIndex
CREATE INDEX "mobility_vehicle_compliance_insuranceExpiresAt_idx" ON "mobility_vehicle_compliance"("insuranceExpiresAt");

-- CreateIndex
CREATE INDEX "mobility_pin_attempts_tripId_createdAt_idx" ON "mobility_pin_attempts"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_pin_attempts_passengerUserId_createdAt_idx" ON "mobility_pin_attempts"("passengerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_safe_rides_shareToken_key" ON "mobility_safe_rides"("shareToken");

-- CreateIndex
CREATE INDEX "mobility_safe_rides_driverId_status_createdAt_idx" ON "mobility_safe_rides"("driverId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_safe_rides_passengerUserId_createdAt_idx" ON "mobility_safe_rides"("passengerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_safe_ride_traces_safeRideId_createdAt_idx" ON "mobility_safe_ride_traces"("safeRideId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_safe_ride_incidents_safeRideId_status_createdAt_idx" ON "mobility_safe_ride_incidents"("safeRideId", "status", "createdAt");

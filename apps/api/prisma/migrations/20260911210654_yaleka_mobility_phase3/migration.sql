-- CreateTable
CREATE TABLE "mobility_pricing_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'MX',
    "baseFare" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "perKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "perMinute" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "minimumFare" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "platformPercent" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "driverMinimumPercent" DOUBLE PRECISION NOT NULL DEFAULT 85,
    "maxSurgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "driverRewardPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_pricing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_fare_quotes" (
    "id" TEXT NOT NULL,
    "passengerUserId" TEXT,
    "driverId" TEXT,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "estimatedKm" DOUBLE PRECISION NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "competitorReference" DOUBLE PRECISION,
    "yalekaFare" DOUBLE PRECISION NOT NULL,
    "driverGross" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "savingsVsReference" DOUBLE PRECISION,
    "pricingPolicyId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_fare_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_driver_wallets" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "available" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_driver_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_wallet_movements" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "concept" TEXT NOT NULL,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_wallet_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_driver_benefits" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "valueAmount" DOUBLE PRECISION,
    "valuePct" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_driver_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_bonus_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "minTrips" INTEGER NOT NULL DEFAULT 1,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "rewardAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxRewardsPerDriver" INTEGER NOT NULL DEFAULT 1,
    "city" TEXT,
    "rules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_bonus_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_bonus_grants" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_bonus_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_device_heartbeats" (
    "id" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "tripId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "batteryPct" INTEGER,
    "networkType" TEXT,
    "signalQuality" INTEGER,
    "appState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_device_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_risk_assessments" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "level" TEXT NOT NULL DEFAULT 'LOW',
    "reasons" JSONB,
    "phoneLastSeenAt" TIMESTAMP(3),
    "trackerLastSeenAt" TIMESTAMP(3),
    "routeDeviationKm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_share_sessions" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_share_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_opportunity_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxDetourKm" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "minimumContribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "allowedDays" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_opportunity_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_service_payment_plans" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'MONTHLY',
    "dayOfMonth" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoUseWallet" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_service_payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mobility_pricing_policies_isActive_city_idx" ON "mobility_pricing_policies"("isActive", "city");

-- CreateIndex
CREATE INDEX "mobility_fare_quotes_passengerUserId_createdAt_idx" ON "mobility_fare_quotes"("passengerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_fare_quotes_driverId_createdAt_idx" ON "mobility_fare_quotes"("driverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_driver_wallets_driverId_key" ON "mobility_driver_wallets"("driverId");

-- CreateIndex
CREATE INDEX "mobility_wallet_movements_driverId_createdAt_idx" ON "mobility_wallet_movements"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_wallet_movements_walletId_createdAt_idx" ON "mobility_wallet_movements"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_wallet_movements_referenceId_idx" ON "mobility_wallet_movements"("referenceId");

-- CreateIndex
CREATE INDEX "mobility_driver_benefits_driverId_status_idx" ON "mobility_driver_benefits"("driverId", "status");

-- CreateIndex
CREATE INDEX "mobility_bonus_campaigns_isActive_startsAt_endsAt_idx" ON "mobility_bonus_campaigns"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "mobility_bonus_grants_campaignId_driverId_idx" ON "mobility_bonus_grants"("campaignId", "driverId");

-- CreateIndex
CREATE INDEX "mobility_bonus_grants_driverId_createdAt_idx" ON "mobility_bonus_grants"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_device_heartbeats_deviceType_deviceId_createdAt_idx" ON "mobility_device_heartbeats"("deviceType", "deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_device_heartbeats_driverId_createdAt_idx" ON "mobility_device_heartbeats"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_device_heartbeats_tripId_createdAt_idx" ON "mobility_device_heartbeats"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_risk_assessments_tripId_createdAt_idx" ON "mobility_risk_assessments"("tripId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_share_sessions_token_key" ON "mobility_share_sessions"("token");

-- CreateIndex
CREATE INDEX "mobility_share_sessions_tripId_isActive_idx" ON "mobility_share_sessions"("tripId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_opportunity_preferences_userId_key" ON "mobility_opportunity_preferences"("userId");

-- CreateIndex
CREATE INDEX "mobility_service_payment_plans_driverId_isActive_idx" ON "mobility_service_payment_plans"("driverId", "isActive");

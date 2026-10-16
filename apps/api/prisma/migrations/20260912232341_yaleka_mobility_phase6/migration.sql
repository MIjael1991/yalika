-- CreateTable
CREATE TABLE "mobility_negotiation_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'MX',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "baseFare" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "perKm" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "perMinuteTarget" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "minimumFare" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "minimumAllowedRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "reasonableOfferRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "fastMatchRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.05,
    "maxDriverCounterRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "platformPercent" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "freePickupKm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "pickupPerKm" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_negotiation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_route_estimates" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'FALLBACK',
    "city" TEXT,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "straightLineKm" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "trafficDurationMinutes" INTEGER NOT NULL,
    "trafficLevel" TEXT NOT NULL DEFAULT 'NORMAL',
    "geometry" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_route_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_negotiation_requests" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "passengerUserId" TEXT NOT NULL,
    "routeEstimateId" TEXT,
    "originAddress" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "trafficMinutes" INTEGER NOT NULL,
    "recommendedFare" DOUBLE PRECISION NOT NULL,
    "minimumAllowedFare" DOUBLE PRECISION NOT NULL,
    "reasonableFare" DOUBLE PRECISION NOT NULL,
    "fastMatchFare" DOUBLE PRECISION NOT NULL,
    "passengerOffer" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "selectedProposalId" TEXT,
    "agreedFare" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_negotiation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_fare_proposals" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "requestId" TEXT NOT NULL,
    "proposerType" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "driverId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "etaMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_fare_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_negotiation_audit" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "proposalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_negotiation_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_request_throttle" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_request_throttle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mobility_negotiation_policies_isActive_city_idx" ON "mobility_negotiation_policies"("isActive", "city");

-- CreateIndex
CREATE INDEX "mobility_route_estimates_provider_createdAt_idx" ON "mobility_route_estimates"("provider", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_negotiation_requests_clientRequestId_key" ON "mobility_negotiation_requests"("clientRequestId");

-- CreateIndex
CREATE INDEX "mobility_negotiation_requests_passengerUserId_status_create_idx" ON "mobility_negotiation_requests"("passengerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_negotiation_requests_status_expiresAt_idx" ON "mobility_negotiation_requests"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_fare_proposals_clientRequestId_key" ON "mobility_fare_proposals"("clientRequestId");

-- CreateIndex
CREATE INDEX "mobility_fare_proposals_requestId_status_createdAt_idx" ON "mobility_fare_proposals"("requestId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_fare_proposals_driverId_status_createdAt_idx" ON "mobility_fare_proposals"("driverId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_negotiation_audit_requestId_createdAt_idx" ON "mobility_negotiation_audit"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_negotiation_audit_actorType_actorId_createdAt_idx" ON "mobility_negotiation_audit"("actorType", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_request_throttle_action_actorId_createdAt_idx" ON "mobility_request_throttle"("action", "actorId", "createdAt");

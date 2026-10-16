-- CreateTable
CREATE TABLE "mobility_location_traces" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PHONE',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION,
    "speedKmh" DOUBLE PRECISION,
    "batteryPct" INTEGER,
    "isBackground" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_location_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_cancellation_cases" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "requestedByType" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "chargePassenger" BOOLEAN NOT NULL DEFAULT false,
    "compensateDriver" BOOLEAN NOT NULL DEFAULT false,
    "passengerChargeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "driverCompensationAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "driverDistanceToPickupKm" DOUBLE PRECISION,
    "driverWaitSeconds" INTEGER,
    "routeDeviationKm" DOUBLE PRECISION,
    "evidence" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_cancellation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_safety_incidents" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "driverId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "triggerSource" TEXT NOT NULL DEFAULT 'APP',
    "silentMode" BOOLEAN NOT NULL DEFAULT true,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "mobility_safety_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_trusted_contacts" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "notifyOnTrip" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnEmergency" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_trusted_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_vehicle_trackers" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "deviceLabel" TEXT NOT NULL,
    "provider" TEXT,
    "deviceUid" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "monthlyCost" DOUBLE PRECISION,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_vehicle_trackers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_lost_item_cases" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "passengerUserId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastKnownPlace" TEXT,
    "contactAttempts" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "mobility_lost_item_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_reward_ledger" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "creditAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_reward_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_scheduled_routes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originAddress" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "seatsAvailable" INTEGER NOT NULL DEFAULT 1,
    "suggestedContribution" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_scheduled_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mobility_location_traces_tripId_createdAt_idx" ON "mobility_location_traces"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_location_traces_actorType_actorId_createdAt_idx" ON "mobility_location_traces"("actorType", "actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_cancellation_cases_tripId_key" ON "mobility_cancellation_cases"("tripId");

-- CreateIndex
CREATE INDEX "mobility_cancellation_cases_decision_createdAt_idx" ON "mobility_cancellation_cases"("decision", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_safety_incidents_status_createdAt_idx" ON "mobility_safety_incidents"("status", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_safety_incidents_driverId_createdAt_idx" ON "mobility_safety_incidents"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_trusted_contacts_ownerUserId_isActive_idx" ON "mobility_trusted_contacts"("ownerUserId", "isActive");

-- CreateIndex
CREATE INDEX "mobility_vehicle_trackers_driverId_active_idx" ON "mobility_vehicle_trackers"("driverId", "active");

-- CreateIndex
CREATE INDEX "mobility_vehicle_trackers_vehicleId_active_idx" ON "mobility_vehicle_trackers"("vehicleId", "active");

-- CreateIndex
CREATE INDEX "mobility_lost_item_cases_tripId_status_idx" ON "mobility_lost_item_cases"("tripId", "status");

-- CreateIndex
CREATE INDEX "mobility_lost_item_cases_passengerUserId_createdAt_idx" ON "mobility_lost_item_cases"("passengerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_reward_ledger_driverId_createdAt_idx" ON "mobility_reward_ledger"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_scheduled_routes_status_departureAt_idx" ON "mobility_scheduled_routes"("status", "departureAt");

-- CreateIndex
CREATE INDEX "mobility_scheduled_routes_userId_departureAt_idx" ON "mobility_scheduled_routes"("userId", "departureAt");

-- CreateEnum
CREATE TYPE "MobilityDriverStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MobilityVehicleStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MobilityTripStatus" AS ENUM ('REQUESTED', 'NEGOTIATING', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MobilityOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "mobility_drivers" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "MobilityDriverStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "mobility_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_vehicles" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "status" "MobilityVehicleStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,

    CONSTRAINT "mobility_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_trips" (
    "id" TEXT NOT NULL,
    "originAddress" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "passengerSuggestedFare" DOUBLE PRECISION NOT NULL,
    "agreedFare" DOUBLE PRECISION,
    "finalFare" DOUBLE PRECISION,
    "status" "MobilityTripStatus" NOT NULL DEFAULT 'REQUESTED',
    "safetyPin" TEXT NOT NULL,
    "notes" TEXT,
    "assignedAt" TIMESTAMP(3),
    "driverArrivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passengerUserId" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "acceptedOfferId" TEXT,

    CONSTRAINT "mobility_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_offers" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "etaMinutes" INTEGER NOT NULL,
    "status" "MobilityOfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,

    CONSTRAINT "mobility_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_trip_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tripId" TEXT NOT NULL,

    CONSTRAINT "mobility_trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobility_drivers_userId_key" ON "mobility_drivers"("userId");

-- CreateIndex
CREATE INDEX "mobility_drivers_status_isAvailable_idx" ON "mobility_drivers"("status", "isAvailable");

-- CreateIndex
CREATE INDEX "mobility_drivers_currentLat_currentLng_idx" ON "mobility_drivers"("currentLat", "currentLng");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_vehicles_plate_key" ON "mobility_vehicles"("plate");

-- CreateIndex
CREATE INDEX "mobility_vehicles_driverId_idx" ON "mobility_vehicles"("driverId");

-- CreateIndex
CREATE INDEX "mobility_vehicles_status_isActive_idx" ON "mobility_vehicles"("status", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_trips_acceptedOfferId_key" ON "mobility_trips"("acceptedOfferId");

-- CreateIndex
CREATE INDEX "mobility_trips_passengerUserId_status_idx" ON "mobility_trips"("passengerUserId", "status");

-- CreateIndex
CREATE INDEX "mobility_trips_driverId_status_idx" ON "mobility_trips"("driverId", "status");

-- CreateIndex
CREATE INDEX "mobility_trips_status_createdAt_idx" ON "mobility_trips"("status", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_offers_tripId_status_idx" ON "mobility_offers"("tripId", "status");

-- CreateIndex
CREATE INDEX "mobility_offers_driverId_status_idx" ON "mobility_offers"("driverId", "status");

-- CreateIndex
CREATE INDEX "mobility_trip_events_tripId_createdAt_idx" ON "mobility_trip_events"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_trip_events_type_idx" ON "mobility_trip_events"("type");

-- AddForeignKey
ALTER TABLE "mobility_drivers" ADD CONSTRAINT "mobility_drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobility_vehicles" ADD CONSTRAINT "mobility_vehicles_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "mobility_drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobility_trips" ADD CONSTRAINT "mobility_trips_passengerUserId_fkey" FOREIGN KEY ("passengerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobility_trips" ADD CONSTRAINT "mobility_trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "mobility_drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobility_trips" ADD CONSTRAINT "mobility_trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "mobility_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobility_trips" ADD CONSTRAINT "mobility_trips_acceptedOfferId_fkey" FOREIGN KEY ("acceptedOfferId") REFERENCES "mobility_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobility_offers" ADD CONSTRAINT "mobility_offers_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "mobility_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobility_offers" ADD CONSTRAINT "mobility_offers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "mobility_drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobility_offers" ADD CONSTRAINT "mobility_offers_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "mobility_vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobility_trip_events" ADD CONSTRAINT "mobility_trip_events_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "mobility_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

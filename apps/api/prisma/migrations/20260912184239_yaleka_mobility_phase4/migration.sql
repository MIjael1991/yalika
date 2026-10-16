-- CreateTable
CREATE TABLE "mobility_ratings" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_support_cases" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "userId" TEXT,
    "driverId" TEXT,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedTo" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "mobility_support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_driver_documents" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "documentNumber" TEXT,
    "fileRef" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_trip_receipts" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "fare" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "driverAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "snapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_trip_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_cancellation_settlements" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "cancellationCaseId" TEXT,
    "decision" TEXT NOT NULL,
    "passengerChargeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "driverCompensationAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "reason" TEXT,
    "settledBy" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "mobility_cancellation_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_notification_outbox" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT,
    "driverId" TEXT,
    "tripId" TEXT,
    "channel" TEXT NOT NULL,
    "destination" TEXT,
    "template" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_safety_escalations" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "contactName" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_safety_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_privacy_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "locationRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "heartbeatRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "incidentRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "preciseLocationPurpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobility_privacy_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_audit_events" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "tripId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobility_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobility_payout_batches" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "mobility_payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mobility_ratings_targetType_targetId_createdAt_idx" ON "mobility_ratings"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_ratings_tripId_authorType_authorId_targetType_targ_key" ON "mobility_ratings"("tripId", "authorType", "authorId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "mobility_support_cases_status_priority_createdAt_idx" ON "mobility_support_cases"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_support_cases_tripId_createdAt_idx" ON "mobility_support_cases"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_driver_documents_driverId_type_status_idx" ON "mobility_driver_documents"("driverId", "type", "status");

-- CreateIndex
CREATE INDEX "mobility_driver_documents_expiresAt_idx" ON "mobility_driver_documents"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_trip_receipts_tripId_key" ON "mobility_trip_receipts"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_trip_receipts_receiptNo_key" ON "mobility_trip_receipts"("receiptNo");

-- CreateIndex
CREATE INDEX "mobility_trip_receipts_issuedAt_idx" ON "mobility_trip_receipts"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_cancellation_settlements_tripId_key" ON "mobility_cancellation_settlements"("tripId");

-- CreateIndex
CREATE INDEX "mobility_cancellation_settlements_decision_settledAt_idx" ON "mobility_cancellation_settlements"("decision", "settledAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_notification_outbox_idempotencyKey_key" ON "mobility_notification_outbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "mobility_notification_outbox_status_scheduledAt_idx" ON "mobility_notification_outbox"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "mobility_notification_outbox_tripId_createdAt_idx" ON "mobility_notification_outbox"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_safety_escalations_incidentId_createdAt_idx" ON "mobility_safety_escalations"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_privacy_policies_isActive_idx" ON "mobility_privacy_policies"("isActive");

-- CreateIndex
CREATE INDEX "mobility_audit_events_entityType_entityId_createdAt_idx" ON "mobility_audit_events"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_audit_events_tripId_createdAt_idx" ON "mobility_audit_events"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "mobility_audit_events_actorType_actorId_createdAt_idx" ON "mobility_audit_events"("actorType", "actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobility_payout_batches_reference_key" ON "mobility_payout_batches"("reference");

-- CreateIndex
CREATE INDEX "mobility_payout_batches_driverId_status_createdAt_idx" ON "mobility_payout_batches"("driverId", "status", "createdAt");

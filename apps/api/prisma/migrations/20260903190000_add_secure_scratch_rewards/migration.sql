-- CreateTable
CREATE TABLE "scratch_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validDays" INTEGER NOT NULL DEFAULT 30,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "loyaltyProgramId" TEXT NOT NULL,

    CONSTRAINT "scratch_campaigns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scratch_campaigns_status_check" CHECK ("status" IN ('active', 'paused', 'closed')),
    CONSTRAINT "scratch_campaigns_valid_days_check" CHECK ("validDays" BETWEEN 1 AND 365)
);

-- CreateTable
CREATE TABLE "scratch_prizes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "probabilityBasisPoints" INTEGER NOT NULL,
    "stock" INTEGER,
    "remaining" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "scratch_prizes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scratch_prizes_probability_check" CHECK ("probabilityBasisPoints" BETWEEN 1 AND 10000),
    CONSTRAINT "scratch_prizes_stock_check" CHECK ("stock" IS NULL OR "stock" >= 0),
    CONSTRAINT "scratch_prizes_remaining_check" CHECK ("remaining" IS NULL OR "remaining" >= 0),
    CONSTRAINT "scratch_prizes_status_check" CHECK ("status" IN ('active', 'paused'))
);

-- CreateTable
CREATE TABLE "scratch_attempts" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "claimCode" TEXT,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "visitId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "prizeId" TEXT,
    "redeemedById" TEXT,

    CONSTRAINT "scratch_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scratch_attempts_status_check" CHECK ("status" IN ('won', 'not_won', 'redeemed', 'cancelled', 'review_required'))
);

CREATE INDEX "scratch_campaigns_companyId_status_idx" ON "scratch_campaigns"("companyId", "status");
CREATE INDEX "scratch_campaigns_loyaltyProgramId_idx" ON "scratch_campaigns"("loyaltyProgramId");
CREATE INDEX "scratch_campaigns_startsAt_idx" ON "scratch_campaigns"("startsAt");
CREATE INDEX "scratch_campaigns_endsAt_idx" ON "scratch_campaigns"("endsAt");
CREATE INDEX "scratch_prizes_companyId_idx" ON "scratch_prizes"("companyId");
CREATE INDEX "scratch_prizes_campaignId_status_idx" ON "scratch_prizes"("campaignId", "status");
CREATE UNIQUE INDEX "scratch_attempts_claimCode_key" ON "scratch_attempts"("claimCode");
CREATE UNIQUE INDEX "scratch_attempts_visitId_key" ON "scratch_attempts"("visitId");
CREATE INDEX "scratch_attempts_customerId_idx" ON "scratch_attempts"("customerId");
CREATE INDEX "scratch_attempts_companyId_status_idx" ON "scratch_attempts"("companyId", "status");
CREATE INDEX "scratch_attempts_campaignId_idx" ON "scratch_attempts"("campaignId");
CREATE INDEX "scratch_attempts_prizeId_idx" ON "scratch_attempts"("prizeId");
CREATE INDEX "scratch_attempts_redeemedById_idx" ON "scratch_attempts"("redeemedById");
CREATE INDEX "scratch_attempts_expiresAt_idx" ON "scratch_attempts"("expiresAt");

ALTER TABLE "scratch_campaigns" ADD CONSTRAINT "scratch_campaigns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scratch_campaigns" ADD CONSTRAINT "scratch_campaigns_loyaltyProgramId_fkey" FOREIGN KEY ("loyaltyProgramId") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scratch_prizes" ADD CONSTRAINT "scratch_prizes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scratch_prizes" ADD CONSTRAINT "scratch_prizes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "scratch_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scratch_attempts" ADD CONSTRAINT "scratch_attempts_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scratch_attempts" ADD CONSTRAINT "scratch_attempts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scratch_attempts" ADD CONSTRAINT "scratch_attempts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scratch_attempts" ADD CONSTRAINT "scratch_attempts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "scratch_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scratch_attempts" ADD CONSTRAINT "scratch_attempts_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "scratch_prizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scratch_attempts" ADD CONSTRAINT "scratch_attempts_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

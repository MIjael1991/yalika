-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "loyaltyProgramId" TEXT;

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requiredVisits" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL DEFAULT 'custom',
    "rewardDescription" TEXT NOT NULL,
    "rewardValidDays" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_rewards" (
    "id" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardDescription" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "loyaltyProgramId" TEXT NOT NULL,

    CONSTRAINT "customer_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_programs_companyId_idx" ON "loyalty_programs"("companyId");

-- CreateIndex
CREATE INDEX "loyalty_programs_companyId_status_idx" ON "loyalty_programs"("companyId", "status");

-- CreateIndex
CREATE INDEX "loyalty_programs_startsAt_idx" ON "loyalty_programs"("startsAt");

-- CreateIndex
CREATE INDEX "loyalty_programs_endsAt_idx" ON "loyalty_programs"("endsAt");

-- CreateIndex
CREATE INDEX "customer_rewards_customerId_idx" ON "customer_rewards"("customerId");

-- CreateIndex
CREATE INDEX "customer_rewards_companyId_idx" ON "customer_rewards"("companyId");

-- CreateIndex
CREATE INDEX "customer_rewards_loyaltyProgramId_idx" ON "customer_rewards"("loyaltyProgramId");

-- CreateIndex
CREATE INDEX "customer_rewards_status_idx" ON "customer_rewards"("status");

-- CreateIndex
CREATE INDEX "customer_rewards_expiresAt_idx" ON "customer_rewards"("expiresAt");

-- CreateIndex
CREATE INDEX "visits_loyaltyProgramId_idx" ON "visits"("loyaltyProgramId");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_loyaltyProgramId_fkey" FOREIGN KEY ("loyaltyProgramId") REFERENCES "loyalty_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_loyaltyProgramId_fkey" FOREIGN KEY ("loyaltyProgramId") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

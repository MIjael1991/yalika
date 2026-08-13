/*
  Warnings:

  - A unique constraint covering the columns `[customerId,loyaltyProgramId]` on the table `customer_rewards` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "customer_rewards_customerId_loyaltyProgramId_key" ON "customer_rewards"("customerId", "loyaltyProgramId");

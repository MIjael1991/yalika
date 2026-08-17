ALTER TABLE "payments"
ADD COLUMN "orderSplitId" TEXT;

CREATE INDEX "payments_orderSplitId_idx"
ON "payments"("orderSplitId");

ALTER TABLE "payments"
ADD CONSTRAINT "payments_orderSplitId_fkey"
FOREIGN KEY ("orderSplitId")
REFERENCES "order_splits"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

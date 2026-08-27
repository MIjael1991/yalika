ALTER TABLE "tasks"
ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "tasks_dedupeKey_key"
ON "tasks"("dedupeKey");

-- ORION Life recurring tasks use a durable series plus individual occurrences.
-- The unique occurrence index is the final protection against duplicate tasks
-- when several devices refresh the same shared space at the same time.

CREATE TABLE "task_recurrences" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "estimatedMinutes" INTEGER,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" TEXT NOT NULL DEFAULT 'active',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "nextOccurrenceAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "userId" TEXT,

    CONSTRAINT "task_recurrences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_recurrences_frequency_check"
      CHECK ("frequency" IN ('daily', 'weekly', 'monthly', 'yearly')),
    CONSTRAINT "task_recurrences_interval_check"
      CHECK ("interval" >= 1 AND "interval" <= 365),
    CONSTRAINT "task_recurrences_status_check"
      CHECK ("status" IN ('active', 'cancelled', 'finished')),
    CONSTRAINT "task_recurrences_estimatedMinutes_check"
      CHECK ("estimatedMinutes" IS NULL OR ("estimatedMinutes" >= 5 AND "estimatedMinutes" <= 1440)),
    CONSTRAINT "task_recurrences_endsAt_check"
      CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);

ALTER TABLE "tasks"
ADD COLUMN "recurrenceId" TEXT,
ADD COLUMN "recurrenceOccurrenceAt" TIMESTAMP(3);

CREATE INDEX "task_recurrences_spaceId_status_nextOccurrenceAt_idx"
ON "task_recurrences"("spaceId", "status", "nextOccurrenceAt");

CREATE INDEX "task_recurrences_companyId_status_nextOccurrenceAt_idx"
ON "task_recurrences"("companyId", "status", "nextOccurrenceAt");

CREATE INDEX "task_recurrences_userId_status_idx"
ON "task_recurrences"("userId", "status");

CREATE UNIQUE INDEX "tasks_recurrenceId_recurrenceOccurrenceAt_key"
ON "tasks"("recurrenceId", "recurrenceOccurrenceAt");

CREATE INDEX "tasks_recurrenceId_status_idx"
ON "tasks"("recurrenceId", "status");

ALTER TABLE "task_recurrences"
ADD CONSTRAINT "task_recurrences_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_recurrences"
ADD CONSTRAINT "task_recurrences_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "spaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_recurrences"
ADD CONSTRAINT "task_recurrences_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_recurrences"
ADD CONSTRAINT "task_recurrences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_recurrenceId_fkey"
FOREIGN KEY ("recurrenceId") REFERENCES "task_recurrences"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

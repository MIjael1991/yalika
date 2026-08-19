-- A reminder belongs to one task occurrence and one authenticated recipient.
-- Recurring task templates retain the lead time so every new occurrence can
-- create its own reminder without sharing mutable delivery state.

ALTER TABLE "task_recurrences"
ADD COLUMN "reminderMinutesBefore" INTEGER;

ALTER TABLE "task_recurrences"
ADD CONSTRAINT "task_recurrences_reminderMinutesBefore_check"
CHECK (
  "reminderMinutesBefore" IS NULL OR
  ("reminderMinutesBefore" >= 0 AND "reminderMinutesBefore" <= 10080)
);

CREATE TABLE "task_reminders" (
    "id" TEXT NOT NULL,
    "leadMinutes" INTEGER NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "originalRemindAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "snoozeCount" INTEGER NOT NULL DEFAULT 0,
    "acknowledgedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_reminders_leadMinutes_check"
      CHECK ("leadMinutes" >= 0 AND "leadMinutes" <= 10080),
    CONSTRAINT "task_reminders_status_check"
      CHECK ("status" IN ('scheduled', 'acknowledged', 'cancelled')),
    CONSTRAINT "task_reminders_snoozeCount_check"
      CHECK ("snoozeCount" >= 0)
);

CREATE UNIQUE INDEX "task_reminders_taskId_key"
ON "task_reminders"("taskId");

CREATE INDEX "task_reminders_userId_status_remindAt_idx"
ON "task_reminders"("userId", "status", "remindAt");

CREATE INDEX "task_reminders_taskId_status_idx"
ON "task_reminders"("taskId", "status");

ALTER TABLE "task_reminders"
ADD CONSTRAINT "task_reminders_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_reminders"
ADD CONSTRAINT "task_reminders_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

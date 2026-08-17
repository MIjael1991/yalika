-- ORION Life begins with shared spaces around the existing universal task engine.
-- Existing business tasks remain valid because every new task column is optional
-- or has a safe default.

CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'personal',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "spaces_type_check" CHECK ("type" IN ('personal', 'family', 'business', 'school')),
    CONSTRAINT "spaces_status_check" CHECK ("status" IN ('active', 'archived'))
);

CREATE TABLE "space_members" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "space_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "space_members_role_check" CHECK ("role" IN ('owner', 'admin', 'member', 'viewer')),
    CONSTRAINT "space_members_status_check" CHECK ("status" IN ('active', 'inactive'))
);

ALTER TABLE "tasks"
ADD COLUMN "estimatedMinutes" INTEGER,
ADD COLUMN "postponedUntil" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "spaceId" TEXT,
ADD COLUMN "createdById" TEXT,
ADD COLUMN "claimedById" TEXT,
ADD COLUMN "completedById" TEXT;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_estimatedMinutes_check"
CHECK ("estimatedMinutes" IS NULL OR ("estimatedMinutes" >= 5 AND "estimatedMinutes" <= 1440));

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_version_check"
CHECK ("version" >= 0);

CREATE TABLE "task_activities" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "actorUserId" TEXT,

    CONSTRAINT "task_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spaces_companyId_type_status_idx"
ON "spaces"("companyId", "type", "status");

CREATE INDEX "spaces_ownerUserId_status_idx"
ON "spaces"("ownerUserId", "status");

CREATE UNIQUE INDEX "space_members_spaceId_userId_key"
ON "space_members"("spaceId", "userId");

CREATE INDEX "space_members_userId_status_idx"
ON "space_members"("userId", "status");

CREATE INDEX "space_members_spaceId_role_status_idx"
ON "space_members"("spaceId", "role", "status");

CREATE INDEX "tasks_companyId_status_dueAt_idx"
ON "tasks"("companyId", "status", "dueAt");

CREATE INDEX "tasks_spaceId_status_dueAt_idx"
ON "tasks"("spaceId", "status", "dueAt");

CREATE INDEX "tasks_userId_status_idx"
ON "tasks"("userId", "status");

CREATE INDEX "task_activities_taskId_createdAt_idx"
ON "task_activities"("taskId", "createdAt");

CREATE INDEX "task_activities_actorUserId_createdAt_idx"
ON "task_activities"("actorUserId", "createdAt");

ALTER TABLE "spaces"
ADD CONSTRAINT "spaces_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spaces"
ADD CONSTRAINT "spaces_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "space_members"
ADD CONSTRAINT "space_members_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "spaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "space_members"
ADD CONSTRAINT "space_members_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "spaces"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_claimedById_fkey"
FOREIGN KEY ("claimedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_completedById_fkey"
FOREIGN KEY ("completedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_activities"
ADD CONSTRAINT "task_activities_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_activities"
ADD CONSTRAINT "task_activities_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- YALEKA R10B MULTIPAGINAS + EQUIPO
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  ALTER TABLE "sites" DROP CONSTRAINT "sites_companyId_key";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DROP INDEX IF EXISTS "sites_companyId_key";
CREATE INDEX IF NOT EXISTS "sites_companyId_idx" ON "sites"("companyId");

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY (status = 'published') DESC, "updatedAt" DESC, "createdAt" ASC) AS rn
  FROM "sites"
)
UPDATE "sites" s SET "isPrimary" = (ranked.rn = 1) FROM ranked WHERE ranked.id = s.id;

CREATE UNIQUE INDEX IF NOT EXISTS "sites_companyId_primary_unique" ON "sites"("companyId") WHERE "isPrimary" = true;

CREATE TABLE IF NOT EXISTS "site_members" (
  "id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'viewer',
  "status" TEXT NOT NULL DEFAULT 'active',
  "siteId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "invitedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_members_siteId_userId_key" ON "site_members"("siteId","userId");
CREATE INDEX IF NOT EXISTS "site_members_companyId_status_idx" ON "site_members"("companyId","status");
CREATE INDEX IF NOT EXISTS "site_members_userId_status_idx" ON "site_members"("userId","status");
CREATE INDEX IF NOT EXISTS "site_members_siteId_status_idx" ON "site_members"("siteId","status");

DO $$ BEGIN
  ALTER TABLE "site_members" ADD CONSTRAINT "site_members_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "site_members" ADD CONSTRAINT "site_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "site_members" ADD CONSTRAINT "site_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "site_members" ADD CONSTRAINT "site_members_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

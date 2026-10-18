-- YALIKA: membresias (persona + negocio) con permisos extra para cajeros.
CREATE TABLE IF NOT EXISTS "memberships" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invitedByUserId" TEXT,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_userId_companyId_key" ON "memberships"("userId", "companyId");
CREATE INDEX IF NOT EXISTS "memberships_companyId_status_idx" ON "memberships"("companyId", "status");

DO $$
BEGIN
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Cada cuenta actual se convierte en su primera membresia, sin perder nada.
INSERT INTO "memberships" ("id", "status", "userId", "companyId")
SELECT gen_random_uuid()::text, 'active', u."id", u."companyId"
FROM "users" u
WHERE u."companyId" IS NOT NULL
ON CONFLICT ("userId", "companyId") DO NOTHING;

-- Additive: compatible with databases where the initial migration already added accessMode.
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "accessMode" TEXT;
UPDATE "surveys" SET "accessMode" = 'public' WHERE "accessMode" IS NULL;
ALTER TABLE "surveys" ALTER COLUMN "accessMode" SET DEFAULT 'public';
ALTER TABLE "surveys" ALTER COLUMN "accessMode" SET NOT NULL;
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "personalFields" JSONB;
CREATE TABLE "survey_invitations" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "surveyId" TEXT NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "tokenHash" TEXT NOT NULL UNIQUE,
 "tokenCipher" TEXT NOT NULL,
 "contactHash" TEXT NOT NULL,
 "detailsCipher" TEXT NOT NULL,
 "usedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("surveyId", "contactHash")
);
CREATE INDEX "survey_invitations_surveyId_usedAt_idx" ON "survey_invitations"("surveyId", "usedAt");

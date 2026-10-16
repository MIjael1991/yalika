ALTER TABLE "surveys"
  ADD COLUMN "collectIne" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ineRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ineRetentionDays" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE "survey_ine_submissions" (
  "id" TEXT NOT NULL,
  "frontObjectKey" TEXT,
  "frontMimeType" TEXT,
  "frontBytes" INTEGER NOT NULL DEFAULT 0,
  "backObjectKey" TEXT,
  "backMimeType" TEXT,
  "backBytes" INTEGER NOT NULL DEFAULT 0,
  "downloadedAt" TIMESTAMP(3),
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "surveyId" TEXT NOT NULL,
  "responseId" TEXT NOT NULL,
  CONSTRAINT "survey_ine_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "survey_ine_submissions_responseId_key"
  ON "survey_ine_submissions"("responseId");
CREATE INDEX "survey_ine_submissions_surveyId_deletedAt_createdAt_idx"
  ON "survey_ine_submissions"("surveyId", "deletedAt", "createdAt");
CREATE INDEX "survey_ine_submissions_expiresAt_deletedAt_idx"
  ON "survey_ine_submissions"("expiresAt", "deletedAt");

ALTER TABLE "survey_ine_submissions"
  ADD CONSTRAINT "survey_ine_submissions_surveyId_fkey"
  FOREIGN KEY ("surveyId") REFERENCES "surveys"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_ine_submissions"
  ADD CONSTRAINT "survey_ine_submissions_responseId_fkey"
  FOREIGN KEY ("responseId") REFERENCES "survey_responses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

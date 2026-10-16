ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "ineStorageMode" TEXT NOT NULL DEFAULT 'temporary';

ALTER TABLE "survey_ine_submissions"
  ADD COLUMN IF NOT EXISTS "backupConfirmedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "survey_ine_submissions_backupConfirmedAt_idx"
  ON "survey_ine_submissions"("backupConfirmedAt");

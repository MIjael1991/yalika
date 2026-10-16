ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "collectElectoralSection" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "nextFolio" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "survey_respondents"
  ADD COLUMN IF NOT EXISTS "electoralSectionCipher" TEXT;

ALTER TABLE "survey_responses"
  ADD COLUMN IF NOT EXISTS "folio" INTEGER;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "surveyId" ORDER BY "completedAt" ASC, "createdAt" ASC, "id" ASC)::INTEGER AS generated_folio
  FROM "survey_responses" WHERE "folio" IS NULL
)
UPDATE "survey_responses" response SET "folio" = ranked.generated_folio FROM ranked WHERE response."id" = ranked."id";

ALTER TABLE "survey_responses" ALTER COLUMN "folio" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "survey_responses_surveyId_folio_key" ON "survey_responses"("surveyId", "folio");
UPDATE "surveys" survey SET "nextFolio" = COALESCE((SELECT MAX(response."folio") FROM "survey_responses" response WHERE response."surveyId" = survey."id"), 0);

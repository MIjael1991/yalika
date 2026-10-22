-- Additive: codigo corto de acceso por invitacion (las filas anteriores quedan sin codigo).
ALTER TABLE "survey_invitations" ADD COLUMN IF NOT EXISTS "codeHash" TEXT;
ALTER TABLE "survey_invitations" ADD COLUMN IF NOT EXISTS "codeCipher" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "survey_invitations_surveyId_codeHash_key" ON "survey_invitations"("surveyId", "codeHash");

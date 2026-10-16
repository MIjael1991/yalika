-- Las encuestas de Yaleka no deben enviarse incompletas.
UPDATE "survey_questions"
SET "required" = true
WHERE "required" = false;

ALTER TABLE "survey_questions"
ALTER COLUMN "required" SET DEFAULT true;

-- Por privacidad, los resultados públicos permanecen ocultos salvo decisión expresa.
UPDATE "surveys"
SET "showPublicResults" = false
WHERE "showPublicResults" = true;

ALTER TABLE "surveys"
ALTER COLUMN "showPublicResults" SET DEFAULT false;

-- Additive: fecha opcional de cierre automatico de la encuesta.
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "closesAt" TIMESTAMP(3);

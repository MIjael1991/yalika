-- Presente: solo servicios exprés del mismo día. Se quitan la mano de obra separada (obras)
-- y la duración en días que se agregaron en 20261019110000 y ya no se usan.

ALTER TABLE "presente_quotes"
  DROP COLUMN IF EXISTS "durationDays",
  DROP COLUMN IF EXISTS "laborMxn";

ALTER TABLE "presente_requests"
  DROP COLUMN IF EXISTS "finalLaborMxn";

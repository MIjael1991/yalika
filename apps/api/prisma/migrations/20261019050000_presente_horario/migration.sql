-- Presente: días y horario estructurados en lugar de una nota libre.
-- "scheduleNote" solo se usó en pruebas locales (el módulo no ha salido a producción).
ALTER TABLE "presente_providers" DROP COLUMN "scheduleNote";
ALTER TABLE "presente_providers" ADD COLUMN "availability" JSONB;

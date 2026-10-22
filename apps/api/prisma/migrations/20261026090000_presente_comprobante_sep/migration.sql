-- Tequio: comprobante de la SEP de la cédula profesional (visible para los clientes al revisarse).

ALTER TABLE "presente_credentials" ADD COLUMN "sepProofKey" TEXT;
ALTER TABLE "presente_credentials" ADD COLUMN "sepProofMime" TEXT;
ALTER TABLE "presente_credentials" ADD COLUMN "sepProofAt" TIMESTAMP(3);
ALTER TABLE "presente_credentials" ADD COLUMN "sepProofCheckedAt" TIMESTAMP(3);

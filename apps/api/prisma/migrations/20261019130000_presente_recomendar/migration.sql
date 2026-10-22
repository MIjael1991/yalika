-- Presente: quién recomendó a cada trabajador (para el servicio gratis por recomendar).

ALTER TABLE "presente_providers" ADD COLUMN "referredByProviderId" TEXT;
CREATE INDEX "presente_providers_referredByProviderId_idx" ON "presente_providers"("referredByProviderId");

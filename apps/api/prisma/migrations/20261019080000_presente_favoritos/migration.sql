-- Presente: trabajadores de confianza, pedidos directos y agendados, seguimientos
-- y tipos de mensaje (avisos y propuestas de siguiente visita). Solo agrega.

ALTER TABLE "presente_requests"
  ADD COLUMN "targetProviderId" TEXT,
  ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD COLUMN "followUpOfId" TEXT;
CREATE INDEX "presente_requests_targetProviderId_status_idx" ON "presente_requests"("targetProviderId", "status");

ALTER TABLE "presente_messages"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "meta" JSONB;

CREATE TABLE "presente_favorites" (
  "id" TEXT NOT NULL,
  "clientUserId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presente_favorites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presente_favorites_clientUserId_providerId_key" ON "presente_favorites"("clientUserId", "providerId");
ALTER TABLE "presente_favorites" ADD CONSTRAINT "presente_favorites_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "presente_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

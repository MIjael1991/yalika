-- Tequio (antes Presente): cédulas profesionales revisadas por el operador y revalidación de identidad.

ALTER TABLE "presente_providers" ADD COLUMN "identityCheckedAt" TIMESTAMP(3);

CREATE TABLE "presente_credentials" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "titleKey" TEXT,
    "titleMime" TEXT,
    "selfieKey" TEXT,
    "selfieMime" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "presente_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presente_credentials_providerId_trade_key" ON "presente_credentials"("providerId", "trade");
CREATE INDEX "presente_credentials_status_submittedAt_idx" ON "presente_credentials"("status", "submittedAt");
ALTER TABLE "presente_credentials" ADD CONSTRAINT "presente_credentials_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "presente_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recuperación de la cuenta: teléfono guardado (se verifica cuando haya envío de SMS).
CREATE TABLE "account_contacts" (
    "userId" TEXT NOT NULL,
    "recoveryPhone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "account_contacts_pkey" PRIMARY KEY ("userId")
);

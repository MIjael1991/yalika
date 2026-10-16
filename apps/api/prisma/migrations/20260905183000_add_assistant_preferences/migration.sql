CREATE TABLE "assistant_preferences" (
    "id" TEXT NOT NULL,
    "preferredName" TEXT,
    "automaticLocale" BOOLEAN NOT NULL DEFAULT true,
    "voiceLocale" TEXT NOT NULL DEFAULT 'es-MX',
    "voiceName" TEXT,
    "voiceRate" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "assistant_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assistant_preferences_userId_key"
ON "assistant_preferences"("userId");

ALTER TABLE "assistant_preferences"
ADD CONSTRAINT "assistant_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3);

CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_sessions_tokenHash_key"
ON "auth_sessions"("tokenHash");

CREATE INDEX "auth_sessions_userId_revokedAt_expiresAt_idx"
ON "auth_sessions"("userId", "revokedAt", "expiresAt");

CREATE INDEX "auth_sessions_expiresAt_revokedAt_idx"
ON "auth_sessions"("expiresAt", "revokedAt");

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users"
ADD CONSTRAINT "users_failedLoginAttempts_check"
CHECK ("failedLoginAttempts" >= 0);

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_expiration_check"
CHECK ("expiresAt" > "createdAt");

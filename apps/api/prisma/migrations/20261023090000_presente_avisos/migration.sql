-- Tequio: avisos al celular (Web Push) aunque Yalika esté cerrada.

CREATE TABLE "presente_push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "authKey" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "presente_push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presente_push_subscriptions_endpoint_key" ON "presente_push_subscriptions"("endpoint");
CREATE INDEX "presente_push_subscriptions_userId_idx" ON "presente_push_subscriptions"("userId");

CREATE TABLE "presente_push_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "presente_push_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "presente_push_messages_userId_deliveredAt_idx" ON "presente_push_messages"("userId", "deliveredAt");
CREATE INDEX "presente_push_messages_createdAt_idx" ON "presente_push_messages"("createdAt");

CREATE TABLE "presente_push_config" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "presente_push_config_pkey" PRIMARY KEY ("id")
);

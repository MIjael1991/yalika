-- Tequio: citas (el trabajador propone otra hora), grabación de llamadas con aviso y sábana de seguridad.

ALTER TABLE "presente_quotes" ADD COLUMN "proposedFor" TIMESTAMP(3);

ALTER TABLE "presente_calls" ADD COLUMN "recordingByUserId" TEXT;

CREATE TABLE "presente_call_recordings" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "presente_call_recordings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "presente_call_recordings_requestId_createdAt_idx" ON "presente_call_recordings"("requestId", "createdAt");
CREATE INDEX "presente_call_recordings_createdAt_idx" ON "presente_call_recordings"("createdAt");

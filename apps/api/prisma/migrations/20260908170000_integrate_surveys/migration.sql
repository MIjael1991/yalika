-- Encuestas integradas a la plataforma principal.
-- La identidad permanece separada de las respuestas para proteger a participantes.

CREATE TABLE "surveys" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "identityMode" TEXT NOT NULL DEFAULT 'phone',
    "accessMode" TEXT NOT NULL DEFAULT 'public',
    "collectMunicipality" BOOLEAN NOT NULL DEFAULT false,
    "collectLocality" BOOLEAN NOT NULL DEFAULT false,
    "collectLeaderProposal" BOOLEAN NOT NULL DEFAULT false,
    "showPublicResults" BOOLEAN NOT NULL DEFAULT true,
    "privacyNotice" TEXT NOT NULL,
    "thankYouMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_questions" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'choice',
    "options" JSONB NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "publicAggregate" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "surveyId" TEXT NOT NULL,
    CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_respondents" (
    "id" TEXT NOT NULL,
    "nameCipher" TEXT,
    "emailCipher" TEXT,
    "emailHash" TEXT,
    "phoneCipher" TEXT,
    "phoneHash" TEXT,
    "municipalityCipher" TEXT,
    "localityCipher" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    CONSTRAINT "survey_respondents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_responses" (
    "id" TEXT NOT NULL,
    "privacyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "privacyNoticeHash" TEXT NOT NULL,
    "consentContact" BOOLEAN NOT NULL DEFAULT false,
    "contactChannels" JSONB NOT NULL DEFAULT '[]',
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "surveyId" TEXT NOT NULL,
    "respondentId" TEXT,
    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_answers" (
    "id" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_answer_aggregates" (
    "optionKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "surveyId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    CONSTRAINT "survey_answer_aggregates_pkey" PRIMARY KEY ("surveyId", "questionId", "optionKey")
);

CREATE UNIQUE INDEX "surveys_slug_key" ON "surveys"("slug");
CREATE INDEX "surveys_companyId_status_createdAt_idx" ON "surveys"("companyId", "status", "createdAt");
CREATE INDEX "survey_questions_surveyId_sortOrder_idx" ON "survey_questions"("surveyId", "sortOrder");
CREATE INDEX "survey_respondents_companyId_emailHash_idx" ON "survey_respondents"("companyId", "emailHash");
CREATE INDEX "survey_respondents_companyId_phoneHash_idx" ON "survey_respondents"("companyId", "phoneHash");
CREATE UNIQUE INDEX "survey_responses_surveyId_respondentId_key" ON "survey_responses"("surveyId", "respondentId");
CREATE INDEX "survey_responses_surveyId_completedAt_idx" ON "survey_responses"("surveyId", "completedAt");
CREATE INDEX "survey_responses_respondentId_idx" ON "survey_responses"("respondentId");
CREATE UNIQUE INDEX "survey_answers_responseId_questionId_key" ON "survey_answers"("responseId", "questionId");
CREATE INDEX "survey_answers_questionId_idx" ON "survey_answers"("questionId");
CREATE INDEX "survey_answer_aggregates_surveyId_idx" ON "survey_answer_aggregates"("surveyId");

ALTER TABLE "surveys" ADD CONSTRAINT "surveys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_respondents" ADD CONSTRAINT "survey_respondents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "survey_respondents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "survey_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_answer_aggregates" ADD CONSTRAINT "survey_answer_aggregates_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

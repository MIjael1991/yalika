-- CreateTable
CREATE TABLE "knowledge_alternative_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "defaultPriority" TEXT NOT NULL DEFAULT 'normal',
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "knowledgeTemplateId" TEXT NOT NULL,

    CONSTRAINT "knowledge_alternative_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_alternative_templates_knowledgeTemplateId_title_key" ON "knowledge_alternative_templates"("knowledgeTemplateId", "title");

-- AddForeignKey
ALTER TABLE "knowledge_alternative_templates" ADD CONSTRAINT "knowledge_alternative_templates_knowledgeTemplateId_fkey" FOREIGN KEY ("knowledgeTemplateId") REFERENCES "knowledge_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

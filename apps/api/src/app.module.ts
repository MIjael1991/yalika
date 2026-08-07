import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { IncidentModule } from './core/incident/incident.module';
import { AlternativeModule } from './core/incident/alternative/alternative.module';
import { KnowledgeAlternativeModule } from './core/knowledge/alternative/knowledge-alternative.module';
import { KnowledgeModule } from './core/knowledge/knowledge.module';
import { OperationsModule } from './core/operations/operations.module';
import { TaskModule } from './core/task/task.module';

import { HealthModule } from './health/health.module';
import { CompanyModule } from './identity/company/company.module';
import { RoleModule } from './identity/role/role.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,
    HealthModule,

    CompanyModule,
    RoleModule,

    TaskModule,
    OperationsModule,

    IncidentModule,
    AlternativeModule,

    KnowledgeModule,
    KnowledgeAlternativeModule,
  ],
})
export class AppModule {}
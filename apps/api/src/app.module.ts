import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

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
  ],
})
export class AppModule {}
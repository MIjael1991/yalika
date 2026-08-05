import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module';
import { CompanyModule } from './identity/company/company.module';

@Module({
  imports: [
    HealthModule,
    CompanyModule,
  ],
})
export class AppModule {}
import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { IncidentController } from './incident.controller';
import { IncidentService } from './incident.service';

@Module({
  imports: [AuthModule],
  controllers: [IncidentController],
  providers: [IncidentService],
})
export class IncidentModule {}

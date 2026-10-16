import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MobilityAccessService } from './mobility-access.service';
import { MobilityController } from './mobility.controller';
import { MobilityPinService } from './mobility-pin.service';
import { MobilityService } from './mobility.service';
import { MobilityPhase2Controller } from './phase2/phase2.controller';
import { MobilityPhase2Service } from './phase2/phase2.service';
import { MobilityPhase3Controller } from './phase3/phase3.controller';
import { MobilityPhase3Service } from './phase3/phase3.service';
import { MobilityPhase4Controller } from './phase4/phase4.controller';
import { MobilityPhase4Service } from './phase4/phase4.service';
import { MobilityPhase5Controller } from './phase5/phase5.controller';
import { MobilityPhase5Service } from './phase5/phase5.service';
import { MobilityPhase6Controller } from './phase6/phase6.controller';
import { MobilityPhase6Service } from './phase6/phase6.service';
import { MobilityPhase7Controller } from './phase7/phase7.controller';
import { MobilityPhase7Service } from './phase7/phase7.service';
import { MobilityPhase9Controller } from './phase9/phase9.controller';
import { MobilityPhase9Service } from './phase9/phase9.service';

@Module({
  imports: [AuthModule],
  controllers: [
    MobilityController,
    MobilityPhase2Controller,
    MobilityPhase3Controller,
    MobilityPhase4Controller,
    MobilityPhase5Controller,
    MobilityPhase6Controller,
    MobilityPhase7Controller,
    MobilityPhase9Controller,
  ],
  providers: [
    MobilityAccessService,
    MobilityPinService,
    MobilityService,
    MobilityPhase2Service,
    MobilityPhase3Service,
    MobilityPhase4Service,
    MobilityPhase5Service,
    MobilityPhase6Service,
    MobilityPhase7Service,
    MobilityPhase9Service,
  ],
  exports: [
    MobilityService,
    MobilityPhase2Service,
    MobilityPhase3Service,
    MobilityPhase4Service,
    MobilityPhase5Service,
    MobilityPhase6Service,
    MobilityPhase7Service,
    MobilityPhase9Service,
  ],
})
export class MobilityModule {}

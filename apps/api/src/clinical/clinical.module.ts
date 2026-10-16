import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TaskModule } from '../core/task/task.module';
import { ClinicalController } from './clinical.controller';
import { ClinicalFeatureGuard } from './clinical-feature.guard';
import { ClinicalService } from './clinical.service';
import { ClinicalStorageService } from './clinical-storage.service';
import { ClinicalR28Controller } from './r28/clinical-r28.controller';
import { ClinicalR28Service } from './r28/clinical-r28.service';
import { ClinicalLifeMaterializerService } from './r28/clinical-r28-life-materializer.service';
import { ClinicalR29Controller } from './r29/clinical-r29.controller';
import { ClinicalR29Service } from './r29/clinical-r29.service';
import { ClinicalR30Controller } from './r30/clinical-r30.controller';
import { ClinicalR30TrustService } from './r30/clinical-r30-trust.service';
import { ClinicalR302Controller } from './r302/clinical-r302.controller';
import { ClinicalR302NetworkService } from './r302/clinical-r302-network.service';

import { ClinicalR303Controller } from './r303/clinical-r303.controller';
import { ClinicalR303Service } from './r303/clinical-r303.service';
import { ClinicalR304Controller } from './r304/clinical-r304.controller';
import { ClinicalR304Service } from './r304/clinical-r304.service';
@Module({
  imports: [AuthModule, PrismaModule, TaskModule],
  controllers: [ClinicalController, ClinicalR28Controller,
    ClinicalR29Controller,
    ClinicalR30Controller,
    ClinicalR302Controller,
    ClinicalR303Controller,
    ClinicalR304Controller,],
  providers: [
    ClinicalService,
    ClinicalStorageService,
    ClinicalFeatureGuard,
  
    ClinicalR28Service,
    ClinicalLifeMaterializerService,
    ClinicalR29Service,
    ClinicalR30TrustService,
    ClinicalR302NetworkService,
    ClinicalR303Service,
    ClinicalR304Service,],
  exports: [ClinicalService],
})
export class ClinicalModule {}

import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { SurveyController } from './survey.controller';
import { SurveyService } from './survey.service';
import { SurveyIneStorageService } from './survey-ine-storage';
import { SurveyIneExtractionService } from './survey-ine-extraction';

@Module({
  imports: [AuthModule],
  controllers: [SurveyController],
  providers: [
    SurveyService,
    SurveyIneStorageService,
    SurveyIneExtractionService,
  ],
  exports: [SurveyService],
})
export class SurveyModule {}

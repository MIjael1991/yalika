import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { MobilityPhase7Service } from './phase7.service';
import {
  ConfirmVoiceCommandDto,
  QuickRideRequestDto,
  UpdateExperiencePreferenceDto,
  VoiceInterpretDto,
} from './phase7.dto';

@Controller('mobility')
@UseGuards(SessionAuthGuard)
export class MobilityPhase7Controller {
  constructor(private readonly phase7: MobilityPhase7Service) {}

  @Get('experience/capabilities')
  capabilities() {
    return this.phase7.capabilities();
  }

  @Get('experience/preferences')
  preference(
    @Query('subjectType') subjectType: string,
    @Query('subjectId') subjectId: string,
  ) {
    return this.phase7.preference(subjectType, subjectId);
  }

  @Patch('experience/preferences')
  updatePreference(@Body() dto: UpdateExperiencePreferenceDto) {
    return this.phase7.updatePreference(dto);
  }

  @Post('experience/quick-request')
  quickRide(@Body() dto: QuickRideRequestDto) {
    return this.phase7.quickRide(dto);
  }

  @Post('voice/interpret')
  interpret(@Body() dto: VoiceInterpretDto) {
    return this.phase7.interpret(dto);
  }

  @Post('voice/commands/:id/confirm')
  confirm(@Param('id') id: string, @Body() dto: ConfirmVoiceCommandDto) {
    return this.phase7.confirm(id, dto);
  }

  @Get('diagnostics/phase7')
  diagnostics() {
    return this.phase7.diagnostics();
  }
}

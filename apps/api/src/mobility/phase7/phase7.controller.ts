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
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { MobilityPhase7Service } from './phase7.service';
import {
  ConfirmVoiceCommandDto,
  QuickRideRequestDto,
  UpdateExperiencePreferenceDto,
  VoiceInterpretDto,
} from './phase7.dto';

/** Pasajero/conductor siempre salen de la sesion, nunca de IDs enviados por el cliente. */
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
    @CurrentAuth() auth: AuthContext,
    @Query('subjectType') subjectType: string,
    @Query('subjectId') subjectId: string,
  ) {
    return this.phase7.preferenceFor(auth.user.id, subjectType, subjectId);
  }

  @Patch('experience/preferences')
  updatePreference(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdateExperiencePreferenceDto,
  ) {
    return this.phase7.updatePreference(auth.user.id, dto);
  }

  @Post('experience/quick-request')
  quickRide(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: QuickRideRequestDto,
  ) {
    return this.phase7.quickRide(auth.user.id, dto);
  }

  @Post('voice/interpret')
  interpret(@CurrentAuth() auth: AuthContext, @Body() dto: VoiceInterpretDto) {
    return this.phase7.interpret(auth.user.id, dto);
  }

  @Post('voice/commands/:id/confirm')
  confirm(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ConfirmVoiceCommandDto,
  ) {
    return this.phase7.confirm(auth.user.id, id, dto);
  }

  @Get('diagnostics/phase7')
  @UseGuards(PlatformOperatorGuard)
  diagnostics() {
    return this.phase7.diagnostics();
  }
}

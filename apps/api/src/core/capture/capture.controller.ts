import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { type AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { CaptureService } from './capture.service';
import { InterpretCaptureDto } from './dto/interpret-capture.dto';

@Controller('capture')
@UseGuards(SessionAuthGuard)
export class CaptureController {
  constructor(private readonly captureService: CaptureService) {}

  @Post('interpret')
  interpret(
    @Body() dto: InterpretCaptureDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.captureService.interpret(
      dto,
      auth.user.id,
      auth.user.companyId,
    );
  }
}

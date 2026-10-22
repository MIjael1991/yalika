import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';

import { type AuthContext } from '../../../auth/auth.types';
import { CurrentAuth } from '../../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../../auth/session-auth.guard';
import { SubscribePushDto, UnsubscribePushDto } from './push.dto';
import { PushService } from './push.service';

@Controller('push')
@UseGuards(SessionAuthGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('key')
  key() {
    return this.pushService.getPublicKey();
  }

  @Post('subscribe')
  subscribe(
    @Body() dto: SubscribePushDto,
    @CurrentAuth() auth: AuthContext,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.pushService.subscribe(auth.user.id, dto, userAgent);
  }

  @Post('unsubscribe')
  unsubscribe(@Body() dto: UnsubscribePushDto, @CurrentAuth() auth: AuthContext) {
    return this.pushService.unsubscribe(auth.user.id, dto.endpoint);
  }
}

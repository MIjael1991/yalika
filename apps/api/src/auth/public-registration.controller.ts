import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { RegisterDto } from './dto/register.dto';
import { PublicRegistrationService } from './public-registration.service';

@Controller('auth')
export class PublicRegistrationController {
  constructor(private readonly registration: PublicRegistrationService) {}

  @Get('register/status')
  status() {
    return this.registration.getStatus();
  }

  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto) {
    return this.registration.register(dto);
  }
}

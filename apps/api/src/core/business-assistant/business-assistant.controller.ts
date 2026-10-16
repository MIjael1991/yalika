import { WritingAssistant, WritingProposalDto } from './writing-assistant';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { AuthContext } from '../../auth/auth.types';
import { BusinessAssistantService } from './business-assistant.service';
import { InterpretBusinessAssistantDto, SaveBusinessMemoryDto } from './dto/business-assistant.dto';

@Controller('business-assistant')
@UseGuards(SessionAuthGuard)
export class BusinessAssistantController {
  constructor(private readonly service: BusinessAssistantService, private readonly writing: WritingAssistant) {}

  @Post('writing')
  proposeWriting(@Body() dto: WritingProposalDto, @CurrentAuth() auth: AuthContext) {
    return this.writing.propose(dto, auth.user);
  }

  @Post('interpret')
  interpret(@Body() dto: InterpretBusinessAssistantDto, @CurrentAuth() auth: AuthContext) {
    return this.service.interpret(dto, auth.user);
  }

  @Get('memory')
  listMemory(@CurrentAuth() auth: AuthContext) {
    return this.service.listMemory(auth.user);
  }

  @Post('memory')
  saveMemory(@Body() dto: SaveBusinessMemoryDto, @CurrentAuth() auth: AuthContext) {
    return this.service.saveMemory(dto, auth.user);
  }
}

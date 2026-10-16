import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { VerifyWorkflowResultDto } from './dto/verify-workflow-result.dto';

@Controller('workflow')
@UseGuards(SessionAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  findAll(@CurrentAuth() auth: AuthContext) {
    return this.workflowService.findAll(auth.user.companyId);
  }

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() createWorkflowDto: CreateWorkflowDto,
  ) {
    return this.workflowService.create(createWorkflowDto, auth.user.companyId);
  }

  @Post(':id/advance')
  advance(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.workflowService.advance(id, auth.user.companyId);
  }

  @Post(':id/run')
  runUntilHumanDecision(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.workflowService.runUntilHumanDecision(id, auth.user.companyId);
  }

  @Post(':id/approve/:alternativeId')
  approveAlternative(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('alternativeId') alternativeId: string,
  ) {
    return this.workflowService.approveAlternative(
      id,
      alternativeId,
      auth.user.companyId,
    );
  }

  @Post(':id/verify-result')
  verifyResult(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() verifyDto: VerifyWorkflowResultDto,
  ) {
    return this.workflowService.verifyResult(
      id,
      verifyDto,
      auth.user.companyId,
    );
  }
}

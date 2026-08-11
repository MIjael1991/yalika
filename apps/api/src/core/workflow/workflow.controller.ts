import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { VerifyWorkflowResultDto } from './dto/verify-workflow-result.dto';

@Controller('workflow')
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
  ) {}

  @Get()
  findAll() {
    return this.workflowService.findAll();
  }

  @Post()
  create(@Body() createWorkflowDto: CreateWorkflowDto) {
    return this.workflowService.create(createWorkflowDto);
  }

  @Post(':id/advance')
  advance(@Param('id') id: string) {
    return this.workflowService.advance(id);
  }

  @Post(':id/run')
  runUntilHumanDecision(@Param('id') id: string) {
    return this.workflowService.runUntilHumanDecision(id);
  }

  @Post(':id/approve/:alternativeId')
  approveAlternative(
    @Param('id') id: string,
    @Param('alternativeId') alternativeId: string,
  ) {
    return this.workflowService.approveAlternative(
      id,
      alternativeId,
    );
  }
  @Post(':id/verify-result')
verifyResult(
  @Param('id') id: string,
  @Body() verifyDto: VerifyWorkflowResultDto,
) {
  return this.workflowService.verifyResult(
    id,
    verifyDto,
  );
}
}

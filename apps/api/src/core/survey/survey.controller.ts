import { ImportSurveyParticipantsDto } from './dto/import-survey-participants.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { type AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { AccessSurveyDto } from './dto/access-survey.dto';
import { ConfirmSurveyBackupDto } from './dto/confirm-survey-backup.dto';
import { ExtractSurveyIneDto } from './dto/extract-survey-ine.dto';
import { PurgeSurveyIneDto } from './dto/purge-survey-ine.dto';
import { SaveSurveyDto } from './dto/save-survey.dto';
import { SuggestSurveyDto } from './dto/suggest-survey.dto';
import { ProofreadSurveyDto } from './dto/proofread-survey.dto';
import { proofreadSurveyDraft } from './survey-proofread';
import { SubmitSurveyDto } from './dto/submit-survey.dto';
import { SurveyResultsQueryDto } from './dto/survey-results-query.dto';
import { UpdateSurveyStatusDto } from './dto/update-survey-status.dto';
import { SurveyService } from './survey.service';

@Controller('survey')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Get('public/:slug')
  @Header('Cache-Control', 'private, no-store')
  findPublic(
    @Param('slug') slug: string,
    @Query('invitation') invitation?: string,
  ) {
    return this.surveyService.findPublic(slug, invitation);
  }

  @Post('public/:slug/ine/extract')
  extractIne(
    @Param('slug') slug: string,
    @Body() dto: ExtractSurveyIneDto,
    @Req() request: Request,
  ) {
    return this.surveyService.extractIneFront(
      slug,
      dto,
      request.ip || 'unknown',
    );
  }

  @Post('public/:slug/responses')
  submit(@Param('slug') slug: string, @Body() dto: SubmitSurveyDto) {
    return this.surveyService.submit(slug, dto);
  }

  @Post('public/:slug/access')
  accessByCode(
    @Param('slug') slug: string,
    @Body() dto: AccessSurveyDto,
    @Req() request: Request,
  ) {
    return this.surveyService.accessByCode(slug, dto, request.ip || 'unknown');
  }

  @Get('public/:slug/results')
  publicResults(@Param('slug') slug: string) {
    return this.surveyService.publicResults(slug);
  }

  @Get()
  @UseGuards(SessionAuthGuard)
  findAll(@CurrentAuth() auth: AuthContext) {
    return this.surveyService.findAll(auth.user.companyId, auth.user.id);
  }

  @Post('suggest')
  @UseGuards(SessionAuthGuard)
  suggest(@Body() dto: SuggestSurveyDto) {
    return this.surveyService.suggest(dto);
  }

  @Post('proofread')
  @UseGuards(SessionAuthGuard)
  proofread(@Body() dto: ProofreadSurveyDto) {
    return proofreadSurveyDraft(dto.draft);
  }

  @Post(':id/invitations/import')
  @UseGuards(SessionAuthGuard)
  importParticipants(
    @Param('id') id: string,
    @Body() dto: ImportSurveyParticipantsDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.surveyService.importParticipants(
      id,
      auth.user.companyId,
      auth.user.id,
      dto.filename,
      dto.content,
    );
  }

  @Get(':id/invitations.xlsx')
  @UseGuards(SessionAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  async exportInvitations(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    const file = await this.surveyService.exportInvitations(
      id,
      auth.user.companyId,
      auth.user.id,
    );
    return new StreamableFile(file.data, {
      type: file.type,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get(':id/export.xlsx')
  @UseGuards(SessionAuthGuard)
  async exportExcel(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    const file = await this.surveyService.exportExcel(
      id,
      auth.user.companyId,
      auth.user.id,
    );
    return new StreamableFile(file.data, {
      type: file.type,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get(':id/ine/archive')
  @UseGuards(SessionAuthGuard)
  async exportIneArchive(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    const file = await this.surveyService.exportIneArchive(
      id,
      auth.user.companyId,
      auth.user.id,
    );
    return new StreamableFile(file.data, {
      type: file.type,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get(':id/backup.zip')
  @UseGuards(SessionAuthGuard)
  async exportBackup(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    const file = await this.surveyService.exportBackup(
      id,
      auth.user.companyId,
      auth.user.id,
    );
    return new StreamableFile(file.data, {
      type: file.type,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Post(':id/backup/confirm')
  @UseGuards(SessionAuthGuard)
  confirmBackup(
    @Param('id') id: string,
    @Body() dto: ConfirmSurveyBackupDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.surveyService.confirmBackup(
      id,
      auth.user.companyId,
      auth.user.id,
      dto.confirmed,
    );
  }

  @Post(':id/ine/purge-backed-up')
  @UseGuards(SessionAuthGuard)
  purgeBackedUpIne(
    @Param('id') id: string,
    @Body() dto: PurgeSurveyIneDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.surveyService.purgeBackedUpIne(
      id,
      auth.user.companyId,
      auth.user.id,
      dto.confirmed,
    );
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  findOne(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.surveyService.findOne(id, auth.user.companyId, auth.user.id);
  }

  @Get(':id/ine')
  @UseGuards(SessionAuthGuard)
  ineSubmissions(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.surveyService.ineSubmissions(
      id,
      auth.user.companyId,
      auth.user.id,
    );
  }

  @Get(':id/ine/:submissionId/:side')
  @UseGuards(SessionAuthGuard)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  async downloadIne(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Param('side') side: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    const file = await this.surveyService.downloadIne(
      id,
      submissionId,
      side,
      auth.user.companyId,
      auth.user.id,
    );
    const extension =
      file.mimeType === 'image/png'
        ? 'png'
        : file.mimeType === 'image/webp'
          ? 'webp'
          : 'jpg';

    return new StreamableFile(file.data, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.folio}_${side === 'front' ? 'FRENTE' : 'REVERSO'}.${extension}"`,
    });
  }

  @Delete(':id/ine/:submissionId')
  @UseGuards(SessionAuthGuard)
  deleteIne(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.surveyService.deleteIne(
      id,
      submissionId,
      auth.user.companyId,
      auth.user.id,
    );
  }

  @Post()
  @UseGuards(SessionAuthGuard)
  create(@Body() dto: SaveSurveyDto, @CurrentAuth() auth: AuthContext) {
    return this.surveyService.create(dto, auth.user.companyId, auth.user.id);
  }

  @Put(':id')
  @UseGuards(SessionAuthGuard)
  update(
    @Param('id') id: string,
    @Body() dto: SaveSurveyDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.surveyService.update(
      id,
      dto,
      auth.user.companyId,
      auth.user.id,
    );
  }

  @Patch(':id/status')
  @UseGuards(SessionAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSurveyStatusDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.surveyService.updateStatus(
      id,
      dto.status,
      auth.user.companyId,
      auth.user.id,
      dto.confirmClose ?? false,
    );
  }

  @Get(':id/results')
  @UseGuards(SessionAuthGuard)
  results(
    @Param('id') id: string,
    @Query() query: SurveyResultsQueryDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.surveyService.results(
      id,
      auth.user.companyId,
      auth.user.id,
      query,
    );
  }

  @Delete(':id')
  @UseGuards(SessionAuthGuard)
  remove(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.surveyService.remove(id, auth.user.companyId, auth.user.id);
  }
}

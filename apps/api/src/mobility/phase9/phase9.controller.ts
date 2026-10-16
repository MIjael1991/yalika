import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { MobilityPhase9Service } from './phase9.service';
import {
  RecordTripPlacesDto,
  SavePlaceDto,
  UpdatePlaceDto,
  UpdatePremiumPreferenceDto,
} from './phase9.dto';

@Controller('mobility')
@UseGuards(SessionAuthGuard)
export class MobilityPhase9Controller {
  constructor(private readonly phase9: MobilityPhase9Service) {}

  // Solo se considera la identidad establecida por SessionAuthGuard.
  // No usamos req.user ni identidades enviadas por el cliente.
  private actor(req: any): string {
    const auth = req?.auth;
    const id = auth?.userId ?? auth?.user?.id;
    if (typeof id !== 'string' || !id.trim()) {
      throw new UnauthorizedException(
        'La sesion no contiene un identificador de usuario valido.',
      );
    }
    return id;
  }

  private owner(req: any, supplied?: string): string {
    const id = this.actor(req);
    if (supplied !== undefined && supplied !== id) {
      throw new ForbiddenException(
        'No puedes acceder a lugares de otra persona.',
      );
    }
    return id;
  }

  @Post('places/save')
  savePlace(@Req() req: any, @Body() dto: SavePlaceDto) {
    return this.phase9.savePlace({
      ...dto,
      userId: this.owner(req, dto.userId),
    });
  }

  @Post('places/record-trip')
  recordTrip(@Req() req: any, @Body() dto: RecordTripPlacesDto) {
    return this.phase9.recordTrip({
      ...dto,
      userId: this.owner(req, dto.userId),
    });
  }

  @Get('places/frequent')
  frequent(
    @Req() req: any,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.phase9.frequent(this.owner(req, userId), Number(limit ?? 8));
  }

  @Get('places/suggestions')
  suggestions(
    @Req() req: any,
    @Query('userId') userId?: string,
    @Query('q') q?: string,
  ) {
    return this.phase9.suggestions(this.owner(req, userId), q ?? '');
  }

  @Get('places/me/all')
  allMine(@Req() req: any) {
    return this.phase9.allMine(this.actor(req));
  }

  @Delete('places/me/all')
  deleteAll(@Req() req: any, @Body() body: { confirmation?: string }) {
    if (body?.confirmation !== 'ELIMINAR_MIS_LUGARES') {
      throw new BadRequestException(
        'Confirma la eliminacion de todos tus lugares.',
      );
    }
    return this.phase9.deleteAllPlaces(this.actor(req));
  }

  @Patch('places/:id')
  updatePlace(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePlaceDto,
  ) {
    return this.phase9.updatePlace(id, dto, this.actor(req));
  }

  @Delete('places/:id')
  removePlace(@Req() req: any, @Param('id') id: string) {
    return this.phase9.removePlace(id, this.actor(req));
  }

  @Patch('premium/preferences')
  updatePreference(@Req() req: any, @Body() dto: UpdatePremiumPreferenceDto) {
    return this.phase9.updatePreference({
      ...dto,
      userId: this.owner(req, dto.userId),
    });
  }

  @Get('premium/preferences')
  getPreference(@Req() req: any, @Query('userId') userId?: string) {
    return this.phase9.getPreference(this.owner(req, userId));
  }
}

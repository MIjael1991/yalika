import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  CreateVetConsultationDto,
  CreateVetPetDto,
  IssueVetPrescriptionDto,
  UpdateVetPetDto,
} from './dto/veterinaria.dto';
import { VeterinariaFeatureGuard } from './veterinaria-feature.guard';
import { VeterinariaService } from './veterinaria.service';

@Controller('veterinaria')
@UseGuards(SessionAuthGuard, VeterinariaFeatureGuard)
export class VeterinariaController {
  constructor(private readonly vet: VeterinariaService) {}

  // Tutor
  @Post('pets')
  createPet(@CurrentAuth() auth: AuthContext, @Body() dto: CreateVetPetDto) {
    return this.vet.createPet(auth, dto);
  }

  @Get('pets')
  listPets(@CurrentAuth() auth: AuthContext) {
    return this.vet.listPets(auth);
  }

  @Get('pets/:petId')
  getPet(@CurrentAuth() auth: AuthContext, @Param('petId') petId: string) {
    return this.vet.getPet(auth, petId);
  }

  @Patch('pets/:petId')
  updatePet(
    @CurrentAuth() auth: AuthContext,
    @Param('petId') petId: string,
    @Body() dto: UpdateVetPetDto,
  ) {
    return this.vet.updatePet(auth, petId, dto);
  }

  @Post('pets/:petId/consultations')
  createConsultation(
    @CurrentAuth() auth: AuthContext,
    @Param('petId') petId: string,
    @Body() dto: CreateVetConsultationDto,
  ) {
    return this.vet.createConsultation(auth, petId, dto);
  }

  @Get('pets/:petId/consultations')
  listPetConsultations(
    @CurrentAuth() auth: AuthContext,
    @Param('petId') petId: string,
  ) {
    return this.vet.listPetConsultations(auth, petId);
  }

  @Get('pets/:petId/prescriptions')
  listPrescriptions(
    @CurrentAuth() auth: AuthContext,
    @Param('petId') petId: string,
  ) {
    return this.vet.listPrescriptions(auth, petId);
  }

  // Veterinario
  @Get('vet/consultations')
  listAssignedConsultations(@CurrentAuth() auth: AuthContext) {
    return this.vet.listAssignedConsultations(auth);
  }

  @Post('vet/consultations/:id/prescriptions')
  issuePrescription(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: IssueVetPrescriptionDto,
  ) {
    return this.vet.issuePrescription(auth, id, dto);
  }
}

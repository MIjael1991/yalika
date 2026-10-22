import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  VET_CONSULTATION_MODES,
  VET_SEX,
  VET_SPECIES,
} from '../veterinaria.constants';

export class CreateVetPetDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsIn(VET_SPECIES as unknown as string[]) species!: string;
  @IsOptional() @IsString() @MaxLength(80) breed?: string;
  @IsOptional() @IsIn(VET_SEX as unknown as string[]) sex?: string;
  @IsOptional() @IsISO8601() birthDate?: string;
  @IsOptional() @IsBoolean() birthDateApprox?: boolean;
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'Microchip inválido' })
  microchip?: string;
}

export class UpdateVetPetDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsIn(VET_SPECIES as unknown as string[]) species?: string;
  @IsOptional() @IsString() @MaxLength(80) breed?: string;
  @IsOptional() @IsIn(VET_SEX as unknown as string[]) sex?: string;
  @IsOptional() @IsISO8601() birthDate?: string;
  @IsOptional() @IsBoolean() birthDateApprox?: boolean;
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'Microchip inválido' })
  microchip?: string;
}

export class CreateVetConsultationDto {
  @IsIn(VET_CONSULTATION_MODES as unknown as string[]) mode!: string;
  @IsISO8601() scheduledAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsEmail() veterinarianEmail?: string;
}

export class VetPrescriptionItemDto {
  @IsString() @MinLength(1) @MaxLength(160) medicationName!: string;
  @IsOptional() @IsString() @MaxLength(80) strength?: string;
  @IsOptional() @IsString() @MaxLength(80) form?: string;
  @IsOptional() @IsString() @MaxLength(80) route?: string;
  @IsOptional() @IsString() @MaxLength(160) dosageText?: string;
  @IsOptional() @IsString() @MaxLength(160) frequencyText?: string;
  @IsOptional() @IsString() @MaxLength(160) durationText?: string;
  @IsOptional() @IsString() @MaxLength(160) quantityText?: string;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;
}

export class IssueVetPrescriptionDto {
  @IsISO8601() issuedAt!: string;
  @IsOptional() @IsString() @MaxLength(80) idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => VetPrescriptionItemDto)
  items!: VetPrescriptionItemDto[];
}

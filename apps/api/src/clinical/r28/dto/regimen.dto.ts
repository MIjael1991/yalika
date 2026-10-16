import {
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClinicalRegimenDto {
  @IsString()
  @MaxLength(80)
  prescriptionId!: string;

  @IsString()
  @MaxLength(80)
  prescriptionItemId!: string;

  @IsString()
  @MaxLength(500)
  instructions!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  doseAmount!: number;

  @IsString()
  @MaxLength(40)
  doseUnit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  @Max(24)
  administrationsPerDay!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  @Max(3650)
  durationDays!: number;

  @IsOptional()
  @IsISO8601()
  firstDoseAt?: string;
}

export class RecommendCommercialPresentationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  packageUnits!: number;
}

export class DispenseClinicalRegimenDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  packageUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  packagesPresented?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  looseUnitsPresented?: number;

  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerName?: string;
}

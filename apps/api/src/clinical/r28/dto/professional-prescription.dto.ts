import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ConsultationPrescriptionItemDto {
  @IsString()
  @MaxLength(160)
  medicationName!: string;

  @IsOptional() @IsString() @MaxLength(80) strength?: string;
  @IsOptional() @IsString() @MaxLength(80) form?: string;
  @IsOptional() @IsString() @MaxLength(80) route?: string;
  @IsOptional() @IsString() @MaxLength(160) dosageText?: string;
  @IsOptional() @IsString() @MaxLength(160) frequencyText?: string;
  @IsOptional() @IsString() @MaxLength(160) durationText?: string;
  @IsOptional() @IsString() @MaxLength(160) quantityText?: string;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;

  // El profesional prescribe tratamiento clínico.
  // La caja/frasco/presentación comercial la decide farmacia después.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  doseAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  doseUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  @Max(24)
  administrationsPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  @Max(3650)
  durationDays?: number;
}

export class CreateConsultationPrescriptionDto {
  @IsDateString()
  issuedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  institutionName?: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ConsultationPrescriptionItemDto)
  items!: ConsultationPrescriptionItemDto[];
}

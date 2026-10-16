import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePrescriptionItemDto {
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
}

export class CreatePatientPrescriptionDto {
  @IsDateString()
  issuedAt!: string;

  @IsOptional() @IsString() @MaxLength(160) prescriberName?: string;
  @IsOptional() @IsString() @MaxLength(160) institutionName?: string;
  @IsOptional() @IsString() @MaxLength(80) documentId?: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionItemDto)
  items!: CreatePrescriptionItemDto[];
}

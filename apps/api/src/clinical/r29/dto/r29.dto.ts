import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVisitCaptureDto {
  @IsIn(['PHOTO', 'FILE', 'VOICE', 'MANUAL'])
  sourceType!: 'PHOTO' | 'FILE' | 'VOICE' | 'MANUAL';

  @IsOptional() @IsString() @MaxLength(80) consultationId?: string;
  @IsOptional() @IsString() @MaxLength(80) documentId?: string;
  @IsOptional() @IsString() @MaxLength(12000) sourceText?: string;
  @IsOptional() @IsISO8601() visitAt?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(128) operationId?: string;
}

export class ConfirmVisitCaptureDto {
  @IsObject()
  confirmedData!: Record<string, unknown>;

  @IsOptional()
  @IsIn(['CONFIRMED', 'PARTIAL', 'REJECTED'])
  status?: 'CONFIRMED' | 'PARTIAL' | 'REJECTED';
}

export class CreateAllergyDto {
  @IsString() @MaxLength(160) substance!: string;
  @IsIn(['MEDICATION', 'FOOD', 'ENVIRONMENTAL', 'OTHER']) allergyType!: string;
  @IsOptional() @IsString() @MaxLength(500) reaction?: string;
  @IsOptional() @IsIn(['MILD', 'MODERATE', 'SEVERE', 'UNSPECIFIED']) severity?: string;
  @IsOptional() @IsISO8601() approximateDate?: string;
  @IsOptional() @IsIn(['PATIENT', 'FAMILY', 'DOCUMENT', 'PROFESSIONAL']) source?: string;
  @IsOptional() @IsIn(['REPORTED', 'DOCUMENTED', 'PROFESSIONAL_CONFIRMED']) confirmationStatus?: string;
  @IsOptional() @IsString() @MaxLength(80) sourceDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(128) operationId?: string;
}

export class CreateRestrictionDto {
  @IsString() @MaxLength(160) itemName!: string;
  @IsIn(['FOOD_ALLERGY', 'INTOLERANCE', 'PREFERRED_AVOID', 'MEDICAL_RESTRICTION']) restrictionType!: string;
  @IsOptional() @IsString() @MaxLength(500) reactionOrReason?: string;
  @IsOptional() @IsIn(['PATIENT', 'FAMILY', 'DOCUMENT', 'PROFESSIONAL']) source?: string;
  @IsOptional() @IsIn(['REPORTED', 'DOCUMENTED', 'PROFESSIONAL_CONFIRMED']) confirmationStatus?: string;
  @IsOptional() @IsString() @MaxLength(80) sourceDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(128) operationId?: string;
}

export class CreateMedicationScheduleDto {
  @IsString() @MaxLength(80) regimenId!: string;
  @IsISO8601() firstDoseAt!: string;
  @IsInt() @Min(1) @Max(168) intervalHours!: number;
  @IsOptional() @IsISO8601() endAt?: string;
  @IsOptional() @IsString() @MaxLength(128) operationId?: string;
}

export class RecordMedicationDoseDto {
  @IsIn(['TAKEN', 'OMITTED']) status!: 'TAKEN' | 'OMITTED';
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsString() @MaxLength(128) operationId!: string;
}

export class ChangeMedicationScheduleDto {
  @IsIn(['SUSPENDED', 'ACTIVE', 'FINISHED']) status!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsString() @MaxLength(128) operationId!: string;
}

export class CreateProcedureDto {
  @IsString() @MaxLength(200) procedureName!: string;
  @IsISO8601() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(160) hospitalName?: string;
  @IsOptional() @IsString() @MaxLength(160) clinicianName?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(80) dischargeDocumentId?: string;
  @IsOptional() @IsISO8601() followUpAt?: string;
  @IsOptional() @IsString() @MaxLength(128) operationId?: string;
}

export class CreateFollowUpProposalDto {
  @IsString() @MaxLength(1000) recommendationText!: string;
  @IsISO8601() targetAt!: string;
  @IsOptional() @IsString() @MaxLength(80) consultationId?: string;
  @IsOptional() @IsString() @MaxLength(80) sourceDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(128) operationId?: string;
}

export class DoctorSummaryDto {
  @IsOptional() @IsBoolean() saveToFiles?: boolean;
  @IsOptional() @IsInt() @Min(7) @Max(3650) daysBack?: number;
}

export class CreateHealthQrDto {
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) categories!: string[];
  @IsInt() @Min(5) @Max(1440) expiresInMinutes!: number;
}

export class CreateCaregiverGrantDto {
  @IsEmail() caregiverEmail!: string;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) categories!: string[];
  @IsInt() @Min(1) @Max(365) expiresInDays!: number;
}

export class SyncOperationDto {
  @IsString() @MaxLength(128) operationId!: string;
  @IsIn(['CAPTURE_CREATE','DOSE_RECORD','ALLERGY_CREATE','RESTRICTION_CREATE','PROCEDURE_CREATE']) kind!: string;
  @IsObject() payload!: Record<string, unknown>;
}

export class SyncBatchDto {
  @IsArray() @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}

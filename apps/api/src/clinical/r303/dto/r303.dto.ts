import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEmergencyProfileDto {
  @IsOptional() @IsIn(['A+','A-','B+','B-','AB+','AB-','O+','O-','UNKNOWN']) bloodType?: string;
  @IsOptional() @IsIn(['PATIENT','DOCUMENT','PROFESSIONAL']) bloodTypeSource?: string;
  @IsOptional() @IsIn(['REPORTED','DOCUMENTED','PROFESSIONAL_CONFIRMED']) bloodTypeConfirmationStatus?: string;
  @IsOptional() @IsString() @MaxLength(160) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(80) emergencyContactRelationship?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyContactPhone?: string;
  @IsOptional() @IsString() @MaxLength(1000) emergencyNotes?: string;
}

export class CreateChronicConditionDto {
  @IsString() @MaxLength(180) conditionName!: string;
  @IsOptional() @IsISO8601() diagnosedAt?: string;
  @IsOptional() @IsIn(['PATIENT','DOCUMENT','PROFESSIONAL']) source?: string;
  @IsOptional() @IsIn(['REPORTED','DOCUMENTED','PROFESSIONAL_CONFIRMED']) confirmationStatus?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() @MaxLength(128) operationId?: string;
}

export class ClinicalR303AssistantDto {
  @IsString() @MaxLength(1000) query!: string;
}

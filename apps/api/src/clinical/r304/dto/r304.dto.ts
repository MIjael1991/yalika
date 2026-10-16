import { IsBoolean, IsEmail, IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateHealthEpisodeDto {
  @IsIn(['INFECTION','ACUTE_ILLNESS','INJURY','FRACTURE','HOSPITALIZATION','OTHER']) episodeType!: string;
  @IsString() @MaxLength(180) title!: string;
  @IsOptional() @IsString() @MaxLength(120) bodyRegion?: string;
  @IsOptional() @IsISO8601() startedAt?: string;
  @IsOptional() @IsISO8601() endedAt?: string;
  @IsOptional() @IsString() @MaxLength(1200) notes?: string;
  @IsOptional() @IsIn(['PATIENT','DOCUMENT','PROFESSIONAL']) source?: string;
  @IsOptional() @IsIn(['REPORTED','DOCUMENTED','PROFESSIONAL_CONFIRMED']) confirmationStatus?: string;
  @IsOptional() @IsString() @MaxLength(128) operationId?: string;
}

export class ResolveHealthEpisodeDto {
  @IsOptional() @IsISO8601() endedAt?: string;
  @IsOptional() @IsString() @MaxLength(1200) notes?: string;
}

export class LinkHealthResourceDto {
  @IsIn(['CHRONIC_CONDITION','EPISODE']) parentType!: string;
  @IsString() @MaxLength(80) parentId!: string;
  @IsIn(['DOCUMENT','PRESCRIPTION','PROCEDURE','VISIT_CAPTURE','CONSULTATION']) resourceType!: string;
  @IsString() @MaxLength(80) resourceId!: string;
  @IsOptional() @IsIn(['RELATED','EVIDENCE','TREATMENT','FOLLOW_UP']) relationType?: string;
  @IsOptional() @IsString() @MaxLength(128) operationId?: string;
}

export class SetHealthPrivacyDto {
  @IsIn(['CHRONIC_CONDITION','EPISODE','PROCEDURE','DOCUMENT','PRESCRIPTION']) resourceType!: string;
  @IsString() @MaxLength(80) resourceId!: string;
  @IsIn(['STANDARD','SENSITIVE','RESTRICTED']) sensitivity!: string;
  @IsBoolean() shareWithVerifiedProfessional!: boolean;
  @IsBoolean() emergencyShare!: boolean;
}

export class UpdateEmergencySharePolicyDto {
  @IsBoolean() includeBloodType!: boolean;
  @IsBoolean() includeAllergies!: boolean;
  @IsBoolean() includeCurrentMedications!: boolean;
  @IsBoolean() includeEmergencyContact!: boolean;
  @IsBoolean() includeSharedConditions!: boolean;
  @IsBoolean() includeSharedProcedures!: boolean;
}

export class CreateEmergencyDelegateDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(80) relationship?: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) expiresInDays?: number;
}

export class CreateEmergencyRelayLinkDto {
  @IsString() @MaxLength(80) clinicalProfileId!: string;
  @IsOptional() @IsInt() @Min(5) @Max(120) minutes?: number;
}

export class EmergencyTokenDto {
  @IsString() @MaxLength(500) token!: string;
}

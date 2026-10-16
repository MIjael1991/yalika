import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertProfessionalProfileDto {
  @IsString() @MaxLength(160) displayName!: string;
  @IsString() @MaxLength(80) professionalLicenseNumber!: string;
  @IsString() @MaxLength(160) profession!: string;
  @IsOptional() @IsString() @MaxLength(160) specialty?: string;
  @IsOptional() @IsString() @MaxLength(80) specialistLicenseNumber?: string;
}

export class CreateCareOrganizationDto {
  @IsIn(['PHARMACY', 'CLINIC', 'DOCTOR_OFFICE', 'LABORATORY', 'OTHER'])
  organizationType!: string;
  @IsString() @MaxLength(180) displayName!: string;
  @IsOptional() @IsString() @MaxLength(180) legalName?: string;
  @IsOptional() @IsString() @MaxLength(32) rfc?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(120) municipality?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(16) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(120) sanitaryNoticeNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) healthAuthorizationNumber?: string;
  @IsOptional() @IsString() @MaxLength(180) responsibleName?: string;
  @IsOptional() @IsString() @MaxLength(120) responsibleRole?: string;
  @IsOptional() @IsString() @MaxLength(80) responsibleProfessionalLicense?: string;
}

export class UpdateCareOrganizationDto extends CreateCareOrganizationDto {}

export class InviteProfessionalDto {
  @IsEmail() professionalEmail!: string;
  @IsOptional() @IsIn(['STAFF', 'CONTRACTOR', 'AGREEMENT']) relationshipType?: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
}

export class EndProfessionalMembershipDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class VerifyProfessionalDto {
  @IsIn(['VERIFIED', 'REJECTED', 'SUSPENDED']) result!: string;
  @IsString() @MaxLength(80) verificationType!: string;
  @IsString() @MaxLength(80) source!: string;
  @IsOptional() @IsString() @MaxLength(500) sourceReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() canPrescribe?: boolean;
}

export class VerifyOrganizationDto {
  @IsIn(['VERIFIED', 'REJECTED', 'SUSPENDED']) result!: string;
  @IsString() @MaxLength(80) verificationType!: string;
  @IsString() @MaxLength(80) source!: string;
  @IsOptional() @IsString() @MaxLength(500) sourceReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

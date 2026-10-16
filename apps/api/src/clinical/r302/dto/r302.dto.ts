import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateNetworkOrganizationDto {
  @IsIn(['PHARMACY','PHARMACY_WITH_OFFICE','DOCTOR_OFFICE','CLINIC','LABORATORY','OTHER'])
  organizationType!: string;
  @IsString() @MaxLength(180) displayName!: string;
  @IsOptional() @IsString() @MaxLength(180) legalName?: string;
  @IsOptional() @IsString() @MaxLength(32) rfc?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MaxLength(200) addressLine1!: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) neighborhood?: string;
  @IsString() @MaxLength(120) municipality!: string;
  @IsString() @MaxLength(120) state!: string;
  @IsOptional() @IsString() @MaxLength(16) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(120) sanitaryNoticeNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) healthAuthorizationNumber?: string;
  @IsString() @MaxLength(180) responsibleName!: string;
  @IsOptional() @IsString() @MaxLength(120) responsibleRole?: string;
  @IsOptional() @IsString() @MaxLength(80) responsibleProfessionalLicense?: string;
}

export class CaptureOrganizationLocationDto {
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) accuracyMeters?: number;
  @IsOptional() @IsIn(['DEVICE','MANUAL']) source?: string;
}

export class InviteNetworkProfessionalDto {
  @IsEmail() professionalEmail!: string;
  @IsOptional() @IsIn(['STAFF','CONTRACTOR','AGREEMENT']) relationshipType?: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
}

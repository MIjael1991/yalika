import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClinicalConsultationDto {
  @IsIn(['HUMAN', 'PET', 'LIVESTOCK'])
  subjectType!: 'HUMAN' | 'PET' | 'LIVESTOCK';

  @IsIn(['online', 'presential', 'follow_up'])
  mode!: 'online' | 'presential' | 'follow_up';

  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(240)
  clinicianEmail?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  configuredPriceCents?: number;
}

export class CreateClinicalConsultationLinkDto {
  @IsInt()
  @Min(5)
  @Max(10080)
  ttlMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxUses?: number;
}

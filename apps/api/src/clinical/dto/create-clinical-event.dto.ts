import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateClinicalEventDto {
  @IsIn(['APPOINTMENT', 'STUDY', 'FOLLOW_UP', 'VACCINE', 'OTHER'])
  kind!: string;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED'])
  status?: string;
}

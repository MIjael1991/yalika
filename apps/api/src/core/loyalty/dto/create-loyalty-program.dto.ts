import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLoyaltyProgramDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  requiredVisits: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  rewardType?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  rewardDescription: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  rewardValidDays: number;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsUUID('4')
  companyId: string;
}
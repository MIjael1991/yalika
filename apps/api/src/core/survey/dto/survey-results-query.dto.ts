import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SurveyResultsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  municipality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  locality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  electoralSection?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(500)
  textLimit?: number;
}

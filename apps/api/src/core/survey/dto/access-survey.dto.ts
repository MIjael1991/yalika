import { IsString, MaxLength, MinLength } from 'class-validator';

export class AccessSurveyDto {
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  code: string;
}

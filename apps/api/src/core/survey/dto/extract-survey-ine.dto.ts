import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ExtractSurveyIneDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  invitationToken?: string;

  @IsString()
  @MaxLength(2400000)
  frontImage: string;
}

import { IsString, MaxLength } from 'class-validator';
export class ImportSurveyParticipantsDto {
  @IsString()
  @MaxLength(180)
  filename: string;
  @IsString()
  @MaxLength(2700000)
  content: string;
}

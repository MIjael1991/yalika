import { IsBoolean } from 'class-validator';

export class ConfirmSurveyBackupDto {
  @IsBoolean()
  confirmed: boolean;
}

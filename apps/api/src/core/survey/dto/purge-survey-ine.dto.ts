import { IsBoolean } from 'class-validator';

export class PurgeSurveyIneDto {
  @IsBoolean()
  confirmed: boolean;
}

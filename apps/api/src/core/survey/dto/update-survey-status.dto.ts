import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateSurveyStatusDto {
  @IsIn(['draft', 'active', 'closed'])
  status: string;

  @IsOptional()
  @IsBoolean()
  confirmClose?: boolean;
}

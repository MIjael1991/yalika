import { IsNotEmptyObject, IsObject } from 'class-validator';

export class ProofreadSurveyDto {
  @IsObject()
  @IsNotEmptyObject()
  draft!: Record<string, unknown>;
}

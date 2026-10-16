import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import type { SurveySuggestionDraft } from '../survey-suggestion';

export class SuggestSurveyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(3000)
  request: string;

  @IsOptional()
  @IsObject()
  draft?: SurveySuggestionDraft;
}

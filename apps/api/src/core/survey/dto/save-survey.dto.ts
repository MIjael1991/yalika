import { Type } from 'class-transformer';
import {
  ArrayUnique,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  Max,
  Min,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SaveSurveyQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt: string;

  @IsIn(['choice', 'multi', 'yesno', 'rating', 'text'])
  type: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(180, { each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  publicAggregate?: boolean;
}

export class SurveyPersonalFieldDto {
  @IsIn([
    'name',
    'email',
    'phone',
    'municipality',
    'locality',
    'postalCode',
    'address',
    'curp',
    'voterKey',
    'electoralSection',
  ])
  key: string;
  @IsBoolean()
  required: boolean;
}

export class SaveSurveyDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique((field: SurveyPersonalFieldDto) => field.key)
  @ValidateNested({ each: true })
  @Type(() => SurveyPersonalFieldDto)
  personalFields?: SurveyPersonalFieldDto[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'closed'])
  status?: string;

  @IsOptional()
  @IsIn(['anonymous', 'phone', 'email', 'email_or_phone', 'email_and_phone'])
  identityMode?: string;

  @IsOptional()
  @IsIn(['public', 'group', 'private'])
  accessMode?: string;

  /** Fecha y hora (ISO) en que la encuesta deja de recibir respuestas; null la quita. */
  @IsOptional()
  @IsISO8601()
  closesAt?: string | null;

  @IsOptional()
  @IsBoolean()
  collectMunicipality?: boolean;

  @IsOptional()
  @IsBoolean()
  collectLocality?: boolean;

  @IsOptional()
  @IsBoolean()
  collectLeaderProposal?: boolean;

  @IsOptional()
  @IsBoolean()
  collectIne?: boolean;

  @IsOptional()
  @IsIn(['front', 'front_back'])
  ineCaptureMode?: string;

  @IsOptional()
  @IsBoolean()
  ineAutoExtract?: boolean;

  @IsOptional()
  @IsBoolean()
  ineRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  collectPostalCode?: boolean;

  @IsOptional()
  @IsBoolean()
  collectAddress?: boolean;

  @IsOptional()
  @IsBoolean()
  collectCurp?: boolean;

  @IsOptional()
  @IsBoolean()
  collectVoterKey?: boolean;

  @IsOptional()
  @IsBoolean()
  collectElectoralSection?: boolean;

  @IsOptional()
  @IsBoolean()
  showPublicResults?: boolean;

  @IsOptional()
  @IsIn(['temporary', 'yaleka_cloud'])
  ineStorageMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  ineRetentionDays?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  privacyNotice: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  thankYouMessage?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaveSurveyQuestionDto)
  questions: SaveSurveyQuestionDto[];
}

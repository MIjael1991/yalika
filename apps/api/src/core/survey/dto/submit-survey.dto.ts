import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SurveyPersonDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && !value.trim() ? undefined : value,
  )
  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

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
  @MaxLength(5)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  curp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  voterKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  electoralSection?: string;
}

export class SurveyIneDto {
  @IsString()
  @MaxLength(2400000)
  frontImage: string;

  @IsOptional()
  @IsString()
  @MaxLength(2400000)
  backImage?: string;
}

export class SubmitSurveyDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  invitationToken?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SurveyPersonDto)
  person?: SurveyPersonDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SurveyIneDto)
  ine?: SurveyIneDto;

  @IsBoolean()
  acceptPrivacy: boolean;

  @IsOptional()
  @IsBoolean()
  consentContact?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  contactChannels?: string[];

  @IsObject()
  answers: Record<string, unknown>;
}

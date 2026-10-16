import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAssistantPreferenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  preferredName?: string;

  @IsOptional()
  @IsBoolean()
  automaticLocale?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, {
    message: 'La región de voz no es válida',
  })
  voiceLocale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  voiceName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.7)
  @Max(1.3)
  voiceRate?: number;
}

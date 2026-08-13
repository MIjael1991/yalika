import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'El slug solo puede contener letras minúsculas, números y guiones',
  })
  slug: string;

  @IsOptional()
  @IsIn([
    'hero',
    'catalog',
    'menu',
    'gallery',
    'promotions',
    'media',
  ])
  template?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsIn(['color', 'image', 'gradient'])
  backgroundType?: string;

  @IsOptional()
  @IsString()
  backgroundValue?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  heroImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  heroTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  heroSubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  heroButtonText?: string;

  @IsOptional()
  @IsString()
  heroButtonUrl?: string;

  @IsUUID('4')
  companyId: string;
}
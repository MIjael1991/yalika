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
  @IsOptional()
  @IsUUID('4')
  catalogId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'El slug solo puede contener letras minúsculas, números y guiones',
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
    'yaleka_cherry_nails',
    'yaleka_luna_boutique',
    'yaleka_prisma_papeleria',
    'boutique_elegant',
    'social_vibrant',
    'minimal_catalog',
    'artisan_warm',
    'punk_rock',
    'dark_neon',
    'vacation_bright',
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

  @IsOptional()
  @IsString()
  @MaxLength(240)
  announcementText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsappPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tiktokUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  extraLinkLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  extraLinkUrl?: string;

  @IsUUID('4')
  companyId: string;
}

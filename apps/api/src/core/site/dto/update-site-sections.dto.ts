import { Type } from 'class-transformer';
import { IsISO8601, ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class SiteSectionInputDto {
  @IsIn(['hero', 'banner', 'catalog', 'promotions', 'gallery', 'video', 'menu', 'text', 'loyalty', 'location', 'contact'])
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  layout?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}

export class UpdateSiteSectionsDto {
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SiteSectionInputDto)
  sections!: SiteSectionInputDto[];
}

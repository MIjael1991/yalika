import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { CreateVariantDto } from './create-variant.dto';

export class CreateProductDto {
  @IsOptional()
  @IsUUID('4')
  catalogId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsIn([
    'product',
    'service',
    'food',
    'beverage',
    'design',
  ])
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsNumber()
  @Min(0)
  price: number;

  // Costo por unidad: opcional; nunca inferir costo 0 de un dato ausente.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  unitsPerPack?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  packSalePrice?: number;

  @IsOptional()
  @IsBoolean()
  webVisible?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockAt?: number;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsBoolean()
  seasonal?: boolean;

  @IsOptional()
  @IsDateString()
  seasonStartsAt?: string;

  @IsOptional()
  @IsDateString()
  seasonEndsAt?: string;

  @IsUUID('4')
  companyId: string;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}

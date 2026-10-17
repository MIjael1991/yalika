import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  unitsPerPack?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  packSalePrice?: number | null;

  @IsOptional()
  @IsBoolean()
  webVisible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  /** Avisar cuando queden estas piezas o menos. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  lowStockAt?: number;

  /** Fecha límite opcional para vender o retirar el producto; null la quita. */
  @IsOptional()
  @IsDateString()
  seasonEndsAt?: string | null;
}

import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateProductBarcodeDto {
  @IsString()
  @MaxLength(128)
  value!: string;

  @IsOptional()
  @IsIn(['EAN13', 'UPC', 'CODE128', 'CODE39', 'QR', 'OTHER'])
  format?: string;

  @IsOptional()
  @IsIn(['unit', 'pack', 'internal'])
  kind?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  unitsPerScan?: number;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

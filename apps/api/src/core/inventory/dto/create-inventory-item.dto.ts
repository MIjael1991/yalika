import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsIn([
    'merchandise',
    'ingredient',
    'beverage',
    'supply',
    'packaging',
    'material',
  ])
  kind?: string;

  @IsIn([
    'piece',
    'kg',
    'g',
    'liter',
    'ml',
    'bottle',
    'can',
    'box',
    'package',
    'pair',
    'dozen',
    'roll',
  ])
  unit: string;

  @IsOptional()
  @IsString()
  purchaseUnit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  purchaseConversion?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  initialQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  averageCost?: number;

  @IsOptional()
  @IsIn(['exact', 'estimated', 'count_only'])
  trackingMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  countEveryDays?: number;

  @IsUUID('4')
  companyId: string;
}

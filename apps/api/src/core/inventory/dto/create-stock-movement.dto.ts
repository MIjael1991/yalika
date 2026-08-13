import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStockMovementDto {
  @IsUUID('4')
  inventoryItemId: string;

  @IsUUID('4')
  companyId: string;

  @IsIn(['in', 'out'])
  direction: string;

  @IsIn([
  'supplier_delivery',
  'manual_purchase',
  'return',

  'sale',
  'consumption',
  'recipe_consumption',

  'spoilage',
  'overportion',
  'complimentary',
  'staff_consumption',

  'damage',
  'expiration',

  'adjustment_in',
  'adjustment_out',
])
reason: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
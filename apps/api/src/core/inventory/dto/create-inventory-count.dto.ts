import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateInventoryCountDto {
  @IsUUID('4')
  inventoryItemId: string;

  @IsUUID('4')
  companyId: string;

  @IsNumber()
  @Min(0)
  countedQuantity: number;

  @IsOptional()
  @IsIn([
    'stock_check',
    'spoilage',
    'overportion',
    'complimentary',
    'staff_consumption',
    'damage',
    'expiration',
    'other',
  ])
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
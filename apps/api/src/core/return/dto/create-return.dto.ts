import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateReturnItemDto {
  @IsUUID('4')
  orderItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsIn([
    'sellable',
    'opened',
    'damaged',
    'defective',
    'incomplete',
    'prepared',
    'consumed',
    'other',
  ])
  condition: string;

  @IsIn([
    'restock',
    'quarantine',
    'discard',
    'no_restock',
  ])
  disposition: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateReturnDto {
  @IsUUID('4')
  companyId: string;

  @IsUUID('4')
  orderId: string;

  @IsUUID('4')
  authorizedById: string;

  @IsOptional()
  @IsIn([
    'return',
    'exchange',
  ])
  type?: string;

  @IsIn([
    'customer_changed_mind',
    'wrong_item',
    'wrong_size_or_color',
    'defective',
    'damaged',
    'incomplete',
    'quality_issue',
    'order_error',
    'warranty',
    'other',
  ])
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsUUID('4')
  exchangeOrderId?: string;

  @IsOptional()
  @IsUUID('4')
  operationId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items: CreateReturnItemDto[];
}
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

class CreateOrderItemDto {
  @IsUUID('4')
  productId: string;

  @IsOptional()
  @IsUUID('4')
  variantId?: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateOrderDto {
  @IsUUID('4')
  companyId: string;

  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @IsOptional()
  @IsUUID('4')
  loyaltyProgramId?: string;

  @IsOptional()
  @IsIn([
    'counter',
    'qr',
    'web',
    'whatsapp',
    'didi',
    'uber',
    'manual',
  ])
  source?: string;

  @IsOptional()
  @IsIn([
    'counter',
    'pickup',
    'delivery',
    'appointment',
  ])
  orderType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
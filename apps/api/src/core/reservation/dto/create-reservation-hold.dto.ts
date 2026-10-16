import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class ReservationItemDto {
  @IsUUID('4')
  productId: string;

  @IsOptional()
  @IsUUID('4')
  variantId?: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateReservationHoldDto {
  @IsString()
  @MaxLength(120)
  siteSlug: string;

  @IsUUID('4')
  operationId: string;

  @IsString()
  @MaxLength(120)
  contactName: string;

  @IsString()
  @MaxLength(40)
  contactPhone: string;

  @IsOptional()
  @IsIn(['pickup', 'delivery', 'arrange'])
  deliveryMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemDto)
  items: ReservationItemDto[];
}

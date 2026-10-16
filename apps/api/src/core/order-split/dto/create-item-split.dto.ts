import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

class ItemAllocationDto {
  @IsUUID('4')
  orderItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

class ItemSplitPartDto {
  @IsString()
  @MaxLength(100)
  label: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({
    each: true,
  })
  @Type(() => ItemAllocationDto)
  items: ItemAllocationDto[];
}

export class CreateItemSplitDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({
    each: true,
  })
  @Type(() => ItemSplitPartDto)
  splits: ItemSplitPartDto[];
}

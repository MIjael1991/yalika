import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

class CustomSplitPartDto {
  @IsString()
  @MaxLength(100)
  label: string;

  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class CreateCustomSplitDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({
    each: true,
  })
  @Type(
    () => CustomSplitPartDto,
  )
  splits: CustomSplitPartDto[];
}
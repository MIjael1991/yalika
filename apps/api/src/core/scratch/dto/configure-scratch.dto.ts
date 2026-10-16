import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class ScratchPrizeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  probabilityPercent: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  stock?: number;
}

export class ConfigureScratchDto {
  @IsUUID('4')
  loyaltyProgramId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(365)
  validDays: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ScratchPrizeDto)
  prizes: ScratchPrizeDto[];
}

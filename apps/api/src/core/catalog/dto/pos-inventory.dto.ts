import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty,
  IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';

export class ReceiveLineDto {
  @IsUUID('4')
  productId: string;

  @IsOptional()
  @IsUUID('4')
  variantId?: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  packs: number;

  @IsInt()
  @Min(1)
  @Max(100000)
  unitsPerPack: number;

  // Dato ausente = costo desconocido; cero explícito = costo cero comprobado.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  costPerPack?: number;
}

export class ReceiveProductsDto {
  @IsUUID('4')
  companyId: string;

  @IsUUID('4')
  operationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  sourceName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines: ReceiveLineDto[];
}

export class SetVisibilityDto {
  @IsUUID('4')
  companyId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  productIds: string[];

  @IsBoolean()
  webVisible: boolean;
}

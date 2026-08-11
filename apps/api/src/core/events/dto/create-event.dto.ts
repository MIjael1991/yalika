import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty({
    message: 'El tipo de evento es obligatorio',
  })
  @MaxLength(120)
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  entityId?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsUUID('4', {
    message: 'El identificador de la empresa no es válido',
  })
  companyId: string;
}
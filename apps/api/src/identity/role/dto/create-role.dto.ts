import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del rol es obligatorio' })
  @MinLength(3, {
    message: 'El nombre del rol debe tener al menos 3 caracteres',
  })
  @MaxLength(80, {
    message: 'El nombre del rol no puede superar los 80 caracteres',
  })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(250, {
    message: 'La descripción no puede superar los 250 caracteres',
  })
  description?: string;

  @IsUUID('4', {
    message: 'El identificador de la empresa no es válido',
  })
  companyId: string;
}
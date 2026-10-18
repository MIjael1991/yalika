import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { cashierGrantablePermissions } from '../../auth/permissions';

export class CreateCashierDto {
  @IsString()
  @MinLength(2, { message: 'Escribe el nombre del cajero' })
  @MaxLength(100)
  name: string;

  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(180)
  email: string;

  @IsString()
  @MinLength(10, {
    message: 'La contraseña debe tener al menos 10 caracteres',
  })
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(128)
  confirmPassword: string;
}

export class ResetCashierPasswordDto {
  @IsString()
  @MinLength(10, {
    message: 'La contraseña debe tener al menos 10 caracteres',
  })
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(128)
  confirmPassword: string;
}

export class SetCashierStatusDto {
  @IsIn(['active', 'inactive'], {
    message: 'El estado debe ser active o inactive',
  })
  status: 'active' | 'inactive';
}

export class SetCashierPermissionsDto {
  @IsArray()
  @ArrayMaxSize(cashierGrantablePermissions.length)
  @IsIn(cashierGrantablePermissions, {
    each: true,
    message: 'Alguno de los permisos no existe',
  })
  permissions: string[];
}

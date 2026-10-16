import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  token?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  recoveryKey?: string;

  @IsString()
  @MinLength(10, {
    message: 'La nueva contraseña debe tener al menos 10 caracteres',
  })
  @MaxLength(128)
  newPassword: string;

  @IsString()
  @MaxLength(128)
  confirmPassword: string;
}

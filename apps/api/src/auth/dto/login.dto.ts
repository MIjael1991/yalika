import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail(
    {},
    {
      message: 'Escribe un correo válido',
    },
  )
  @MaxLength(200)
  email: string;

  @IsString()
  @MinLength(10, {
    message: 'La contraseña debe tener al menos 10 caracteres',
  })
  @MaxLength(200)
  password: string;
}

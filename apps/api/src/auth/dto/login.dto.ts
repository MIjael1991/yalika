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

  // El login acepta credenciales existentes; la regla de 10 caracteres se aplica
  // sólo al crear/cambiar/restablecer contraseñas. Esto permite migrar cuentas
  // antiguas sin bloquearlas antes de verificar su credencial.
  @IsString()
  @MinLength(1, {
    message: 'Escribe tu contraseña',
  })
  @MaxLength(200)
  password: string;
}

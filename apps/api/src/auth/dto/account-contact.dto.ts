import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

/** Teléfono para recuperar la cuenta (10 dígitos de México, con o sin +52). */
export class RecoveryPhoneDto {
  @IsString()
  @Matches(/^(\+?52)?[\s-]*\d(?:[\s-]*\d){9}$/, {
    message: 'Escribe un celular de 10 dígitos',
  })
  phone: string;

  @IsString()
  @MaxLength(200)
  currentPassword: string;
}

export class ChangeEmailDto {
  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(180)
  newEmail: string;

  @IsString()
  @MaxLength(200)
  currentPassword: string;
}

export class CurrentPasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;
}

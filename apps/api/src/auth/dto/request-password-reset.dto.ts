import { IsEmail, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(200)
  email: string;
}

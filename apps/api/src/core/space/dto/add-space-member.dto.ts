import { IsEmail, IsIn, MaxLength } from 'class-validator';

export class AddSpaceMemberDto {
  @IsEmail(
    {},
    {
      message: 'El correo de la persona no es válido',
    },
  )
  @MaxLength(200)
  email: string;

  @IsIn(['admin', 'member', 'viewer'], {
    message: 'El permiso del integrante no es válido',
  })
  role: string;
}

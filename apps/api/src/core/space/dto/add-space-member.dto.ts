import { IsEmail, IsIn, IsUUID, MaxLength } from 'class-validator';

export class AddSpaceMemberDto {
  @IsUUID('4', {
    message: 'El identificador de quien invita no es válido',
  })
  actorUserId: string;

  @IsEmail({}, {
    message: 'El correo de la persona no es válido',
  })
  @MaxLength(200)
  email: string;

  @IsIn(['admin', 'member', 'viewer'], {
    message: 'El permiso del integrante no es válido',
  })
  role: string;
}

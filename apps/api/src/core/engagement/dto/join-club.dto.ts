import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class JoinClubDto {
  @IsString()
  @IsNotEmpty({
    message: 'Escribe tu nombre',
  })
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty({
    message: 'Escribe tu teléfono',
  })
  @MinLength(7, {
    message: 'El teléfono está incompleto',
  })
  @MaxLength(30)
  phone: string;
}

import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @IsString({
    message: 'El nombre de la empresa debe ser texto',
  })
  @IsNotEmpty({
    message: 'El nombre de la empresa es obligatorio',
  })
  @MinLength(3, {
    message: 'El nombre debe tener al menos 3 caracteres',
  })
  @MaxLength(120, {
    message: 'El nombre no puede superar los 120 caracteres',
  })
  name: string;
}

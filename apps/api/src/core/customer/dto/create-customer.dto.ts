import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty({
    message: 'El nombre del cliente es obligatorio',
  })
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty({
    message: 'El teléfono del cliente es obligatorio',
  })
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsEmail(
    {},
    {
      message: 'El correo electrónico no es válido',
    },
  )
  email?: string;

  @IsUUID('4', {
    message: 'El identificador de la empresa no es válido',
  })
  companyId: string;
}
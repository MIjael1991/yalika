import {
  Equals,
  IsBoolean,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  organizationName: string;

  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(128)
  confirmPassword: string;

  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar los términos para crear tu cuenta.' })
  acceptTerms: boolean;
}

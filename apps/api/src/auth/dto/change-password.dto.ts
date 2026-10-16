import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(10, {
    message: 'La nueva contraseña debe tener al menos 10 caracteres',
  })
  @MaxLength(128)
  newPassword: string;

  @IsString()
  @MaxLength(128)
  confirmPassword: string;

  @IsOptional()
  @IsBoolean()
  closeOtherSessions?: boolean;
}

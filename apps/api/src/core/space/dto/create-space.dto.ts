import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateSpaceDto {
  @IsString()
  @IsNotEmpty({
    message: 'El nombre del espacio es obligatorio',
  })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(['personal', 'family', 'business', 'school'], {
    message: 'El tipo de espacio no es válido',
  })
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsUUID('4', {
    message: 'El identificador de la empresa no es válido',
  })
  companyId: string;

  @IsUUID('4', {
    message: 'El identificador del propietario no es válido',
  })
  ownerUserId: string;
}

import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
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

}

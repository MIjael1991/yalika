import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class InterpretCaptureDto {
  @IsString()
  @IsNotEmpty({
    message: 'Escribe o dicta algo para que ORION pueda organizarlo',
  })
  @MaxLength(500)
  message: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'El espacio activo no es válido',
  })
  activeSpaceId?: string;
}

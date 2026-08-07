import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateIncidentDto {
  @IsString()
  @IsNotEmpty({
    message: 'El título del incidente es obligatorio',
  })
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsUUID('4', {
    message: 'El identificador de la empresa no es válido',
  })
  companyId: string;
}
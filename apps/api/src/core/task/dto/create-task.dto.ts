import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty({
    message: 'El título de la tarea es obligatorio',
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
  priority?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: 'La fecha de la tarea no es válida',
    },
  )
  dueAt?: string;

  @IsUUID('4', {
    message: 'El identificador de la empresa no es válido',
  })
  companyId: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'El identificador del usuario no es válido',
  })
  userId?: string;
}
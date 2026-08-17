import {
  IsDateString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  priority?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: 'La fecha de la tarea no es válida',
    },
  )
  dueAt?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  estimatedMinutes?: number;

  @IsUUID('4', {
    message: 'El identificador de la empresa no es válido',
  })
  companyId: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'El identificador del usuario no es válido',
  })
  userId?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'El identificador del espacio no es válido',
  })
  spaceId?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'El identificador de quien crea la tarea no es válido',
  })
  createdById?: string;
}

import {
  IsBoolean,
  IsDateString,
  IsIn,
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
  @IsIn(['daily', 'weekly', 'monthly', 'yearly'], {
    message: 'La frecuencia debe ser diaria, semanal, mensual o anual',
  })
  recurrenceFrequency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  recurrenceInterval?: number;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: 'La fecha final de repetición no es válida',
    },
  )
  recurrenceEndsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  reminderMinutesBefore?: number;

  @IsOptional()
  @IsBoolean()
  allowSimilar?: boolean;
}

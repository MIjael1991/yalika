import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CompleteTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AddTaskNoteDto {
  @IsString()
  @IsNotEmpty({
    message: 'Escribe el dato que deseas agregar',
  })
  @MaxLength(500)
  note: string;
}

export class PostponeTaskDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(10080)
  minutes?: number;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: 'La nueva fecha de la tarea no es válida',
    },
  )
  until?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

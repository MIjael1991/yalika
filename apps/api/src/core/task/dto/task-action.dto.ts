import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class TaskActorDto {
  @IsUUID('4', {
    message: 'El identificador de la persona no es válido',
  })
  actorUserId: string;
}

export class CompleteTaskDto {
  @IsOptional()
  @IsUUID('4', {
    message: 'El identificador de la persona no es válido',
  })
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PostponeTaskDto extends TaskActorDto {
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

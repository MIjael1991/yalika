import { IsDateString } from 'class-validator';

export class TaskAgendaQueryDto {
  @IsDateString(
    {},
    {
      message: 'La fecha inicial de la agenda no es válida',
    },
  )
  from: string;

  @IsDateString(
    {},
    {
      message: 'La fecha final de la agenda no es válida',
    },
  )
  to: string;
}

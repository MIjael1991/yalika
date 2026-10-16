import { IsInt, Max, Min } from 'class-validator';

export class ExtendReservationDto {
  @IsInt()
  @Min(1)
  @Max(30)
  days: number;
}

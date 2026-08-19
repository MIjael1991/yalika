import { IsInt, Max, Min } from 'class-validator';

export class SnoozeReminderDto {
  @IsInt()
  @Min(5)
  @Max(10080)
  minutes: number;
}

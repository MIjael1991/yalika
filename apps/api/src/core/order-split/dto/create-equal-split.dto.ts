import { IsInt, Max, Min } from 'class-validator';

export class CreateEqualSplitDto {
  @IsInt()
  @Min(2)
  @Max(50)
  parts: number;
}

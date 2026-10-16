import { IsNumber, Min } from 'class-validator';

export class ConsumeRecipeDto {
  @IsNumber()
  @Min(0.001)
  quantitySold: number;
}

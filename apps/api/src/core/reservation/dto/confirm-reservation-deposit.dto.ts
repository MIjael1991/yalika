import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ConfirmReservationDepositDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsIn(['cash', 'card', 'transfer', 'other'])
  method: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

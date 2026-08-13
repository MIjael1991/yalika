import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @IsIn([
    'cash',
    'card',
    'transfer',
    'other',
  ])
  method: string;

  /*
   * Si no mandamos amount,
   * ORION cobrará todo lo que falte.
   *
   * Esto permite:
   *
   * Cobrar todo:
   * { method: "cash" }
   *
   * Pago dividido:
   * { method: "card", amount: 300 }
   */
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  /*
   * Solo es necesario para saber
   * cuánto efectivo entregó el cliente
   * y calcular el cambio.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  receivedAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
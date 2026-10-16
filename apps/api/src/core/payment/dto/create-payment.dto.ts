import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @IsIn(['cash', 'card', 'transfer', 'other'])
  method: string;

  /*
   * Si no mandamos amount,
   * Yalika cobrará todo lo que falte.
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
   * Cuando la orden tiene una cuenta dividida,
   * cada pago debe identificar la parte que cubre.
   */
  @IsOptional()
  @IsUUID('4')
  orderSplitId?: string;

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

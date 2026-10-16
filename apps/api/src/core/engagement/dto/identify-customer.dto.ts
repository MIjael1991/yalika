import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class IdentifyCustomerDto {
  @IsString()
  @MinLength(7, {
    message: 'El teléfono está incompleto',
  })
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

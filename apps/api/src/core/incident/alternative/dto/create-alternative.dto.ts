import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAlternativeDto {
  @IsString()
  @IsNotEmpty({
    message: 'El título de la alternativa es obligatorio',
  })
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedLoss?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  continuityScore?: number;

  @IsOptional()
  @IsString()
  impact?: string;

  @IsUUID('4', {
    message: 'El identificador del incidente no es válido',
  })
  incidentId: string;
}

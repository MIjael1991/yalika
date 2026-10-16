import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class VerifyWorkflowResultDto {
  @IsUUID('4')
  taskId: string;

  @IsBoolean()
  success: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extraCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedLoss?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  customersAffected?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

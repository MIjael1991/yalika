import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateVisitDto {
  @IsUUID('4')
  customerId: string;

  @IsUUID('4')
  companyId: string;

  @IsOptional()
  @IsUUID('4')
  loyaltyProgramId?: string;

  @IsOptional()
  @IsIn([
    'manual',
    'qr',
    'order',
    'purchase',
    'appointment',
  ])
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
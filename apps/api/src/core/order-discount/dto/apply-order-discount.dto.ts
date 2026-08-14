import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ApplyOrderDiscountDto {
  @IsUUID('4')
  companyId: string;

  @IsUUID('4')
  authorizedById: string;

  @IsIn(['order', 'item'])
  scope: string;

  @IsOptional()
  @IsUUID('4')
  orderItemId?: string;

  @IsIn(['manual', 'promotion', 'vip', 'table', 'loyalty', 'system'])
  source: string;

  @IsOptional()
  @IsIn(['percentage', 'fixed', 'special_price'])
  type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsUUID('4')
  promotionId?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'reason no puede contener solo espacios' })
  @MaxLength(180)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsUUID('4')
  operationId?: string;
}

import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class VoidOrderDiscountDto {
  @IsUUID('4')
  companyId: string;

  @IsUUID('4')
  voidedById: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'reason no puede contener solo espacios' })
  @MaxLength(300)
  reason: string;
}

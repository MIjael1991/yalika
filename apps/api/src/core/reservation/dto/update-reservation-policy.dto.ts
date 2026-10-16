import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  Max,
  Min,
} from 'class-validator';

export class UpdateReservationPolicyDto {
  @IsBoolean()
  enabled: boolean;

  @IsBoolean()
  depositRequired: boolean;

  @IsIn(['fixed', 'percentage'])
  depositType: string;

  @IsNumber()
  @Min(0)
  depositValue: number;

  @IsInt()
  @Min(5)
  @Max(1440)
  holdMinutes: number;

  @IsInt()
  @Min(1)
  @Max(90)
  activeDays: number;
}

import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsInt,
} from 'class-validator';

export class SavePlaceDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  address!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class RecordTripPlacesDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  tripId!: string;
}

export class UpdatePremiumPreferenceDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  @IsBoolean()
  rememberFrequentPlaces?: boolean;

  @IsOptional()
  @IsBoolean()
  showPremiumUi?: boolean;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  homeLabel?: string;

  @IsOptional()
  @IsString()
  workLabel?: string;
}

export class UpdatePlaceDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class FrequentQueryDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

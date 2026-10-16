import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class UpdateDriverAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  brand!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsInt()
  @Min(1980)
  @Max(2100)
  year!: number;

  @IsString()
  @IsNotEmpty()
  color!: string;

  @IsString()
  @IsNotEmpty()
  plate!: string;
}

export class CreateTripDto {
  @IsString()
  @IsNotEmpty()
  passengerUserId!: string;

  @IsString()
  @IsNotEmpty()
  originAddress!: string;

  @IsLatitude()
  originLat!: number;

  @IsLongitude()
  originLng!: number;

  @IsString()
  @IsNotEmpty()
  destinationAddress!: string;

  @IsLatitude()
  destinationLat!: number;

  @IsLongitude()
  destinationLng!: number;

  @IsNumber()
  @IsPositive()
  passengerSuggestedFare!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsInt()
  @Min(1)
  @Max(180)
  etaMinutes!: number;
}

export class AcceptOfferDto {
  @IsString()
  @IsNotEmpty()
  passengerUserId!: string;
}

export class ArriveTripDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;
}

export class StartTripDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @Length(4, 4)
  safetyPin!: string;
}

export class CompleteTripDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  finalFare?: number;
}

export class CancelTripDto {
  @IsString()
  @IsIn(['PASSENGER', 'DRIVER', 'SYSTEM', 'ADMIN'])
  actorType!: string;

  @IsString()
  @IsNotEmpty()
  actorId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateTripLocationDto {
  @IsString()
  @IsIn(['PASSENGER', 'DRIVER'])
  actorType!: string;

  @IsString()
  @IsNotEmpty()
  actorId!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;
}

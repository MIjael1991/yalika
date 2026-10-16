import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateNegotiationPolicyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseFare?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perMinuteTarget?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumFare?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1)
  minimumAllowedRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.2)
  reasonableOfferRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1.5)
  fastMatchRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(2)
  maxDriverCounterRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  platformPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  freePickupKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  pickupPerKm?: number;
}

export class RouteEstimateDto {
  @IsLatitude()
  originLat!: number;

  @IsLongitude()
  originLng!: number;

  @IsLatitude()
  destinationLat!: number;

  @IsLongitude()
  destinationLng!: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'MODERATE', 'HEAVY'])
  trafficLevel?: string;
}

export class CreateNegotiationDto extends RouteEstimateDto {
  @IsString()
  @IsNotEmpty()
  passengerUserId!: string;

  @IsString()
  @IsNotEmpty()
  originAddress!: string;

  @IsString()
  @IsNotEmpty()
  destinationAddress!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  proposedFare?: number;

  @IsOptional()
  @IsString()
  clientRequestId?: string;
}

export class PassengerOfferDto {
  @IsString()
  @IsNotEmpty()
  passengerUserId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class DriverCounterDto {
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

  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AcceptProposalDto {
  @IsString()
  @IsNotEmpty()
  passengerUserId!: string;
}

export class CandidateSearchDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  radiusKm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class DriverAcceptDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsInt()
  @Min(1)
  @Max(180)
  etaMinutes!: number;

  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

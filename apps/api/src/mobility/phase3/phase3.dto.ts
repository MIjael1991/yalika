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
  Max,
  Min,
} from 'class-validator';

export class CreatePricingPolicyDto {
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
  perMinute?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumFare?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(40)
  platformPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(100)
  driverMinimumPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  maxSurgeMultiplier?: number;
}

export class CreateFareQuoteDto {
  @IsOptional()
  @IsString()
  passengerUserId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsLatitude()
  originLat!: number;

  @IsLongitude()
  originLng!: number;

  @IsLatitude()
  destinationLat!: number;

  @IsLongitude()
  destinationLng!: number;

  @IsNumber()
  @IsPositive()
  estimatedKm!: number;

  @IsInt()
  @Min(1)
  estimatedMinutes!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  competitorReference?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  demandMultiplier?: number;
}

export class CreditTripEarningsDto {
  @IsString()
  @IsNotEmpty()
  tripId!: string;

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsNumber()
  @IsPositive()
  fare!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(40)
  platformPercent?: number;
}

export class CreateBonusCampaignDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  startsAt!: string;

  @IsString()
  @IsNotEmpty()
  endsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  minTrips?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPoints?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRewardsPerDriver?: number;

  @IsOptional()
  @IsString()
  city?: string;
}

export class DeviceHeartbeatDto {
  @IsIn(['PHONE', 'VEHICLE_GPS', 'WATCH', 'TABLET', 'OTHER'])
  deviceType!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPct?: number;

  @IsOptional()
  @IsString()
  networkType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  signalQuality?: number;

  @IsOptional()
  @IsIn(['FOREGROUND', 'BACKGROUND', 'SCREEN_OFF', 'UNKNOWN'])
  appState?: string;
}

export class CreateShareSessionDto {
  @IsString()
  @IsNotEmpty()
  ownerUserId!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  expiresInMinutes?: number;
}

export class OpportunityPreferenceDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  maxDetourKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumContribution?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  seats?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateServicePaymentPlanDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsIn(['WEEKLY', 'BIWEEKLY', 'MONTHLY'])
  cadence?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsBoolean()
  autoUseWallet?: boolean;
}

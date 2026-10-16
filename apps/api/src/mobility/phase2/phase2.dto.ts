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

export class AddLocationTraceDto {
  @IsString() @IsNotEmpty() actorType!: string;
  @IsString() @IsNotEmpty() actorId!: string;
  @IsOptional()
  @IsIn(['PHONE', 'VEHICLE_GPS', 'WEB', 'SYSTEM'])
  source?: string;
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  @IsOptional() @IsNumber() @Min(0) accuracyMeters?: number;
  @IsOptional() @IsNumber() @Min(0) speedKmh?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) batteryPct?: number;
  @IsOptional() @IsBoolean() isBackground?: boolean;
}

export class EvaluateCancellationDto {
  @IsString() @IsNotEmpty() requestedByType!: string;
  @IsString() @IsNotEmpty() requestedById!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsNumber() @Min(0) baseCancellationFee?: number;
}

export class TriggerSafetyIncidentDto {
  @IsOptional() @IsString() tripId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsIn([
    'SOS',
    'ROBBERY',
    'THREAT',
    'CRASH',
    'ROUTE_DEVIATION',
    'APP_SIGNAL_LOST',
    'TRACKER_ONLY',
    'OTHER',
  ])
  type!: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) severity?: string;
  @IsOptional()
  @IsIn(['APP', 'BUTTON', 'VOICE_CODE', 'WATCH', 'VEHICLE_GPS', 'SYSTEM'])
  triggerSource?: string;
  @IsOptional() @IsBoolean() silentMode?: boolean;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
  @IsOptional() @IsString() notes?: string;
}

export class ResolveSafetyIncidentDto {
  @IsOptional() @IsString() notes?: string;
}

export class CreateTrustedContactDto {
  @IsString() @IsNotEmpty() ownerUserId!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsOptional() @IsInt() @Min(1) @Max(10) priority?: number;
  @IsOptional() @IsBoolean() notifyOnTrip?: boolean;
  @IsOptional() @IsBoolean() notifyOnEmergency?: boolean;
}

export class CreateTrackerDto {
  @IsString() @IsNotEmpty() driverId!: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsString() @IsNotEmpty() deviceLabel!: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() deviceUid?: string;
  @IsOptional() @IsNumber() @Min(0) monthlyCost?: number;
}

export class TrackerPingDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
}

export class CreateLostItemDto {
  @IsString() @IsNotEmpty() tripId!: string;
  @IsString() @IsNotEmpty() passengerUserId!: string;
  @IsString() @IsNotEmpty() description!: string;
  @IsOptional() @IsString() lastKnownPlace?: string;
}

export class CreateScheduledRouteDto {
  @IsString() @IsNotEmpty() userId!: string;
  @IsString() @IsNotEmpty() originAddress!: string;
  @IsLatitude() originLat!: number;
  @IsLongitude() originLng!: number;
  @IsString() @IsNotEmpty() destinationAddress!: string;
  @IsLatitude() destinationLat!: number;
  @IsLongitude() destinationLng!: number;
  @IsString() @IsNotEmpty() departureAt!: string;
  @IsOptional() @IsInt() @Min(1) @Max(8) seatsAvailable?: number;
  @IsOptional() @IsNumber() @IsPositive() suggestedContribution?: number;
  @IsOptional() @IsString() notes?: string;
}

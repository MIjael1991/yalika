import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateReferralCampaignDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsIn(['PASSENGER', 'DRIVER', 'BOTH'])
  appliesTo?: string;

  @IsString()
  @IsNotEmpty()
  startsAt!: string;

  @IsString()
  @IsNotEmpty()
  endsAt!: string;

  @IsOptional()
  @IsIn(['PROMO_CREDIT', 'COMMISSION_FREE_TRIPS', 'NONE'])
  inviterRewardType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  inviterRewardAmount?: number;

  @IsOptional()
  @IsIn(['PROMO_CREDIT', 'COMMISSION_FREE_TRIPS', 'NONE'])
  invitedRewardType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  invitedRewardAmount?: number;

  @IsOptional()
  @IsIn(['FIRST_COMPLETED_TRIP', 'COMPLETED_TRIPS', 'DRIVER_VERIFIED'])
  qualificationType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  qualificationCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxRewardsPerInviter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minQualifyingFare?: number;
}

export class CreateReferralCodeDto {
  @IsString()
  @IsNotEmpty()
  campaignId!: string;

  @IsString()
  @IsNotEmpty()
  ownerUserId!: string;

  @IsOptional()
  @IsString()
  ownerDriverId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxUses?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class RedeemReferralDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  referredUserId!: string;

  @IsIn(['PASSENGER', 'DRIVER'])
  referredRole!: string;
}

export class EvaluateReferralDto {
  @IsString()
  @IsNotEmpty()
  attributionId!: string;
}

export class UpsertVerificationProfileDto {
  @IsIn(['PASSENGER', 'DRIVER'])
  subjectType!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class VerifyPhoneDto {
  @IsBoolean()
  verified!: boolean;

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class ReviewIdentityDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: string;

  @IsString()
  @IsNotEmpty()
  reviewedBy!: string;

  @IsOptional()
  @IsBoolean()
  selfieVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  documentVerified?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpsertVehicleComplianceDto {
  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @IsIn(['PRIVATE', 'TAXI'])
  serviceType!: string;

  @IsOptional()
  @IsString()
  taxiPermitNumber?: string;

  @IsOptional()
  @IsString()
  taxiConcessionRef?: string;

  @IsOptional()
  @IsString()
  permitExpiresAt?: string;

  @IsOptional()
  @IsString()
  insuranceExpiresAt?: string;
}

export class ReviewVehicleComplianceDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: string;

  @IsString()
  @IsNotEmpty()
  reviewedBy!: string;

  @IsOptional()
  @IsIn(['APPROVED', 'REJECTED', 'PENDING'])
  inspectionStatus?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class CheckTripPinDto {
  @IsString()
  @Length(4, 4)
  safetyPin!: string;

  @IsOptional()
  @IsString()
  passengerUserId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;
}

export class CreateSafeRideDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  passengerUserId?: string;

  @IsString()
  @IsNotEmpty()
  originAddress!: string;

  @IsOptional()
  @IsLatitude()
  originLat?: number;

  @IsOptional()
  @IsLongitude()
  originLng?: number;

  @IsString()
  @IsNotEmpty()
  destinationAddress!: string;

  @IsOptional()
  @IsLatitude()
  destinationLat?: number;

  @IsOptional()
  @IsLongitude()
  destinationLng?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StartSafeRideDto {
  @IsString()
  @Length(4, 4)
  safetyPin!: string;
}

export class SafeRideLocationDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  @IsOptional()
  @IsIn(['PHONE', 'VEHICLE_GPS', 'WATCH'])
  source?: string;

  @IsOptional()
  @IsBoolean()
  isBackground?: boolean;
}

export class CreateSafeRideShareDto {
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  expiresInMinutes?: number;
}

export class CreateSafeRideIncidentDto {
  @IsIn(['SOS', 'ROBBERY_THREAT', 'CRASH', 'MEDICAL', 'OTHER'])
  type!: string;

  @IsOptional()
  @IsIn(['MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: string;

  @IsOptional()
  @IsBoolean()
  silentMode?: boolean;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

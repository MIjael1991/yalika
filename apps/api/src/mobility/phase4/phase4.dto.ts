import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateRatingDto {
  @IsString()
  @IsNotEmpty()
  authorType!: string;

  @IsString()
  @IsNotEmpty()
  authorId!: string;

  @IsString()
  @IsNotEmpty()
  targetType!: string;

  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateSupportCaseDto {
  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class ResolveSupportCaseDto {
  @IsString()
  @IsNotEmpty()
  resolution!: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}

export class CreateDriverDocumentDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsIn([
    'DRIVER_LICENSE',
    'VEHICLE_REGISTRATION',
    'INSURANCE',
    'IDENTITY',
    'BACKGROUND_CHECK',
    'OTHER',
  ])
  type!: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  fileRef?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class ReviewDriverDocumentDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: string;

  @IsString()
  @IsNotEmpty()
  reviewedBy!: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class SettleCancellationDto {
  @IsString()
  @IsNotEmpty()
  settledBy!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passengerChargeAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  driverCompensationAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  platformAmount?: number;
}

export class QueueNotificationDto {
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsIn(['PUSH', 'SMS', 'EMAIL', 'IN_APP', 'VOICE'])
  channel!: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsString()
  @IsNotEmpty()
  template!: string;
}

export class MarkNotificationDto {
  @IsIn(['SENT', 'FAILED'])
  status!: string;

  @IsOptional()
  @IsString()
  error?: string;
}

export class EscalateSafetyDto {
  @IsIn([
    'TRUSTED_CONTACT',
    'OPERATOR_REVIEW',
    'EMERGENCY_SERVICE',
    'VEHICLE_TRACKING',
    'FOLLOW_UP',
  ])
  step!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePrivacyPolicyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  locationRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  heartbeatRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3650)
  incidentRetentionDays?: number;

  @IsOptional()
  @IsString()
  preciseLocationPurpose?: string;
}

export class PrivacyCleanupDto {
  @IsBoolean()
  confirm!: boolean;
}

export class CreatePayoutDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  periodStart!: string;

  @IsString()
  @IsNotEmpty()
  periodEnd!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

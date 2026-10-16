import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateExperiencePreferenceDto {
  @IsString()
  @IsNotEmpty()
  subjectType!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  voiceEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  spokenConfirmations?: boolean;

  @IsOptional()
  @IsIn(['ECONOMY', 'BALANCED', 'FAST'])
  fareMode?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  searchRadiusKm?: number;

  @IsOptional()
  @IsBoolean()
  simpleMode?: boolean;

  @IsOptional()
  @IsBoolean()
  largeControls?: boolean;

  @IsOptional()
  @IsBoolean()
  reduceMotion?: boolean;
}

export class QuickRideRequestDto {
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

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'MODERATE', 'HEAVY'])
  trafficLevel?: string;

  @IsOptional()
  @IsIn(['ECONOMY', 'BALANCED', 'FAST'])
  mode?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  proposedFare?: number;

  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsBoolean()
  createdByVoice?: boolean;
}

export class VoiceInterpretDto {
  @IsString()
  @IsNotEmpty()
  subjectType!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  text!: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsString()
  proposalId?: string;

  @IsOptional()
  @IsString()
  passengerUserId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  etaMinutes?: number;

  @IsOptional()
  @IsString()
  originAddress?: string;

  @IsOptional()
  @IsLatitude()
  originLat?: number;

  @IsOptional()
  @IsLongitude()
  originLng?: number;

  @IsOptional()
  @IsString()
  destinationAddress?: string;

  @IsOptional()
  @IsLatitude()
  destinationLat?: number;

  @IsOptional()
  @IsLongitude()
  destinationLng?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'MODERATE', 'HEAVY'])
  trafficLevel?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class ConfirmVoiceCommandDto {
  @IsBoolean()
  confirm!: boolean;
}

import {
  ArrayMaxSize,
  IsDateString,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  MAX_JOB_MINUTES,
  MAX_PRICE_MXN,
  MAX_REQUEST_PHOTOS,
  MAX_TRADES,
  MAX_TRADES_PER_REQUEST,
  MIN_PRICE_MXN,
  PHOTO_KINDS,
  PRESENTE_DOCUMENT_KINDS,
  PRESENTE_TRADES,
  RADIUS_OPTIONS,
  REQUEST_URGENCIES,
} from '../presente.constants';

export class SaveProviderProfileDto {
  @IsString() @MinLength(2) @MaxLength(80) displayName!: string;

  /** Puede ir vacío si solo ofrece profesiones con cédula (se agregan al aprobarse). */
  @IsArray()
  @ArrayMaxSize(MAX_TRADES)
  @IsIn(PRESENTE_TRADES, { each: true })
  trades!: string[];

  @IsString() @Matches(/^\d{5}$/) municipalityCode!: string;

  @IsOptional() @IsString() @MaxLength(120) zoneLabel?: string;

  @IsOptional() @IsString() @MaxLength(500) bio?: string;

  @IsOptional() @IsIn(RADIUS_OPTIONS) radiusKm?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  availableDays!: number[];

  @IsBoolean() allDay!: boolean;

  @IsOptional() @IsString() @Matches(/^\d{2}:\d{2}$/) fromTime?: string;

  @IsOptional() @IsString() @Matches(/^\d{2}:\d{2}$/) toTime?: string;

  @IsOptional() @IsString() @MinLength(18) @MaxLength(20) curp?: string;

  /** Negocio (verdulería, carnicería, distribuidora...) y su nombre comercial. */
  @IsOptional() @IsBoolean() isBusiness?: boolean;
  @IsOptional() @IsString() @MaxLength(80) businessName?: string;
  /** Lleva a domicilio. */
  @IsOptional() @IsBoolean() delivers?: boolean;
  /** También da clases de lo que sabe hacer. */
  @IsOptional() @IsBoolean() teaches?: boolean;
  /** Da factura (CFDI) a quien la pide. */
  @IsOptional() @IsBoolean() invoices?: boolean;
  /** Código de quien lo recomendó (solo al registrarse). */
  @IsOptional() @IsString() @MaxLength(20) referralCode?: string;
}

export class UploadProviderDocumentDto {
  @IsIn(PRESENTE_DOCUMENT_KINDS) kind!: string;
  // ~1.6 MB en base64 más el encabezado data:...
  @IsString() @MaxLength(2_300_000) dataUrl!: string;
}

export class BiometricConsentDto {
  @IsBoolean() accepted!: boolean;
}

export class SetPresenceDto {
  @IsBoolean() present!: boolean;
}

export class ReviewDecisionDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class WalletTopupDto {
  @IsString() @MaxLength(20) code!: string;
  @IsInt() @Min(1) @Max(100_000) amountMxn!: number;
  @IsString() @MaxLength(60) reference!: string;
}

export class SuspendProviderDto {
  @IsString() @MinLength(3) @MaxLength(300) note!: string;
}

export class CreateHelpRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TRADES_PER_REQUEST)
  @IsIn(PRESENTE_TRADES, { each: true })
  trades!: string[];

  @IsString() @MinLength(5) @MaxLength(600) description!: string;
  @ValidateIf((dto: CreateHelpRequestDto) => !dto.placeId)
  @IsString()
  @Matches(/^\d{5}$/)
  municipalityCode?: string;
  @IsOptional() @IsString() @MaxLength(160) addressHint?: string;
  /** Lugar guardado (Casa, Casa de mamá...). Si viene, de ahí salen el punto y la referencia. */
  @IsOptional() @IsUUID() placeId?: string;
  @ValidateIf((dto: CreateHelpRequestDto) => !dto.placeId)
  @IsLatitude()
  lat?: number;
  @ValidateIf((dto: CreateHelpRequestDto) => !dto.placeId)
  @IsLongitude()
  lng?: number;
  @IsIn(REQUEST_URGENCIES) urgency!: string;
  @IsOptional() @IsString() @MaxLength(2_300_000) photoDataUrl?: string;
  /** Hasta 3 fotos del problema (la llanta, la chapa, la fuga). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REQUEST_PHOTOS)
  @IsString({ each: true })
  @MaxLength(2_300_000, { each: true })
  photoDataUrls?: string[];
  /** Pedir directo a un trabajador de confianza (solo él lo verá). */
  @IsOptional() @IsUUID() providerId?: string;
  /** Día y hora deseados (ISO). */
  @IsOptional() @IsISO8601() scheduledFor?: string;
  /** Pedido anterior del que este es seguimiento. */
  @IsOptional() @IsUUID() followUpOfId?: string;
  /** Necesita factura: el precio lleva IVA aparte y solo cotizan quienes facturan. */
  @IsOptional() @IsBoolean() needsInvoice?: boolean;
}

export class FavoriteDto {
  @IsUUID() providerId!: string;
}

export class FollowUpProposalDto {
  @IsISO8601() scheduledFor!: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class ChooseQuoteDto {
  @IsString() @MinLength(10) @MaxLength(64) quoteId!: string;
}

const PRICE_MESSAGE = {
  message: `El precio mínimo de un servicio es de $${MIN_PRICE_MXN}`,
};
const DURATION_MESSAGE = {
  message:
    'Los servicios de Tequio son del mismo día: máximo 12 horas de trabajo',
};

export class SendQuoteDto {
  @IsInt()
  @Min(MIN_PRICE_MXN, PRICE_MESSAGE)
  @Max(MAX_PRICE_MXN)
  amountMxn!: number;
  /** Minutos para llegar. */
  @IsInt() @Min(5) @Max(10_080) etaMinutes!: number;
  /** Minutos que tarda el trabajo una vez que llega (el mismo día). */
  @IsInt()
  @Min(5)
  @Max(MAX_JOB_MINUTES, DURATION_MESSAGE)
  durationMinutes!: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  /** Cita: otra hora que propone en vez de la que le pidieron. */
  @IsOptional() @IsDateString() proposedFor?: string;
}

export class FinishJobDto {
  /** Precio real si cambió (por ejemplo, salió más trabajo). Si no, el del presupuesto. */
  @IsOptional()
  @IsInt()
  @Min(MIN_PRICE_MXN, PRICE_MESSAGE)
  @Max(MAX_PRICE_MXN)
  finalAmountMxn?: number;
}

export class ReportProblemDto {
  @IsString() @MinLength(5) @MaxLength(500) note!: string;
}

export class CloseProblemDto {
  /** true: se da por terminado y se cobra la comisión. false: se cierra sin comisión. */
  @IsBoolean() charge!: boolean;
  @IsString() @MinLength(3) @MaxLength(300) note!: string;
}

export class SearchProvidersDto {
  @IsIn(PRESENTE_TRADES) trade!: string;
  @IsString() @Matches(/^\d{5}$/) municipalityCode!: string;
}

export class SaveClientProfileDto {
  @IsString() @MinLength(2) @MaxLength(80) displayName!: string;
  @IsOptional() @IsLatitude() homeLat?: number;
  @IsOptional() @IsLongitude() homeLng?: number;
  @IsOptional() @IsString() @MaxLength(160) homeReference?: string;
}

/** Un lugar guardado: calle, número, punto exacto en el mapa y referencia. */
export class PlaceDto {
  @IsString() @MinLength(2) @MaxLength(40) label!: string;
  @IsString() @MinLength(3) @MaxLength(120) street!: string;
  @IsOptional() @IsString() @MaxLength(20) number?: string;
  @IsOptional() @IsString() @MaxLength(80) neighborhood?: string;
  @IsString() @Matches(/^\d{5}$/) municipalityCode!: string;
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
}

/** Cédula profesional: número, foto del título o la cédula y selfie con ella en mano. */
const SEP_PROOF_MISSING =
  'Sube tu comprobante de la SEP (constancia en PDF o captura de la consulta)';
const SEP_PROOF_TOO_BIG = 'El comprobante de la SEP pesa más de 3 MB';

export class CredentialDto {
  @IsIn(PRESENTE_TRADES) trade!: string;
  @IsString()
  @Matches(/^\d{5,10}$/, {
    message: 'Escribe el número de tu cédula profesional (solo números)',
  })
  licenseNumber!: string;
  @IsString() @MaxLength(2_300_000) titlePhoto!: string;
  @IsString() @MaxLength(2_300_000) selfiePhoto!: string;
  /** Constancia de la SEP (PDF) o captura de la consulta (foto). */
  @IsString({ message: SEP_PROOF_MISSING })
  @MaxLength(4_200_000, { message: SEP_PROOF_TOO_BIG })
  sepProof!: string;
}

/** Subir o cambiar el comprobante de la SEP de una cédula ya mandada. */
export class SepProofDto {
  @IsString({ message: SEP_PROOF_MISSING })
  @MaxLength(4_200_000, { message: SEP_PROOF_TOO_BIG })
  file!: string;
}

export class PhotoUploadDto {
  @IsString() @MaxLength(2_300_000) dataUrl!: string;
}

export class ProviderPhotoDto {
  @IsIn(PHOTO_KINDS) kind!: string;
  @IsString() @MaxLength(2_300_000) dataUrl!: string;
  @IsOptional() @IsString() @MaxLength(120) caption?: string;
}

export class EnRouteDto {
  @IsInt() @Min(1) @Max(1440) etaMinutes!: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class LocationDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
}

export class ArriveDto {
  @IsString() @Matches(/^\d{4}$/) pin!: string;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
}

export class StartJobDto {
  /** Minutos que tardará (el mismo día). */
  @IsInt()
  @Min(5)
  @Max(MAX_JOB_MINUTES, DURATION_MESSAGE)
  estimatedMinutes!: number;
}

export class CancelJobDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class MessageDto {
  @IsString() @MinLength(1) @MaxLength(1000) body!: string;
}

export class ReviewDto {
  @IsInt() @Min(1) @Max(5) stars!: number;
  @IsOptional() @IsString() @MaxLength(300) comment?: string;
}

export class SiteChoiceDto {
  /** null quita la página del perfil. */
  @IsOptional() @IsUUID() siteId?: string | null;
}

/** Avisos al celular: la dirección que da el navegador al activar los avisos. */
export class PushSubscriptionDto {
  @IsString() @MaxLength(1000) endpoint!: string;
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}

export class PushEndpointDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

/** Datos del cliente para factura (CFDI). */
export class FiscalDataDto {
  @IsString() @MinLength(12) @MaxLength(14) rfc!: string;
  @IsString() @MinLength(2) @MaxLength(254) name!: string;
  @IsString() @Matches(/^\d{3}$/) regime!: string;
  @IsString() @Matches(/^\d{5}$/) zip!: string;
  @IsString() @Matches(/^[A-Z]\d{2}$/) use!: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
}

/** Factura que sube el profesional: PDF y XML en data URL. */
export class InvoiceUploadDto {
  @IsString() @MaxLength(4_200_000) pdf!: string;
  @IsString() @MaxLength(1_400_000) xml!: string;
}

/** Datos de conexión de una llamada (oferta o respuesta WebRTC, solo texto). */
export class CallSignalDto {
  @IsString() @MinLength(20) @MaxLength(20_000) sdp!: string;
}

/** Recarga con Mercado Pago: monto y desde dónde se abrió (para regresar ahí al pagar). */
export class OnlineTopupDto {
  @IsInt() amountMxn!: number;
  @IsOptional() @IsString() @MaxLength(100) origin?: string;
}

/** Grabación de una llamada (audio en data URL) y cuántos segundos duró. */
export class CallRecordingDto {
  @IsString() @MaxLength(5_700_000) audio!: string;
  @IsInt() @Min(0) @Max(3_600) seconds!: number;
}

/** Para abrir un registro sellado: número de oficio u orden de la autoridad. */
export class AuthorityRefDto {
  @IsString() @MinLength(4) @MaxLength(120) authorityRef!: string;
}

/** YALIKA Fase 10F — calculadora PURA de políticas, NO efectúa cobros ni cambia viajes. */
export type VehicleKind = 'CAR' | 'TAXI' | 'MOTORCYCLE';
export type TripState =
  | 'REQUESTED'
  | 'NEGOTIATING'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';
export type CancelActor = 'PASSENGER' | 'DRIVER' | 'STAFF';
export interface PilotPolicy {
  commissionBasisPoints: number;
  freeCancellationGraceSeconds: number;
  passengerNoShowWaitSeconds: number;
  arrivalRadiusMeters: number;
  maxGpsAccuracyMeters: number;
  driverLateToleranceSeconds: number;
  autoNoShowMaxCents: number;
  motorcycleNoShowMaxCents: number;
  noShowPercentBasisPoints: number;
  motorbikeServiceEnabled: boolean;
  passengerCancellationFeesEnabled: boolean;
  paymentCollectionEnabled: boolean;
}
/** Los porcentajes e importes son PROPUESTAS de piloto, NO precios publicados. */
export const PILOT_POLICY: Readonly<PilotPolicy> = Object.freeze({
  commissionBasisPoints: 500, // 5.00 %
  freeCancellationGraceSeconds: 120, // 2 min desde aceptación
  passengerNoShowWaitSeconds: 300, // 5 min desde llegada demostrada
  arrivalRadiusMeters: 150,
  maxGpsAccuracyMeters: 50,
  driverLateToleranceSeconds: 300, // 5 min adicionales respecto al ETA registrado
  autoNoShowMaxCents: 1500, // $15 MXN como máximo
  motorcycleNoShowMaxCents: 1000, // hipotético, moto deshabilitada
  noShowPercentBasisPoints: 2000, // no más de 20% de tarifa acordada
  motorbikeServiceEnabled: false, // bloqueo hasta autorización/seguro/requisitos
  passengerCancellationFeesEnabled: false, // no se cobran hasta aprobar política y aviso
  paymentCollectionEnabled: false, // no existe integración de cobro verificada
});
function cents(pesos: number): number {
  if (!Number.isFinite(pesos) || pesos < 0 || pesos > 1000000)
    throw new Error('Importe MXN inválido.');
  return Math.round((pesos + Number.EPSILON) * 100);
}
function toMoney(c: number): number {
  return Math.round(c) / 100;
}
function validInt(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}
export function commissionForCompletedTrip(
  fareMx: number,
  state: TripState,
  policy: PilotPolicy = PILOT_POLICY,
) {
  if (
    !validInt(policy.commissionBasisPoints) ||
    policy.commissionBasisPoints > 10000
  )
    throw new Error('Comisión inválida.');
  const fareCents = cents(fareMx);
  if (state !== 'COMPLETED')
    return {
      fare: toMoney(fareCents),
      ratePercent: policy.commissionBasisPoints / 100,
      platformFee: 0,
      driverGross: 0,
      status: 'NO_COMMISSION_NOT_COMPLETED' as const,
    };
  const platformCents = Math.round(
    (fareCents * policy.commissionBasisPoints) / 10000,
  );
  return {
    fare: toMoney(fareCents),
    ratePercent: policy.commissionBasisPoints / 100,
    platformFee: toMoney(platformCents),
    driverGross: toMoney(fareCents - platformCents),
    status: 'SIMULATION_ONLY' as const,
  };
}
export interface CancelFacts {
  state: TripState;
  actor: CancelActor;
  vehicleKind: VehicleKind;
  agreedFareMx: number;
  secondsSinceMatch: number;
  secondsSinceVerifiedArrival: number | null;
  distanceToPickupMeters: number | null;
  gpsAccuracyMeters: number | null;
  arrivalRecordedByServer: boolean;
  passengerNotified: boolean;
  etaExceededBySeconds: number;
  wrongVehicleOrDriver: boolean;
  safetyConcern: boolean;
  startedAtRecorded: boolean;
  authorizedPaymentMethod: boolean;
  passengerAcceptedCancellationTerms: boolean;
}
export type CancelDecision =
  | 'NO_FEE'
  | 'ELIGIBLE_AWAITING_REVIEW'
  | 'IN_PROGRESS_REVIEW'
  | 'ALREADY_FINISHED'
  | 'UNAVAILABLE_SERVICE';
export function evaluateCancellation(
  facts: CancelFacts,
  policy: PilotPolicy = PILOT_POLICY,
): {
  decision: CancelDecision;
  proposedPassengerFee: number;
  proposedDriverCompensation: number;
  proposedPlatformFee: 0;
  canCollectNow: false;
  reasons: string[];
} {
  const fare = cents(facts.agreedFareMx);
  const result = (
    decision: CancelDecision,
    feeCents: number,
    reasons: string[],
  ) => ({
    decision,
    proposedPassengerFee: toMoney(feeCents),
    proposedDriverCompensation: toMoney(feeCents),
    proposedPlatformFee: 0 as const,
    canCollectNow: false as const,
    reasons,
  });
  if (facts.vehicleKind === 'MOTORCYCLE' && !policy.motorbikeServiceEnabled)
    return result('UNAVAILABLE_SERVICE', 0, [
      'MOTO_DESHABILITADA_POR_SEGURIDAD_Y_REGULACION',
    ]);
  if (facts.state === 'COMPLETED' || facts.state === 'CANCELLED')
    return result('ALREADY_FINISHED', 0, ['ESTADO_CERRADO']);
  if (facts.state === 'IN_PROGRESS' || facts.startedAtRecorded)
    return result('IN_PROGRESS_REVIEW', 0, [
      'VIAJE_INICIADO_NO_ES_CANCELACION_DE_RECOGIDA',
      'REVISAR_FINALIZACION_O_INCIDENTE',
    ]);
  if (facts.actor === 'DRIVER')
    return result('NO_FEE', 0, [
      'CONDUCTOR_CANCELA_SIN_COMISION_NI_CARGO',
      'REASIGNAR_O_REEMBOLSAR_ANTICIPO',
    ]);
  if (facts.actor === 'STAFF')
    return result('NO_FEE', 0, ['REVISION_MANUAL_SIN_CARGO_AUTOMATICO']);
  if (facts.state === 'REQUESTED' || facts.state === 'NEGOTIATING')
    return result('NO_FEE', 0, ['SIN_CONDUCTOR_ASIGNADO']);
  if (facts.wrongVehicleOrDriver || facts.safetyConcern)
    return result('NO_FEE', 0, ['EXENCION_SEGURIDAD_O_IDENTIDAD']);
  if (facts.etaExceededBySeconds > policy.driverLateToleranceSeconds)
    return result('NO_FEE', 0, ['CONDUCTOR_TARDE_SEGUN_ETA_SERVIDOR']);
  if (
    !validInt(facts.secondsSinceMatch) ||
    facts.secondsSinceMatch <= policy.freeCancellationGraceSeconds
  )
    return result('NO_FEE', 0, ['VENTANA_GRATUITA']);
  if (
    facts.state !== 'DRIVER_ARRIVED' ||
    !facts.arrivalRecordedByServer ||
    !facts.passengerNotified
  )
    return result('NO_FEE', 0, ['LLEGADA_NO_VERIFICADA_O_SIN_AVISO']);
  if (
    facts.secondsSinceVerifiedArrival === null ||
    !validInt(facts.secondsSinceVerifiedArrival) ||
    facts.secondsSinceVerifiedArrival < policy.passengerNoShowWaitSeconds
  )
    return result('NO_FEE', 0, ['ESPERA_MINIMA_NO_CUMPLIDA']);
  if (
    facts.distanceToPickupMeters === null ||
    !Number.isFinite(facts.distanceToPickupMeters) ||
    facts.distanceToPickupMeters > policy.arrivalRadiusMeters ||
    facts.distanceToPickupMeters < 0
  )
    return result('NO_FEE', 0, ['FUERA_DEL_PUNTO_DE_RECOGIDA']);
  if (
    facts.gpsAccuracyMeters === null ||
    !Number.isFinite(facts.gpsAccuracyMeters) ||
    facts.gpsAccuracyMeters > policy.maxGpsAccuracyMeters ||
    facts.gpsAccuracyMeters < 0
  )
    return result('NO_FEE', 0, ['GPS_NO_CONFIABLE']);
  if (
    !facts.passengerAcceptedCancellationTerms ||
    !policy.passengerCancellationFeesEnabled
  )
    return result('NO_FEE', 0, ['POLITICA_NO_APROBADA_O_NO_ACEPTADA']);
  const maximum =
    facts.vehicleKind === 'MOTORCYCLE'
      ? policy.motorcycleNoShowMaxCents
      : policy.autoNoShowMaxCents;
  const feeCents = Math.min(
    maximum,
    Math.round((fare * policy.noShowPercentBasisPoints) / 10000),
  );
  if (feeCents === 0) return result('NO_FEE', 0, ['IMPORTE_CERO']);
  // Nunca crear cargos aquí, ni siquiera si hay medio de pago y flag activo.
  return result('ELIGIBLE_AWAITING_REVIEW', feeCents, [
    'COMPENSACION_PROPUESTA_NO_COBRADA',
    facts.authorizedPaymentMethod && policy.paymentCollectionEnabled
      ? 'REQUIERE_REVISION_Y_CAPTURA_SEPARADA'
      : 'SIN_COBRO_AUTOMATICO_HABILITADO',
  ]);
}
export interface TripAccess {
  passengerUserId: string;
  assignedDriverUserId: string | null; // desde BD, nunca del body
}
export interface TrustedActor {
  userId: string;
  isMobilityAdmin: boolean; // permiso acreditado desde servidor
}
export type TripAction =
  | 'READ'
  | 'PASSENGER_CANCEL'
  | 'DRIVER_CANCEL'
  | 'DRIVER_ARRIVE'
  | 'DRIVER_START'
  | 'DRIVER_COMPLETE'
  | 'STAFF_REVIEW';
export function mayActOnTrip(
  actor: TrustedActor,
  trip: TripAccess,
  action: TripAction,
): boolean {
  if (!actor.userId || !trip.passengerUserId) return false;
  if (action === 'STAFF_REVIEW') return actor.isMobilityAdmin === true;
  if (actor.isMobilityAdmin && action === 'READ') return true;
  if (action === 'READ')
    return (
      actor.userId === trip.passengerUserId ||
      actor.userId === trip.assignedDriverUserId
    );
  if (action === 'PASSENGER_CANCEL')
    return actor.userId === trip.passengerUserId;
  if (action.startsWith('DRIVER_'))
    return (
      trip.assignedDriverUserId !== null &&
      actor.userId === trip.assignedDriverUserId
    );
  return false;
}
export function proposeCounteroffer(
  originalMx: number,
  proposedMx: number,
  approvedByPassenger: boolean,
) {
  const original = toMoney(cents(originalMx));
  const proposed = toMoney(cents(proposedMx));
  if (original <= 0 || proposed <= 0)
    throw new Error('La oferta debe ser mayor que cero.');
  return {
    passengerOffer: original,
    driverCounteroffer: proposed,
    agreedFare: approvedByPassenger ? proposed : null,
    status: approvedByPassenger
      ? ('AGREED' as const)
      : ('AWAITING_PASSENGER_CONSENT' as const),
  };
}
export function mayOfferVehicle(
  kind: VehicleKind,
  policy: PilotPolicy = PILOT_POLICY,
): boolean {
  return kind !== 'MOTORCYCLE' || policy.motorbikeServiceEnabled;
}

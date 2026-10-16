export function normalizeCredential(value: string) {
  return value.trim().toUpperCase();
}

export function isMembershipInDateWindow(
  startsAt?: Date | string | null,
  endsAt?: Date | string | null,
  now = new Date(),
) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (start && start.getTime() > now.getTime()) return false;
  if (end && end.getTime() < now.getTime()) return false;
  return true;
}

export function evaluateProfessionalPermission(input: {
  organizationVerificationStatus: string;
  organizationActive: boolean;
  professionalVerificationStatus: string;
  professionalActive: boolean;
  canPrescribe: boolean;
  membershipStatus: string;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  now?: Date;
}) {
  const reasons: string[] = [];
  if (!input.organizationActive) reasons.push('ESTABLISHMENT_INACTIVE');
  if (input.organizationVerificationStatus !== 'VERIFIED')
    reasons.push('ESTABLISHMENT_NOT_VERIFIED');
  if (!input.professionalActive) reasons.push('PROFESSIONAL_INACTIVE');
  if (input.professionalVerificationStatus !== 'VERIFIED')
    reasons.push('PROFESSIONAL_NOT_VERIFIED');
  if (!input.canPrescribe) reasons.push('PRESCRIPTION_PERMISSION_NOT_GRANTED');
  if (input.membershipStatus !== 'ACTIVE') reasons.push('MEMBERSHIP_NOT_ACTIVE');
  if (!isMembershipInDateWindow(input.startsAt, input.endsAt, input.now ?? new Date()))
    reasons.push('MEMBERSHIP_OUTSIDE_VALIDITY');
  return { allowed: reasons.length === 0, reasons };
}

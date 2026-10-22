import { evaluateProfessionalPermission } from '../clinical/r30/clinical-r30.domain';

export type GuardianLike = {
  status: string;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
};

export type MembershipLike = {
  status: string;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  organization: {
    verificationStatus: string;
    active: boolean;
  };
};

function validOrEmpty(value?: Date | string | null) {
  if (value === null || value === undefined || value === '') return true;
  return !Number.isNaN(new Date(value).getTime());
}

function stripAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// La profesión se guarda como texto libre. Solo se acepta una profesión que se lea
// claramente como veterinaria / MVZ. Ante la duda, se deniega.
export function isVeterinaryProfession(profession?: string | null) {
  if (!profession) return false;
  const text = stripAccents(profession).toLowerCase();
  return /veterinari|zootecni|\bmvz\b/.test(text);
}

// Un tutor vigente: estado ACTIVE y dentro de su ventana de fechas.
// Una fecha inválida se trata como NO vigente.
export function isGuardianActive(guardian: GuardianLike, now = new Date()) {
  if (guardian.status !== 'ACTIVE') return false;
  if (!validOrEmpty(guardian.startsAt) || !validOrEmpty(guardian.endsAt)) {
    return false;
  }
  const start = guardian.startsAt ? new Date(guardian.startsAt) : null;
  const end = guardian.endsAt ? new Date(guardian.endsAt) : null;
  if (start && start.getTime() > now.getTime()) return false;
  if (end && end.getTime() < now.getTime()) return false;
  return true;
}

export type VeterinaryPrescriberInput = {
  profession?: string | null;
  professionalVerificationStatus: string;
  professionalActive: boolean;
  canPrescribe: boolean;
  memberships: MembershipLike[];
  now?: Date;
};

// Reutiliza R30 (verificación, canPrescribe, organización y membresía vigentes) y añade:
// profesión veterinaria obligatoria y fechas de membresía válidas.
export function evaluateVeterinaryPrescriber(input: VeterinaryPrescriberInput) {
  const reasons: string[] = [];
  if (!isVeterinaryProfession(input.profession)) {
    reasons.push('PROFESSION_NOT_VETERINARY');
  }

  if (!input.memberships.length) {
    reasons.push('NO_ESTABLISHMENT_MEMBERSHIP');
    return { allowed: false, reasons };
  }

  let best: string[] | null = null;
  for (const membership of input.memberships) {
    const membershipReasons: string[] = [];
    if (
      !validOrEmpty(membership.startsAt) ||
      !validOrEmpty(membership.endsAt)
    ) {
      membershipReasons.push('MEMBERSHIP_DATE_INVALID');
    }
    const r30 = evaluateProfessionalPermission({
      organizationVerificationStatus: membership.organization.verificationStatus,
      organizationActive: membership.organization.active,
      professionalVerificationStatus: input.professionalVerificationStatus,
      professionalActive: input.professionalActive,
      canPrescribe: input.canPrescribe,
      membershipStatus: membership.status,
      startsAt: membership.startsAt,
      endsAt: membership.endsAt,
      now: input.now,
    });
    membershipReasons.push(...r30.reasons);
    if (best === null || membershipReasons.length < best.length) {
      best = membershipReasons;
    }
  }

  reasons.push(...(best ?? []));
  return { allowed: reasons.length === 0, reasons };
}

export const VETERINARIA_MODULE = 'veterinaria';

// Hasta que exista el registro de módulos activos por cuenta, la sesión trae
// ['all'] (cuenta normal) o ['surveys'] (solo encuestas). Cuando el registro
// agregue 'veterinaria' a esa lista, esta regla ya lo respeta sin cambios.
export function hasVeterinariaAccess(modules?: readonly string[] | null) {
  if (!modules?.length) return false;
  return modules.includes('all') || modules.includes(VETERINARIA_MODULE);
}

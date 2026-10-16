export const EVIDENCE_KINDS = [
  'FRONT_PHOTO',
  'INTERIOR_PHOTO',
  'CONSULTING_ROOM_PHOTO',
  'SANITARY_NOTICE',
  'HEALTH_LICENSE',
  'RESPONSIBLE_SANITARY',
  'TAX_OR_IDENTITY',
  'OTHER',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export function organizationTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    PHARMACY: 'Farmacia',
    PHARMACY_WITH_OFFICE: 'Farmacia con consultorio',
    DOCTOR_OFFICE: 'Consultorio',
    CLINIC: 'Clínica',
    LABORATORY: 'Laboratorio',
    OTHER: 'Otro servicio de salud',
  };
  return labels[String(type ?? '')] ?? 'Servicio de salud';
}

export function registrationRequirements(type?: string | null) {
  const base = ['FRONT_PHOTO'];
  const permit = ['SANITARY_NOTICE_OR_HEALTH_LICENSE'];
  const map: Record<string, string[]> = {
    PHARMACY: [...base, 'INTERIOR_PHOTO', ...permit],
    PHARMACY_WITH_OFFICE: [
      ...base,
      'INTERIOR_PHOTO',
      'CONSULTING_ROOM_PHOTO',
      ...permit,
    ],
    DOCTOR_OFFICE: [...base, 'CONSULTING_ROOM_PHOTO', ...permit],
    CLINIC: [...base, 'INTERIOR_PHOTO', ...permit],
    LABORATORY: [...base, 'INTERIOR_PHOTO', ...permit],
    OTHER: [...base, ...permit],
  };
  return map[String(type ?? '')] ?? map.OTHER;
}

export function evaluateRegistrationReadiness(input: {
  organization: any;
  location: any | null;
  evidenceKinds: string[];
}) {
  const missing: string[] = [];
  const org = input.organization ?? {};
  const kinds = new Set(input.evidenceKinds);

  if (!String(org.displayName ?? '').trim()) missing.push('NAME');
  if (!String(org.addressLine1 ?? '').trim()) missing.push('ADDRESS');
  if (!String(org.municipality ?? '').trim()) missing.push('MUNICIPALITY');
  if (!String(org.state ?? '').trim()) missing.push('STATE');
  if (!String(org.responsibleName ?? '').trim()) missing.push('RESPONSIBLE');
  if (!input.location) missing.push('LOCATION');

  for (const requirement of registrationRequirements(org.organizationType)) {
    if (requirement === 'SANITARY_NOTICE_OR_HEALTH_LICENSE') {
      if (!kinds.has('SANITARY_NOTICE') && !kinds.has('HEALTH_LICENSE')) {
        missing.push('SANITARY_NOTICE_OR_HEALTH_LICENSE');
      }
      continue;
    }
    if (!kinds.has(requirement)) missing.push(requirement);
  }

  return { ready: missing.length === 0, missing };
}

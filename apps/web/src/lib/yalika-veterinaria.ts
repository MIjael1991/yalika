export type VetPet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  birthDate: string | null;
  birthDateApprox: boolean;
  microchip: string | null;
  guardianRole?: string;
  createdAt: string;
};

export type VetConsultation = {
  id: string;
  petId: string;
  mode: string;
  status: string;
  scheduledAt: string;
  reason: string | null;
  veterinarianUserId: string | null;
  pet?: Pick<VetPet, 'id' | 'name' | 'species' | 'breed' | 'sex' | 'birthDate'>;
};

export type VetPrescriptionItem = {
  id: string;
  medicationName: string;
  dosageText: string | null;
  frequencyText: string | null;
  durationText: string | null;
  instructions: string | null;
};

export type VetPrescription = {
  id: string;
  petId: string;
  consultationId: string;
  status: string;
  issuedAt: string;
  items: VetPrescriptionItem[];
};

export type NewVetPet = {
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  birthDate?: string;
  birthDateApprox?: boolean;
  microchip?: string;
};

export type NewVetConsultation = {
  mode: string;
  scheduledAt: string;
  reason?: string;
  veterinarianEmail?: string;
};

export type NewVetPrescriptionItem = {
  medicationName: string;
  dosageText?: string;
  frequencyText?: string;
  durationText?: string;
  instructions?: string;
};

export const speciesOptions = [
  ['DOG', 'Perro'],
  ['CAT', 'Gato'],
  ['BIRD', 'Ave'],
  ['RABBIT', 'Conejo'],
  ['REPTILE', 'Reptil'],
  ['LIVESTOCK', 'Ganado'],
  ['OTHER', 'Otro'],
] as const;

export const sexOptions = [
  ['MALE', 'Macho'],
  ['FEMALE', 'Hembra'],
  ['UNKNOWN', 'No sé'],
] as const;

export const modeOptions = [
  ['presential', 'En consultorio'],
  ['home', 'A domicilio'],
  ['online', 'En línea'],
  ['follow_up', 'Seguimiento'],
] as const;

function labelOf(
  options: readonly (readonly [string, string])[],
  value: string | null | undefined,
  fallback: string,
) {
  return options.find(([key]) => key === value)?.[1] ?? fallback;
}

export const speciesLabel = (v?: string | null) =>
  labelOf(speciesOptions, v, 'Animal');
export const sexLabel = (v?: string | null) => labelOf(sexOptions, v, '');
export const modeLabel = (v?: string | null) =>
  labelOf(modeOptions, v, 'Consulta');

const statusLabels: Record<string, string> = {
  scheduled: 'Programada',
  active: 'En curso',
  completed: 'Terminada',
  cancelled: 'Cancelada',
};
export const statusLabel = (v?: string | null) =>
  (v && statusLabels[v]) || 'Sin estado';

// Estados en los que el veterinario asignado puede emitir receta (igual que el API).
export const prescribableStatuses = ['scheduled', 'active', 'completed'];

const reasonLabels: Record<string, string> = {
  PROFESSION_NOT_VETERINARY: 'Tu profesión registrada no es de veterinaria.',
  NO_PROFESSIONAL_PROFILE: 'No tienes un perfil profesional registrado.',
  NO_ESTABLISHMENT_MEMBERSHIP:
    'No perteneces a ningún establecimiento (clínica o consultorio).',
  MEMBERSHIP_DATE_INVALID: 'La vigencia de tu pertenencia tiene una fecha inválida.',
  MEMBERSHIP_NOT_ACTIVE: 'Tu pertenencia al establecimiento no está activa.',
  MEMBERSHIP_OUTSIDE_VALIDITY:
    'Tu pertenencia al establecimiento no está vigente hoy.',
  ESTABLISHMENT_INACTIVE: 'El establecimiento está inactivo.',
  ESTABLISHMENT_NOT_VERIFIED: 'El establecimiento aún no está verificado.',
  PROFESSIONAL_INACTIVE: 'Tu perfil profesional está inactivo.',
  PROFESSIONAL_NOT_VERIFIED: 'Tu perfil profesional aún no está verificado.',
  PRESCRIPTION_PERMISSION_NOT_GRANTED:
    'Todavía no tienes habilitada la emisión de recetas.',
};
export const reasonLabel = (code: string) =>
  reasonLabels[code] ?? 'Falta un requisito de habilitación.';

/** Edad legible a partir de la fecha de nacimiento. Si es aproximada, lo dice. */
export function formatAge(
  birthDate: string | null | undefined,
  approx = false,
  now: Date = new Date(),
) {
  if (!birthDate) return 'Edad no registrada';
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime()) || born.getTime() > now.getTime()) {
    return 'Edad no registrada';
  }
  let months =
    (now.getUTCFullYear() - born.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - born.getUTCMonth());
  if (now.getUTCDate() < born.getUTCDate()) months -= 1;
  const prefix = approx ? 'Aprox. ' : '';
  if (months < 1) return `${prefix}menos de 1 mes`.replace(/^./, (c) => c.toUpperCase());
  if (months < 24) return `${prefix}${months} ${months === 1 ? 'mes' : 'meses'}`;
  return `${prefix}${Math.floor(months / 12)} años`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export class VetApiError extends Error {
  status: number;
  reasons: string[];
  constructor(message: string, status: number, reasons: string[] = []) {
    super(message);
    this.name = 'VetApiError';
    this.status = status;
    this.reasons = reasons;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/yalika/veterinaria${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new VetApiError('No hay conexión con Yalika. Revisa tu internet.', 0);
  }
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
    reasons?: unknown;
  } | null;
  if (!response.ok) {
    const raw = body?.message;
    const message = Array.isArray(raw) ? raw.join('. ') : raw;
    const reasons = Array.isArray(body?.reasons)
      ? body.reasons.filter((r): r is string => typeof r === 'string')
      : [];
    throw new VetApiError(message || `Error ${response.status}`, response.status, reasons);
  }
  return body as T;
}

const json = (data: unknown) => JSON.stringify(data);

export const vetApi = {
  pets: () => request<VetPet[]>('/pets'),
  createPet: (data: NewVetPet) =>
    request<VetPet>('/pets', { method: 'POST', body: json(data) }),
  getPet: (id: string) => request<VetPet>(`/pets/${encodeURIComponent(id)}`),
  updatePet: (id: string, data: Partial<NewVetPet>) =>
    request<VetPet>(`/pets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json(data),
    }),
  consultations: (petId: string) =>
    request<VetConsultation[]>(`/pets/${encodeURIComponent(petId)}/consultations`),
  createConsultation: (petId: string, data: NewVetConsultation) =>
    request<VetConsultation>(`/pets/${encodeURIComponent(petId)}/consultations`, {
      method: 'POST',
      body: json(data),
    }),
  prescriptions: (petId: string) =>
    request<VetPrescription[]>(`/pets/${encodeURIComponent(petId)}/prescriptions`),
  assigned: () => request<VetConsultation[]>('/vet/consultations'),
  issuePrescription: (
    consultationId: string,
    data: { issuedAt: string; idempotencyKey: string; items: NewVetPrescriptionItem[] },
  ) =>
    request<VetPrescription>(
      `/vet/consultations/${encodeURIComponent(consultationId)}/prescriptions`,
      { method: 'POST', body: json(data) },
    ),
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/orion${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body?.message ??
      body?.error ??
      `Error ${response.status}`;
    const error = new Error(
      Array.isArray(message) ? message.join('. ') : String(message),
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return body as T;
}

export const consultationApi = {
  consultations: () =>
    api<any[]>('/clinical/r28/me/consultations'),

  createConsultation: (input: {
    subjectType: 'HUMAN' | 'PET' | 'LIVESTOCK';
    mode: 'online' | 'presential' | 'follow_up';
    scheduledAt: string;
    reason?: string;
    clinicianEmail?: string;
  }) =>
    api<any>('/clinical/r28/me/consultations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  createLink: (
    consultationId: string,
    input: { ttlMinutes: number; maxUses?: number },
  ) =>
    api<any>(
      `/clinical/r28/me/consultations/${encodeURIComponent(consultationId)}/link`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  revokeLinks: (consultationId: string) =>
    api<any>(
      `/clinical/r28/me/consultations/${encodeURIComponent(consultationId)}/revoke-links`,
      { method: 'POST' },
    ),

  access: (token: string) =>
    api<any>(
      `/clinical/r28/access/consultation?token=${encodeURIComponent(token)}`,
    ),

  regimens: () => api<any[]>('/clinical/r28/me/regimens'),

  createRegimen: (input: any) =>
    api<any>('/clinical/r28/me/regimens', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  dispense: (regimenId: string, input: any) =>
    api<any>(
      `/clinical/r28/me/regimens/${encodeURIComponent(regimenId)}/dispense`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  materializeLife: () =>
    api<any>('/clinical/r28/me/life/materialize', {
      method: 'POST',
    }),

  createProfessionalPrescription: (
    consultationId: string,
    input: any,
  ) =>
    api<any>(
      `/clinical/r28/consultations/${encodeURIComponent(consultationId)}/prescriptions`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
};

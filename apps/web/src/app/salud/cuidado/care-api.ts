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
    const message = body?.message ?? body?.error ?? `Error ${response.status}`;
    const error = new Error(Array.isArray(message) ? message.join('. ') : String(message)) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export const careApi = {
  home: () => api<any>('/clinical/r303/me/home'),
  updateEssentials: (input: any) => api<any>('/clinical/r303/me/essentials', { method: 'PUT', body: JSON.stringify(input) }),
  createChronicCondition: (input: any) => api<any>('/clinical/r303/me/chronic-conditions', { method: 'POST', body: JSON.stringify(input) }),
  deactivateChronicCondition: (id: string) => api<any>(`/clinical/r303/me/chronic-conditions/${encodeURIComponent(id)}/deactivate`, { method: 'POST' }),
  assistantR303: (query: string) => api<any>('/clinical/r303/assistant/query', { method: 'POST', body: JSON.stringify({ query }) }),
  overview: () => api<any>('/clinical/r29/me/overview'),
  regimens: () => api<any[]>('/clinical/r28/me/regimens'),
  materializeLife: () => api<any>('/clinical/r28/me/life/materialize', { method: 'POST' }),
  createCapture: (input: any) => api<any>('/clinical/r29/me/visit-captures', { method: 'POST', body: JSON.stringify(input) }),
  confirmCapture: (id: string, input: any) => api<any>(`/clinical/r29/me/visit-captures/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify(input) }),
  createAllergy: (input: any) => api<any>('/clinical/r29/me/allergies', { method: 'POST', body: JSON.stringify(input) }),
  deactivateAllergy: (id: string) => api<any>(`/clinical/r29/me/allergies/${encodeURIComponent(id)}/deactivate`, { method: 'POST' }),
  createRestriction: (input: any) => api<any>('/clinical/r29/me/restrictions', { method: 'POST', body: JSON.stringify(input) }),
  deactivateRestriction: (id: string) => api<any>(`/clinical/r29/me/restrictions/${encodeURIComponent(id)}/deactivate`, { method: 'POST' }),
  createSchedule: (input: any) => api<any>('/clinical/r29/me/medication-schedules', { method: 'POST', body: JSON.stringify(input) }),
  recordDose: (id: string, input: any) => api<any>(`/clinical/r29/me/medication-schedules/${encodeURIComponent(id)}/doses`, { method: 'POST', body: JSON.stringify(input) }),
  changeSchedule: (id: string, input: any) => api<any>(`/clinical/r29/me/medication-schedules/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify(input) }),
  createProcedure: (input: any) => api<any>('/clinical/r29/me/procedures', { method: 'POST', body: JSON.stringify(input) }),
  createFollowUp: (input: any) => api<any>('/clinical/r29/me/follow-up-proposals', { method: 'POST', body: JSON.stringify(input) }),
  acceptFollowUp: (id: string) => api<any>(`/clinical/r29/me/follow-up-proposals/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
  rejectFollowUp: (id: string) => api<any>(`/clinical/r29/me/follow-up-proposals/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
  doctorSummary: (input: any) => api<any>('/clinical/r29/me/doctor-summary', { method: 'POST', body: JSON.stringify(input) }),
  createHealthQr: (input: any) => api<any>('/clinical/r29/me/health-qr', { method: 'POST', body: JSON.stringify(input) }),
  createCaregiver: (input: any) => api<any>('/clinical/r29/me/caregivers', { method: 'POST', body: JSON.stringify(input) }),
  grantForRequest: (requestId: string) => api<any>(`/clinical/r29/access/requests/${encodeURIComponent(requestId)}/grant`),
  sharedSummary: (sessionId: string) => api<any>(`/clinical/r29/shared/summary?sessionId=${encodeURIComponent(sessionId)}`),
  assistant: (query: string) => api<any>('/clinical/r29/assistant/query', { method: 'POST', body: JSON.stringify({ query }) }),
  sync: (operations: any[]) => api<any>('/clinical/r29/me/sync', { method: 'POST', body: JSON.stringify({ operations }) }),
};

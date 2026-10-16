async function jsonApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/yalika${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `Error ${response.status}`;
    throw new Error(Array.isArray(message) ? message.join('. ') : String(message));
  }
  return body as T;
}

async function formApi<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`/api/yalika${path}`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    body: form,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `Error ${response.status}`;
    throw new Error(Array.isArray(message) ? message.join('. ') : String(message));
  }
  return body as T;
}

export const trustApi = {
  networkMe: () => jsonApi<any>('/clinical/r302/network/me'),
  createOrganization: (input: any) => jsonApi<any>('/clinical/r302/network/organizations', { method: 'POST', body: JSON.stringify(input) }),
  saveLocation: (organizationId: string, input: any) => jsonApi<any>(`/clinical/r302/network/organizations/${encodeURIComponent(organizationId)}/location`, { method: 'POST', body: JSON.stringify(input) }),
  uploadEvidence: (organizationId: string, form: FormData) => formApi<any>(`/clinical/r302/network/organizations/${encodeURIComponent(organizationId)}/evidence`, form),
  removeEvidence: (organizationId: string, evidenceId: string) => jsonApi<any>(`/clinical/r302/network/organizations/${encodeURIComponent(organizationId)}/evidence/${encodeURIComponent(evidenceId)}/remove`, { method: 'POST' }),
  submitOrganization: (organizationId: string) => jsonApi<any>(`/clinical/r302/network/organizations/${encodeURIComponent(organizationId)}/submit`, { method: 'POST' }),
  inviteProfessional: (organizationId: string, input: any) => jsonApi<any>(`/clinical/r302/network/organizations/${encodeURIComponent(organizationId)}/invitations`, { method: 'POST', body: JSON.stringify(input) }),
  acceptInvitation: (invitationId: string) => jsonApi<any>(`/clinical/r302/network/invitations/${encodeURIComponent(invitationId)}/accept`, { method: 'POST' }),
  saveProfessional: (input: any) => jsonApi<any>('/clinical/r30/trust/professional/profile', { method: 'POST', body: JSON.stringify(input) }),
};

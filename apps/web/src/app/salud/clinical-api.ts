export type ClinicalDocument = {
  id: string;
  title: string;
  documentType: string;
  originalName?: string;
  mimeType: string;
  byteSize: number;
  source: string;
  verificationStatus: string;
  clinicalDate?: string | null;
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  kind: string;
  title: string;
  status: string;
  occurredAt: string;
  verificationStatus: string;
  resourceType?: string | null;
  resourceId?: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/orion${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body?.message ??
      body?.error ??
      `Error ${response.status}`;
    throw new Error(
      Array.isArray(message) ? message.join('. ') : String(message),
    );
  }
  return body as T;
}

export const clinicalApi = {
  dashboard: () => api<any>('/clinical/me/dashboard'),
  seedDemo: () => api<any>('/clinical/me/demo/seed', { method: 'POST' }),
  timeline: () => api<TimelineEvent[]>('/clinical/me/timeline'),
  documents: () => api<ClinicalDocument[]>('/clinical/me/documents'),
  prescriptions: () => api<any[]>('/clinical/me/prescriptions'),
  shareLinks: () => api<any[]>('/clinical/me/share-links'),
  accessRequests: () => api<any[]>('/clinical/me/access-requests'),
  grants: () => api<any[]>('/clinical/me/access-grants'),
  audit: () => api<any[]>('/clinical/me/audit'),

  createEvent: (input: {
    kind: string;
    title: string;
    occurredAt: string;
    status?: string;
  }) =>
    api('/clinical/me/events', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  uploadDocument: (form: FormData) =>
    api('/clinical/me/documents/upload', {
      method: 'POST',
      body: form,
    }),

  createPrescription: (input: any) =>
    api('/clinical/me/prescriptions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  createShare: (input: {
    resourceIds: string[];
    permissions: string[];
    expiresInMinutes: number;
    purpose?: string;
  }) =>
    api<any>('/clinical/me/share-links', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  approveRequest: (id: string) =>
    api(`/clinical/me/access-requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    }),

  denyRequest: (id: string) =>
    api(`/clinical/me/access-requests/${encodeURIComponent(id)}/deny`, {
      method: 'POST',
    }),

  revokeShareLink: (id: string) =>
    api(`/clinical/me/share-links/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
    }),

  revokeGrant: (id: string) =>
    api(`/clinical/me/access-grants/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
    }),

  assistant: (query: string) =>
    api<any>('/clinical/r29/assistant/query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  requestAccess: (token: string) =>
    api<any>('/clinical/access/request', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  viewerGrants: () => api<any[]>('/clinical/access/grants'),

  createSession: (grantId: string) =>
    api<any>(`/clinical/access/grants/${encodeURIComponent(grantId)}/session`, {
      method: 'POST',
    }),

  sharedDocuments: (sessionId: string) =>
    api<ClinicalDocument[]>(
      `/clinical/access/sessions/${encodeURIComponent(sessionId)}/documents`,
    ),
};

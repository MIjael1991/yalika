import type { Request } from 'express';

export const sessionCookieName = 'orion_session';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  companyId: string;
  role: {
    id: string;
    name: string;
  } | null;
};

export type AuthContext = {
  sessionId: string;
  sessionToken: string;
  expiresAt: Date;
  user: AuthenticatedUser;
};

export type AuthenticatedRequest = Request & {
  auth: AuthContext;
};

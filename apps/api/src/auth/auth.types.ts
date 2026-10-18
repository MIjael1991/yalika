import type { Request } from 'express';

export const sessionCookieName = 'yalika_session';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  companyId: string;
  role: {
    id: string;
    name: string;
  } | null;
  modules: string[];
  homePath: string;
  /** Permisos extra que el administrador dio a este cajero. */
  permissions?: string[];
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

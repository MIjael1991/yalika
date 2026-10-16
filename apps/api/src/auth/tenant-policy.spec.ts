import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthContext } from './auth.types';
import {
  assertOwnCompany,
  requireCommercialAccount,
  requireCompanyAdministrator,
} from './tenant-policy';

function makeAuth(
  role: string | null = 'Administrador',
  companyId = 'company-a',
): AuthContext {
  return {
    user: {
      id: 'user-a',
      name: 'Prueba',
      email: 'test@example.test',
      companyId,
      role: role ? { id: 'role-a', name: role } : null,
      modules: role === 'encuestas' ? ['surveys'] : ['all'],
      homePath: '/life',
    },
    sessionId: 'session-a',
    sessionToken: 'dummy',
    expiresAt: new Date('2030-01-01'),
  };
}

describe('S1B tenant policy', () => {
  it('accepts a verified commercial account', () => {
    expect(() => requireCommercialAccount(makeAuth())).not.toThrow();
  });
  it('rejects survey-only accounts', () => {
    expect(() => requireCommercialAccount(makeAuth('encuestas'))).toThrow(
      ForbiddenException,
    );
  });
  it('only allows administrator role for privileged operations', () => {
    expect(() =>
      requireCompanyAdministrator(makeAuth('Administrador')),
    ).not.toThrow();
    expect(() =>
      requireCompanyAdministrator(makeAuth('administrador')),
    ).not.toThrow();
    expect(() => requireCompanyAdministrator(makeAuth('cajero'))).toThrow(
      ForbiddenException,
    );
    expect(() => requireCompanyAdministrator(makeAuth(null))).toThrow(
      ForbiddenException,
    );
  });
  it('hides resources owned by another company', () => {
    expect(() => assertOwnCompany(makeAuth(), 'company-a')).not.toThrow();
    expect(() => assertOwnCompany(makeAuth(), 'company-b')).toThrow(
      NotFoundException,
    );
  });
});

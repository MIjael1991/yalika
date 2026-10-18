import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
import { hashSessionToken } from './password';

function build(userOverrides: Record<string, unknown> = {}) {
  const session = {
    id: 's1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastSeenAt: new Date(),
    user: {
      id: 'u1',
      name: 'Ana',
      email: 'ana@tienda.com',
      status: 'active',
      companyId: 'c1',
      role: { id: 'r1', name: 'Cajero' },
      memberships: [
        { companyId: 'otra', permissions: ['refunds'] },
        { companyId: 'c1', permissions: ['returns', 'inventado'] },
      ],
      ...userOverrides,
    },
  };
  const prisma = {
    authSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      update: jest.fn(),
    },
  };
  return { service: new AuthService(prisma as never), prisma };
}

describe('Sesión: permisos extra del cajero', () => {
  it('trae los permisos de la empresa de la cuenta y no deja ver las membresías', async () => {
    const { service, prisma } = build();

    const auth = await service.authenticate('token-1');

    expect(auth.user.permissions).toEqual(['returns']);
    expect(auth.user).not.toHaveProperty('memberships');
    const query = prisma.authSession.findUnique.mock.calls[0] as [
      { where: { tokenHash: string } },
    ];
    expect(query[0].where.tokenHash).toBe(hashSessionToken('token-1'));
  });

  it('sin membresía activa no hay permisos extra', async () => {
    const { service } = build({ memberships: [] });

    const auth = await service.authenticate('token-1');

    expect(auth.user.permissions).toEqual([]);
  });

  it('una cuenta desactivada no entra aunque tenga permisos', async () => {
    const { service } = build({ status: 'inactive' });

    await expect(service.authenticate('token-1')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

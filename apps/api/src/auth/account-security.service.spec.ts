jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { UnauthorizedException } from '@nestjs/common';

import { AccountSecurityService } from './account-security.service';
import { hashPassword } from './password';

function makePrisma(passwordHash: string) {
  const tx = {
    user: { update: jest.fn().mockResolvedValue({}) },
    authSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1', passwordHash }),
    },
    $transaction: jest.fn(async (callback: (arg: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  return { prisma, tx };
}

describe('AccountSecurityService', () => {
  it('cambia contraseña y cierra las demás sesiones por defecto', async () => {
    const hash = await hashPassword('actual-segura-10');
    const { prisma, tx } = makePrisma(hash);
    const service = new AccountSecurityService(prisma as never);

    const result = await service.changePassword('u1', 'sesion-actual', {
      currentPassword: 'actual-segura-10',
      newPassword: 'nueva-segura-10',
      confirmPassword: 'nueva-segura-10',
    });

    expect(result.ok).toBe(true);
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          revokedAt: null,
          tokenHash: expect.objectContaining({ not: expect.any(String) }),
        }),
      }),
    );
  });

  it('rechaza una contraseña actual incorrecta', async () => {
    const hash = await hashPassword('actual-segura-10');
    const { prisma } = makePrisma(hash);
    const service = new AccountSecurityService(prisma as never);

    await expect(
      service.changePassword('u1', 'sesion-actual', {
        currentPassword: 'incorrecta-000',
        newPassword: 'nueva-segura-10',
        confirmPassword: 'nueva-segura-10',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

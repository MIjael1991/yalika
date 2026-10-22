/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- dobles de prueba */
import { ConflictException, UnauthorizedException } from '@nestjs/common';

import { AccountSecurityService } from './account-security.service';
import { hashPassword } from './password';

async function setup(taken = false) {
  const passwordHash = await hashPassword('actual-segura-10');
  const prisma: any = {
    user: {
      findUnique: jest.fn(async (args: any) =>
        args.where.email
          ? taken
            ? { id: 'otro' }
            : null
          : {
              id: 'u1',
              passwordHash,
              email: 'ana@demo.mx',
              name: 'Ana',
              passwordChangedAt: null,
            },
      ),
      update: jest.fn(),
    },
    authRecoveryKey: { findUnique: jest.fn(async () => null) },
    accountContact: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(),
    },
  };
  return { service: new AccountSecurityService(prisma as never), prisma };
}

describe('Cuenta · teléfono y correo de recuperación', () => {
  it('guarda el celular en formato +52 (sin verificar) solo con la contraseña actual', async () => {
    const { service, prisma } = await setup();
    await service.setRecoveryPhone('u1', {
      phone: '443 123 4567',
      currentPassword: 'actual-segura-10',
    });
    expect(prisma.accountContact.upsert.mock.calls[0][0].create).toEqual({
      userId: 'u1',
      recoveryPhone: '+524431234567',
    });
    await expect(
      service.setRecoveryPhone('u1', {
        phone: '4431234567',
        currentPassword: 'mala',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('cambia el correo con la contraseña y no deja usar uno de otra cuenta', async () => {
    const { service, prisma } = await setup();
    await service.changeEmail('u1', {
      newEmail: 'Ana.Nueva@Demo.mx',
      currentPassword: 'actual-segura-10',
    });
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({
      email: 'ana.nueva@demo.mx',
    });
    const busy = await setup(true);
    await expect(
      busy.service.changeEmail('u1', {
        newEmail: 'otro@demo.mx',
        currentPassword: 'actual-segura-10',
      }),
    ).rejects.toThrow(ConflictException);
  });
});

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('./password', () => ({
  hashPassword: jest.fn(async () => 'scrypt$test$hash'),
}));

import { ConflictException } from '@nestjs/common';

import { PublicRegistrationService } from './public-registration.service';

describe('PublicRegistrationService', () => {
  const previous = process.env.YALEKA_PUBLIC_REGISTRATION;

  afterAll(() => {
    process.env.YALEKA_PUBLIC_REGISTRATION = previous;
  });

  it('creates a general Yalika account and records the event', async () => {
    process.env.YALEKA_PUBLIC_REGISTRATION = 'true';
    const findFirst = jest.fn().mockResolvedValue(null);
    const companyCreate = jest
      .fn()
      .mockResolvedValue({ id: 'company-1', name: 'Proyecto Â· A1B2C3' });
    const roleCreate = jest
      .fn()
      .mockResolvedValue({ id: 'role-1', name: 'Administrador' });
    const userCreate = jest.fn().mockResolvedValue({
      id: 'user-1',
      name: 'Daniel',
      email: 'daniel@example.com',
      companyId: 'company-1',
    });
    const eventCreate = jest.fn().mockResolvedValue({ id: 'event-1' });
    const transaction = jest.fn(async (callback: (tx: any) => Promise<any>) =>
      callback({
        company: { create: companyCreate },
        role: { create: roleCreate },
        user: { create: userCreate },
        event: { create: eventCreate },
      }),
    );

    const service = new PublicRegistrationService({
      user: { findFirst },
      $transaction: transaction,
    } as any);

    const result = await service.register({
      name: 'Daniel',
      organizationName: 'Proyecto',
      email: 'Daniel@Example.com',
      password: 'ClaveSegura10',
      confirmPassword: 'ClaveSegura10',
      acceptTerms: true,
    });

    expect(findFirst).toHaveBeenCalled();
    expect(roleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Administrador' }),
      }),
    );
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'account.registered' }),
      }),
    );
    expect(result.homePath).toBe('/');
  });

  it('does not create a duplicate email', async () => {
    process.env.YALEKA_PUBLIC_REGISTRATION = 'true';
    const service = new PublicRegistrationService({
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'existing' }) },
    } as any);

    await expect(
      service.register({
        name: 'Daniel',
        organizationName: 'Proyecto',
        email: 'daniel@example.com',
        password: 'ClaveSegura10',
        confirmPassword: 'ClaveSegura10',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});


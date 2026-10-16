import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

function build() {
  const tx = {
    role: { findFirst: jest.fn(), create: jest.fn() },
    user: { create: jest.fn(), update: jest.fn() },
    authSession: { updateMany: jest.fn() },
    event: { create: jest.fn() },
  };
  const prisma = {
    user: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx, service: new TeamService(prisma as never) };
}

const validDto = {
  name: '  Ana   López ',
  email: ' Ana@Tienda.COM ',
  password: 'clave-segura-1',
  confirmPassword: 'clave-segura-1',
};

describe('Equipo: el administrador da de alta a sus cajeros', () => {
  it('crea el cajero en la empresa del administrador, con rol Cajero', async () => {
    const { service, prisma, tx } = build();
    prisma.user.findFirst.mockResolvedValue(null);
    tx.role.findFirst.mockResolvedValue(null);
    tx.role.create.mockResolvedValue({ id: 'r-cajero' });
    tx.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    const created = (await service.createCashier('c1', 'admin1', validDto)) as {
      email: string;
      name: string;
      companyId: string;
      roleId: string;
      passwordHash: string;
    };

    const roleCall = tx.role.create.mock.calls[0] as [
      { data: { name: string; companyId: string } },
    ];
    expect(roleCall[0].data).toMatchObject({ name: 'Cajero', companyId: 'c1' });
    expect(created.email).toBe('ana@tienda.com');
    expect(created.name).toBe('Ana López');
    expect(created.companyId).toBe('c1');
    expect(created.roleId).toBe('r-cajero');
    expect(created.passwordHash).toMatch(/^scrypt\$/);
    expect(created.passwordHash).not.toContain('clave-segura-1');
    expect(tx.event.create).toHaveBeenCalled();
  });

  it('reutiliza el rol Cajero si la empresa ya lo tiene', async () => {
    const { service, prisma, tx } = build();
    prisma.user.findFirst.mockResolvedValue(null);
    tx.role.findFirst.mockResolvedValue({ id: 'r-existente' });
    tx.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    await service.createCashier('c1', 'admin1', validDto);

    expect(tx.role.create).not.toHaveBeenCalled();
  });

  it('rechaza correo repetido y contraseñas que no coinciden o son cortas', async () => {
    const { service, prisma } = build();

    prisma.user.findFirst.mockResolvedValue({ id: 'otro' });
    await expect(
      service.createCashier('c1', 'admin1', validDto),
    ).rejects.toThrow(ConflictException);

    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.createCashier('c1', 'admin1', {
        ...validDto,
        confirmPassword: 'distinta-clave-1',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createCashier('c1', 'admin1', {
        ...validDto,
        password: 'corta',
        confirmPassword: 'corta',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('solo administra cajeros de su propia empresa (si no, no existe)', async () => {
    const { service, prisma } = build();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.setStatus('c1', 'admin1', 'u-ajeno', { status: 'inactive' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.resetPassword('c1', 'admin1', 'u-ajeno', {
        password: 'clave-segura-1',
        confirmPassword: 'clave-segura-1',
      }),
    ).rejects.toThrow(NotFoundException);

    const lookup = prisma.user.findFirst.mock.calls[0] as [
      { where: { companyId: string } },
    ];
    expect(lookup[0].where.companyId).toBe('c1');
  });

  it('al desactivar a un cajero cierra todas sus sesiones abiertas', async () => {
    const { service, prisma, tx } = build();
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    tx.user.update.mockResolvedValue({ id: 'u1', status: 'inactive' });

    await service.setStatus('c1', 'admin1', 'u1', { status: 'inactive' });

    expect(tx.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    );
  });

  it('al reactivarlo no toca sus sesiones', async () => {
    const { service, prisma, tx } = build();
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    tx.user.update.mockResolvedValue({ id: 'u1', status: 'active' });

    await service.setStatus('c1', 'admin1', 'u1', { status: 'active' });

    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('al cambiar la contraseña cierra sesiones y limpia el bloqueo', async () => {
    const { service, prisma, tx } = build();
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });

    await service.resetPassword('c1', 'admin1', 'u1', {
      password: 'otra-clave-segura',
      confirmPassword: 'otra-clave-segura',
    });

    const updateCall = tx.user.update.mock.calls[0] as [
      { data: { failedLoginAttempts: number; lockedUntil: null } },
    ];
    expect(updateCall[0].data).toMatchObject({
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    expect(tx.authSession.updateMany).toHaveBeenCalled();
  });
});

describe('Equipo: un cajero no puede administrar cuentas', () => {
  const asCashier = {
    user: {
      id: 'cajero-1',
      companyId: 'c1',
      modules: ['all'],
      role: { id: 'r', name: 'Cajero' },
    },
  } as unknown as AuthContext;
  const asAdmin = {
    user: {
      id: 'admin-1',
      companyId: 'c1',
      modules: ['all'],
      role: { id: 'r', name: 'Administrador' },
    },
  } as unknown as AuthContext;

  it('rechaza al cajero en listar, crear, desactivar y cambiar contraseña', () => {
    const service = {
      list: jest.fn(),
      createCashier: jest.fn(),
      setStatus: jest.fn(),
      resetPassword: jest.fn(),
    };
    const controller = new TeamController(service as never);
    const uuid = '3f1c2c0e-5d3b-4f5e-9d7a-0c1b2a3d4e5f';

    expect(() => controller.list(asCashier)).toThrow(ForbiddenException);
    expect(() => controller.create(validDto, asCashier)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      controller.setStatus(uuid, { status: 'inactive' }, asCashier),
    ).toThrow(ForbiddenException);
    expect(() => controller.resetPassword(uuid, validDto, asCashier)).toThrow(
      ForbiddenException,
    );
    expect(service.createCashier).not.toHaveBeenCalled();
  });

  it('el administrador usa la empresa de su sesión, no una enviada por el cliente', () => {
    const service = { list: jest.fn(), createCashier: jest.fn() };
    const controller = new TeamController(service as never);

    void controller.list(asAdmin);
    void controller.create(validDto, asAdmin);

    expect(service.list).toHaveBeenCalledWith('c1');
    expect(service.createCashier).toHaveBeenCalledWith(
      'c1',
      'admin-1',
      validDto,
    );
  });
});

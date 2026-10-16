import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import type { AuthContext } from '../../auth/auth.types';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

function auth(roleName: string | null, companyId = 'company-1'): AuthContext {
  return {
    user: {
      id: 'user-1',
      name: 'Prueba',
      email: 'prueba@example.test',
      companyId,
      role: roleName ? { id: 'role-1', name: roleName } : null,
      modules: ['all'],
      homePath: '/life',
    },
    sessionId: 'session-1',
    sessionToken: 'fake-test-token',
    expiresAt: new Date('2030-01-01T00:00:00Z'),
  };
}

describe('YALIKA I1 - Seguridad de Eventos', () => {
  it('exige autenticacion', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, EventsController) ?? [];

    expect(guards).toContain(SessionAuthGuard);
  });

  it('rechaza usuarios sin permisos', () => {
    const findAll = jest.fn();
    const controller = new EventsController({ findAll } as never);

    expect(() => controller.findAll(auth('encuestas'))).toThrow(
      ForbiddenException,
    );

    expect(() => controller.findAll(auth(null))).toThrow(ForbiddenException);

    expect(findAll).not.toHaveBeenCalled();
  });

  it('utiliza la empresa de la sesion', () => {
    const findAll = jest.fn();
    const controller = new EventsController({ findAll } as never);

    controller.findAll(auth('Administrador', 'empresa-propia'));

    expect(findAll).toHaveBeenCalledWith('empresa-propia');
  });

  it('bloquea eventos creados mediante HTTP', () => {
    const create = jest.fn();
    const controller = new EventsController({ create } as never);

    expect(() => controller.create()).toThrow(ForbiddenException);

    expect(create).not.toHaveBeenCalled();
  });

  it('filtra eventos y limita los datos devueltos', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new EventsService({
      event: { findMany },
    } as never);

    await service.findAll('empresa-propia');

    expect(findMany).toHaveBeenCalledWith({
      where: { companyId: 'empresa-propia' },
      select: {
        id: true,
        type: true,
        source: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  });

  it('rechaza consultas sin empresa', async () => {
    const findMany = jest.fn();
    const service = new EventsService({
      event: { findMany },
    } as never);

    await expect(service.findAll('')).rejects.toThrow(ForbiddenException);

    expect(findMany).not.toHaveBeenCalled();
  });
});

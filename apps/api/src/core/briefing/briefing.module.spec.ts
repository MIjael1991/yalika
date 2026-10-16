jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { BriefingModule } from './briefing.module';

describe('BriefingModule', () => {
  it('resuelve el guard de sesion y todas sus dependencias', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BriefingModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    await moduleRef.close();
  });
});

import { BriefingController } from './briefing.controller';
describe('PRUEBA permisos del resumen', () => {
  it('bloquea una cuenta limitada a encuestas', () => {
    const service = { findToday: jest.fn() };
    const controller = new BriefingController(service as any);
    expect(() =>
      controller.findToday({ user: { modules: ['surveys'] } } as any),
    ).toThrow('No tienes acceso');
    expect(service.findToday).not.toHaveBeenCalled();
  });
  it('usa la identidad de la sesión', () => {
    const service = { findToday: jest.fn() };
    new BriefingController(service as any).findToday({
      user: {
        id: 'PRUEBA',
        companyId: 'empresa',
        name: 'Prueba',
        modules: ['all'],
      },
    } as any);
    expect(service.findToday).toHaveBeenCalledWith(
      'empresa',
      'PRUEBA',
      'Prueba',
    );
  });
});

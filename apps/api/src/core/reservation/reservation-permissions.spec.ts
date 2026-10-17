import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { ReservationController } from './reservation.controller';
import type { ReservationService } from './reservation.service';

/** Quién puede hacer qué en Apartados (administrador vs cajero vs otras cuentas). */

const COMPANY = 'company-1';

function auth(role: string | null, modules: string[] = ['all'], companyId = COMPANY): AuthContext {
  return {
    sessionId: 's1',
    sessionToken: 't',
    expiresAt: new Date(Date.now() + 3600000),
    user: {
      id: 'u1',
      name: 'Prueba',
      email: 'p@example.com',
      companyId,
      role: role ? { id: 'r1', name: role } : null,
      modules,
      homePath: '/pos',
    },
  };
}

function setup() {
  const service = {
    listCompany: jest.fn().mockResolvedValue([]),
    getPolicy: jest.fn().mockResolvedValue({}),
    updatePolicy: jest.fn().mockResolvedValue({}),
    expire: jest.fn().mockResolvedValue({}),
    confirmDeposit: jest.fn().mockResolvedValue({}),
    extend: jest.fn().mockResolvedValue({}),
    release: jest.fn().mockResolvedValue({}),
    complete: jest.fn().mockResolvedValue({}),
  };
  return { service, controller: new ReservationController(service as unknown as ReservationService) };
}

describe('Apartados · permisos', () => {
  const admin = () => auth('Administrador');
  const cashier = () => auth('Cajero');

  describe('el cajero puede cobrar y atender', () => {
    it('consultar apartados y política', async () => {
      const { controller, service } = setup();
      await controller.list(COMPANY, cashier());
      await controller.policy(COMPANY, cashier());
      expect(service.listCompany).toHaveBeenCalledWith(COMPANY);
      expect(service.getPolicy).toHaveBeenCalledWith(COMPANY);
    });

    it('confirmar anticipo y completar (cobrar)', async () => {
      const { controller, service } = setup();
      await controller.confirmDeposit('res-1', { amount: 100, method: 'cash' } as never, cashier());
      await controller.complete('res-1', cashier());
      expect(service.confirmDeposit).toHaveBeenCalledWith(COMPANY, 'res-1', expect.anything(), 'u1');
      expect(service.complete).toHaveBeenCalledWith(COMPANY, 'res-1', 'u1');
    });

    it('recalcular vencimientos', async () => {
      const { controller, service } = setup();
      await controller.expire(COMPANY, cashier());
      expect(service.expire).toHaveBeenCalledWith(COMPANY);
    });
  });

  describe('lo demás es del administrador', () => {
    it('el cajero no extiende plazos', () => {
      const { controller, service } = setup();
      expect(() => controller.extend('res-1', { days: 1 } as never, cashier())).toThrow(ForbiddenException);
      expect(service.extend).not.toHaveBeenCalled();
    });

    it('el cajero no libera mercancía', () => {
      const { controller, service } = setup();
      expect(() => controller.release('res-1', {} as never, cashier())).toThrow(ForbiddenException);
      expect(service.release).not.toHaveBeenCalled();
    });

    it('el cajero no cambia la política de apartados', () => {
      const { controller, service } = setup();
      expect(() => controller.updatePolicy(COMPANY, {} as never, cashier())).toThrow(ForbiddenException);
      expect(service.updatePolicy).not.toHaveBeenCalled();
    });

    it('el administrador sí puede extender, liberar y cambiar la política', async () => {
      const { controller, service } = setup();
      await controller.extend('res-1', { days: 2 } as never, admin());
      await controller.release('res-1', { reason: 'x' } as never, admin());
      await controller.updatePolicy(COMPANY, { enabled: true } as never, admin());
      expect(service.extend).toHaveBeenCalledWith(COMPANY, 'res-1', expect.anything(), 'u1');
      expect(service.release).toHaveBeenCalledWith(COMPANY, 'res-1', expect.anything(), 'u1');
      expect(service.updatePolicy).toHaveBeenCalled();
    });
  });

  describe('aislamiento', () => {
    it('una cuenta sin acceso comercial no ve ni opera apartados', () => {
      const { controller } = setup();
      const noCommerce = auth('Administrador', ['salud']);
      expect(() => controller.list(COMPANY, noCommerce)).toThrow(ForbiddenException);
      expect(() => controller.confirmDeposit('res-1', {} as never, noCommerce)).toThrow(ForbiddenException);
      expect(() => controller.complete('res-1', noCommerce)).toThrow(ForbiddenException);
      expect(() => controller.extend('res-1', { days: 1 } as never, noCommerce)).toThrow(ForbiddenException);
    });

    it('no se puede consultar ni cambiar apartados de otra empresa', () => {
      const { controller, service } = setup();
      expect(() => controller.list('company-2', admin())).toThrow(NotFoundException);
      expect(() => controller.policy('company-2', admin())).toThrow(NotFoundException);
      expect(() => controller.updatePolicy('company-2', {} as never, admin())).toThrow(NotFoundException);
      expect(() => controller.expire('company-2', admin())).toThrow(NotFoundException);
      expect(service.listCompany).not.toHaveBeenCalled();
    });

    it('las acciones por id usan siempre la empresa de la sesión, nunca la del cliente', async () => {
      const { controller, service } = setup();
      await controller.release('res-ajeno', {} as never, admin());
      expect(service.release.mock.calls[0][0]).toBe(COMPANY);
    });
  });
});

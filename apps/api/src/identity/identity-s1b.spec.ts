import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CompanyController } from './company/company.controller';
import { RoleController } from './role/role.controller';
import { VisitController } from '../core/visit/visit.controller';
import { CompanyService } from './company/company.service';
import { RoleService } from './role/role.service';
import { VisitService } from '../core/visit/visit.service';

function auth(role = 'Administrador', companyId = 'company-a'): AuthContext {
  return {
    sessionId: 's',
    sessionToken: 'dummy',
    expiresAt: new Date('2030-01-01'),
    user: {
      id: 'u',
      name: 'Test',
      email: 'test@example.test',
      companyId,
      role: { id: 'r', name: role },
      modules: role === 'encuestas' ? ['surveys'] : ['all'],
      homePath: '/life',
    },
  };
}

describe('S1B controllers and tenant-scoped services', () => {
  it.each([CompanyController, RoleController, VisitController])(
    '%p requires a session',
    (controller) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(
        SessionAuthGuard,
      );
    },
  );
  it('company controller only returns the current company and hides foreign company', () => {
    const findAll = jest.fn();
    const findOne = jest.fn();
    const controller = new CompanyController({ findAll, findOne } as never);
    controller.findAll(auth());
    expect(findAll).toHaveBeenCalledWith('company-a');
    expect(() => controller.findOne('company-b', auth())).toThrow(
      NotFoundException,
    );
    expect(findOne).not.toHaveBeenCalled();
  });
  it('company creation requires administrator privileges', () => {
    const create = jest.fn();
    const controller = new CompanyController({ create } as never);
    expect(() => controller.create({ name: 'X' }, auth('encuestas'))).toThrow(
      ForbiddenException,
    );
    expect(create).not.toHaveBeenCalled();
  });
  it('role lists are tenant-scoped and creation cannot target another company', () => {
    const findAll = jest.fn();
    const create = jest.fn();
    const controller = new RoleController({ findAll, create } as never);
    controller.findAll(auth());
    expect(findAll).toHaveBeenCalledWith('company-a');
    expect(() =>
      controller.create({ name: 'Rol', companyId: 'company-b' }, auth()),
    ).toThrow(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });
  it('visits require commerce and owner company, and manual registration requires administrator', () => {
    const findAll = jest.fn();
    const findByCompany = jest.fn();
    const create = jest.fn();
    const controller = new VisitController({
      findAll,
      findByCompany,
      create,
    } as never);
    expect(() => controller.findAll(auth('encuestas'))).toThrow(
      ForbiddenException,
    );
    controller.findAll(auth());
    expect(findAll).toHaveBeenCalledWith('company-a');
    expect(() => controller.findByCompany('company-b', auth())).toThrow(
      NotFoundException,
    );
    expect(findByCompany).not.toHaveBeenCalled();
    expect(() =>
      controller.create(
        { customerId: 'cust', companyId: 'company-a' },
        auth('cajero'),
      ),
    ).toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });
  it('company, role and visit list queries filter by company', async () => {
    const companyFind = jest.fn().mockResolvedValue([]);
    const roleFind = jest.fn().mockResolvedValue([]);
    const visitFind = jest.fn().mockResolvedValue([]);
    await new CompanyService({
      company: { findMany: companyFind },
    } as never).findAll('company-a');
    await new RoleService({ role: { findMany: roleFind } } as never).findAll(
      'company-a',
    );
    await new VisitService({ visit: { findMany: visitFind } } as never).findAll(
      'company-a',
    );
    expect(companyFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'company-a' } }),
    );
    expect(roleFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company-a' } }),
    );
    expect(visitFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company-a' } }),
    );
  });
  it('foreign customers are not visible via visit lookups', async () => {
    const customerFind = jest.fn().mockResolvedValue(null);
    const visitFind = jest.fn();
    const service = new VisitService({
      customer: { findFirst: customerFind },
      visit: { findMany: visitFind },
    } as never);
    await expect(
      service.findByCustomer('foreign', 'company-a'),
    ).rejects.toThrow(NotFoundException);
    expect(customerFind).toHaveBeenCalledWith({
      where: { id: 'foreign', companyId: 'company-a' },
    });
    expect(visitFind).not.toHaveBeenCalled();
  });
});

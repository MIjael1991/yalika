import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import type { SessionAuthGuard } from '../../auth/session-auth.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import { CommerceAccessGuard } from './commerce-access.guard';
import { cashierMayCall } from './cashier-policy';

function call(method: string, path: string) {
  return cashierMayCall(method, path.split('/').filter(Boolean));
}

describe('Cajero: solo vende y cobra', () => {
  it('puede aplicar una promoción vigente, pero no un descuento escrito a mano', () => {
    const parts = ['discount', 'order', 'o1'];

    expect(
      cashierMayCall('POST', parts, { source: 'promotion', promotionId: 'p1' }),
    ).toBe(true);
    expect(
      cashierMayCall('POST', parts, {
        source: 'manual',
        type: 'percentage',
        value: 90,
      }),
    ).toBe(false);
    // Una promoción sin identificador permitiría escribir tipo y valor.
    expect(
      cashierMayCall('POST', parts, {
        source: 'promotion',
        type: 'percentage',
        value: 90,
      }),
    ).toBe(false);
    expect(cashierMayCall('POST', parts)).toBe(false);
  });

  it.each([
    ['GET', '/catalog/product/company/c1'],
    ['GET', '/catalog/barcode/company/c1/123'],
    ['GET', '/order/company/c1'],
    ['POST', '/order'],
    ['POST', '/order/o1/confirm'],
    ['POST', '/order/o1/cancel'],
    ['POST', '/payment/order/o1'],
    ['POST', '/order-split/order/o1/equal'],
    ['POST', '/customer'],
    ['POST', '/engagement/company/c1/identify'],
    ['POST', '/scratch/company/c1/redeem'],
    ['PATCH', '/dining-table/t1/status'],
    ['GET', '/return/company/c1'],
  ])('puede %s %s', (method, path) => {
    expect(call(method, path)).toBe(true);
  });

  it.each([
    ['POST', '/catalog/product'],
    ['PATCH', '/catalog/product/p1'],
    ['PATCH', '/catalog/product/p1/stock'],
    ['DELETE', '/catalog/product/p1/image/i1'],
    ['POST', '/return'],
    ['POST', '/return/r1/refund'],
    ['POST', '/discount/d1/void'],
    ['POST', '/promotion'],
    ['DELETE', '/promotion/p1'],
    ['POST', '/loyalty-program'],
    ['POST', '/scratch/company/c1/configure'],
    ['GET', '/inventory/item/company/c1'],
    ['POST', '/inventory/movement'],
    ['GET', '/operations/today'],
    ['POST', '/site'],
    ['GET', '/site/company/c1/all'],
    ['POST', '/site-team/site/s1/members'],
    ['POST', '/media/image'],
    ['POST', '/business-assistant/writing'],
    ['PUT', '/recipe/product/p1'],
    ['POST', '/order/company/c1/anything-else'],
  ])('no puede %s %s', (method, path) => {
    expect(call(method, path)).toBe(false);
  });

  function guardFor(roleName: string | null, method: string, path: string) {
    const request = {
      path,
      method,
      params: {},
      body: {},
      query: {},
      auth: {
        user: {
          id: 'u1',
          companyId: 'c1',
          modules: ['all'],
          role: roleName ? { id: 'r1', name: roleName } : null,
        },
      },
    };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const guard = new CommerceAccessGuard(
      {
        canActivate: jest.fn().mockResolvedValue(true),
      } as unknown as SessionAuthGuard,
      {} as unknown as PrismaService,
    );
    return { guard, context };
  }

  it('el guardia rechaza al cajero fuera de su lista, sin importar mayúsculas', async () => {
    const { guard, context } = guardFor('Cajero', 'POST', '/return');
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('el guardia no restringe al administrador ni a roles anteriores', async () => {
    for (const role of ['Administrador', 'Dueño', null]) {
      const { guard, context } = guardFor(role, 'GET', '/operations/today');
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
  });
});

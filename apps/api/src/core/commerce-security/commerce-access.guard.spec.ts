import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SessionAuthGuard } from '../../auth/session-auth.guard';
import { CommerceAccessGuard } from './commerce-access.guard';

function makeHarness(
  path: string,
  params: Record<string, string> = {},
  body: object = {},
  method = 'GET',
  actorCompany = 'company-a',
) {
  const request = {
    path,
    method,
    params,
    body,
    query: {},
    auth: {
      user: { id: 'actor-a', companyId: actorCompany, modules: ['all'] },
    },
  };
  const session = { canActivate: jest.fn().mockResolvedValue(true) };
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue({ companyId: 'company-b' }),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue({ companyId: 'company-a' }),
    },
    site: {
      findUnique: jest.fn().mockResolvedValue({ companyId: 'company-a' }),
    },
  };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const guard = new CommerceAccessGuard(
    session as unknown as SessionAuthGuard,
    prisma as unknown as PrismaService,
  );
  return { guard, context, request, session, prisma };
}

describe('CommerceAccessGuard R6', () => {
  it('does not touch survey endpoints', async () => {
    const h = makeHarness('/survey/some-path');
    expect(await h.guard.canActivate(h.context)).toBe(true);
    expect(h.session.canActivate).not.toHaveBeenCalled();
  });
  it('keeps published storefront API anonymous', async () => {
    const h = makeHarness('/site/public/my-shop', { slug: 'my-shop' });
    expect(await h.guard.canActivate(h.context)).toBe(true);
    expect(h.session.canActivate).not.toHaveBeenCalled();
  });
  it('keeps public club registration anonymous', async () => {
    const h = makeHarness(
      '/engagement/public/my-shop/join',
      { slug: 'my-shop' },
      {},
      'POST',
    );
    expect(await h.guard.canActivate(h.context)).toBe(true);
    expect(h.session.canActivate).not.toHaveBeenCalled();
  });
  it('keeps public scratch play anonymous', async () => {
    const h = makeHarness(
      '/scratch/public/my-shop/play',
      { slug: 'my-shop' },
      {},
      'POST',
    );
    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.session.canActivate).not.toHaveBeenCalled();
  });
  it('requires session to configure scratch campaigns', async () => {
    const h = makeHarness(
      '/scratch/company/company-a/configure',
      { companyId: 'company-a' },
      {},
      'POST',
    );
    h.session.canActivate.mockRejectedValue(new UnauthorizedException());
    await expect(h.guard.canActivate(h.context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('prevents configuring another company scratch campaign', async () => {
    const h = makeHarness(
      '/scratch/company/company-b/configure',
      { companyId: 'company-b' },
      {},
      'POST',
    );
    await expect(h.guard.canActivate(h.context)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('prevents redeeming a scratch prize as another user', async () => {
    const h = makeHarness(
      '/scratch/company/company-a/redeem',
      { companyId: 'company-a' },
      { authorizedById: 'another-user' },
      'POST',
    );
    await expect(h.guard.canActivate(h.context)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('allows signed-in operator to read own scratch campaign', async () => {
    const h = makeHarness('/scratch/company/company-a', {
      companyId: 'company-a',
    });
    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.session.canActivate).toHaveBeenCalledTimes(1);
  });
  it('requires session for private commercial routes', async () => {
    const h = makeHarness('/catalog/product/company/company-a', {
      companyId: 'company-a',
    });
    h.session.canActivate.mockRejectedValue(new UnauthorizedException());
    await expect(h.guard.canActivate(h.context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('rejects a different companyId in URL', async () => {
    const h = makeHarness('/order/company/company-b', {
      companyId: 'company-b',
    });
    await expect(h.guard.canActivate(h.context)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('rejects foreign orders by ID', async () => {
    const h = makeHarness('/order/foreign-id', { id: 'foreign-id' });
    await expect(h.guard.canActivate(h.context)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('rejects a foreign order inside payment route', async () => {
    const h = makeHarness(
      '/payment/order/foreign-id',
      { orderId: 'foreign-id' },
      {},
      'POST',
    );
    await expect(h.guard.canActivate(h.context)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('does not allow impersonating another authorizer', async () => {
    const h = makeHarness(
      '/return',
      {},
      { companyId: 'company-a', authorizedById: 'other' },
      'POST',
    );
    await expect(h.guard.canActivate(h.context)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('allows own product when company matches', async () => {
    const h = makeHarness('/catalog/product/my-product', { id: 'my-product' });
    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
  });
  it('authenticates company-scoped customer listing', async () => {
    const h = makeHarness('/customer');
    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.session.canActivate).toHaveBeenCalled();
  });

  it('requires session for business assistant routes', async () => {
    const h = makeHarness(
      '/business-assistant/interpret',
      {},
      { text: 'ventas hoy' },
      'POST',
    );
    h.session.canActivate.mockRejectedValue(new UnauthorizedException());
    await expect(h.guard.canActivate(h.context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(h.session.canActivate).toHaveBeenCalled();
  });
});

it('PRUEBA bloquea comercio a cuentas solo de encuestas', async () => {
  const h = makeHarness('/catalog/product/product-a', { id: 'product-a' });
  h.request.auth.user.modules = ['surveys'];
  await expect(h.guard.canActivate(h.context)).rejects.toThrow(
    ForbiddenException,
  );
  expect(h.prisma.product.findUnique).not.toHaveBeenCalled();
});

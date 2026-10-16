jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrismaService } from '../../prisma/prisma.service';
import { SiteService } from './site.service';

describe('Yalika site multisite', () => {
  it('creates another page and makes only the first page primary', async () => {
    const tx = {
      site: {
        create: jest.fn().mockResolvedValue({ id: 'site-2', companyId: 'company-1' }),
      },
      siteMember: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'company-1' }) },
      user: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'user-1' })
          .mockResolvedValueOnce({ role: { name: 'Usuario general', status: 'active' } }),
      },
      siteMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'membership-owner' }),
      },
      site: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;

    const service = new SiteService(prisma);
    await service.create(
      { name: 'Página 2', slug: 'pagina-2', companyId: 'company-1' },
      'user-1',
      'company-1',
    );

    expect(tx.site.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPrimary: false, companyId: 'company-1' }),
      }),
    );
    expect(tx.siteMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        siteId: 'site-2',
        userId: 'user-1',
        role: 'owner',
      }),
    });
  });

  it('lists only pages assigned to a non-admin user', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: { name: 'Usuario general', status: 'active' } }),
      },
      siteMember: {
        findMany: jest.fn().mockResolvedValue([{ siteId: 'site-a' }]),
      },
      site: { findMany },
    } as unknown as PrismaService;
    const service = new SiteService(prisma);
    await service.findAllByCompany('company-1', 'user-1', 'company-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-1', id: { in: ['site-a'] } },
      }),
    );
  });
});

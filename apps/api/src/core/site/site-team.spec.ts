jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SiteService } from './site.service';
import { SiteTeamService } from './site-team.service';

describe('Yaleka site team', () => {
  it('blocks a second active collaborator with the current limit', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-2',
          name: 'Colaborador',
          email: 'colaborador@example.test',
        }),
      },
      siteMember: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;
    const siteService = {
      requirePermission: jest.fn().mockResolvedValue({ site: { id: 'site-1' }, role: 'owner' }),
    } as unknown as SiteService;
    const service = new SiteTeamService(prisma, siteService);

    await expect(
      service.add(
        'site-1',
        { email: 'colaborador@example.test', role: 'editor' },
        'owner-1',
        'company-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

import { ConflictException } from '@nestjs/common';
import { SiteService } from './site.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('R8.4 publicación segura de secciones', () => {
  const date = new Date('2026-10-07T12:00:00.000Z');
  const args = ['s1', 'u1', 'c1'] as const;

  function setup(status = 'published', count = 1) {
    const site = { id: 's1', companyId: 'c1', status, updatedAt: date };
    const tx = {
      site: {
        updateMany: jest.fn().mockResolvedValue({ count }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...site, sections: [] }),
      },
      siteSection: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      site: { findFirst: jest.fn().mockResolvedValue(site) },
      user: { findFirst: jest.fn().mockResolvedValue({ role: { name: 'admin', status: 'active' } }) },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    return { service: new SiteService(prisma as unknown as PrismaService), prisma, tx };
  }

  it('rechaza cambios publicados sin confirmación', async () => {
    const { service, prisma } = setup();
    await expect(service.replaceSections('s1', { sections: [] }, false, 'u1', 'c1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('exige confirmación al publicar por primera vez', async () => {
    const { service, prisma } = setup('draft');
    await expect(service.replaceSections('s1', { sections: [], publish: true }, false, 'u1', 'c1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza una versión antigua antes de la transacción', async () => {
    const { service, prisma, tx } = setup();
    await expect(service.replaceSections('s1', {
      sections: [], expectedUpdatedAt: '2026-10-06T12:00:00.000Z',
    }, true, 'u1', 'c1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.siteSection.deleteMany).not.toHaveBeenCalled();
  });

  it('bloquea modificaciones concurrentes antes de reemplazar secciones', async () => {
    const { service, tx } = setup('published', 0);
    await expect(service.replaceSections('s1', {
      sections: [], expectedUpdatedAt: date.toISOString(),
    }, true, 'u1', 'c1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.siteSection.deleteMany).not.toHaveBeenCalled();
  });

  it('publica contenido y estado en la misma transacción', async () => {
    const { service, prisma, tx } = setup('draft');
    await service.replaceSections('s1', {
      sections: [{ type: 'text', title: 'Texto', content: { text: 'Hola' } }],
      expectedUpdatedAt: date.toISOString(), publish: true,
    }, true, 'u1', 'c1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.site.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 's1', companyId: 'c1', status: 'draft', updatedAt: date },
      data: expect.objectContaining({ status: 'published' }),
    }));
    expect(tx.siteSection.createMany).toHaveBeenCalled();
  });

  it('conserva guardar borradores sin publicarlos', async () => {
    const { service, tx } = setup('draft');
    await service.replaceSections('s1', { sections: [] }, false, 'u1', 'c1');
    expect(tx.site.updateMany.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('rechaza sitio que no pertenece a la empresa antes de escribir', async () => {
    const { service, prisma } = setup('draft');
    prisma.site.findFirst.mockResolvedValueOnce(null);
    await expect(service.replaceSections('s1', { sections: [] }, false, 'u1', 'c1'))
      .rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

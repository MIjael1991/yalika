// YALEKA_R10B_SITE_SERVICE
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { UpdateSiteSectionsDto } from './dto/update-site-sections.dto';
import { canSiteRole, type SitePermission } from './site-permissions';

function normalizeRoleName(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

@Injectable()
export class SiteService {
  constructor(private readonly prisma: PrismaService) {}

  private async isCompanyAdministrator(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId, status: 'active' },
      select: { role: { select: { name: true, status: true } } },
    });
    const roleName = normalizeRoleName(user?.role?.name);
    return user?.role?.status !== 'inactive' &&
      ['administrador', 'administrator', 'admin'].includes(roleName);
  }

  private async assertSessionCompany(requestedCompanyId: string, authCompanyId: string) {
    if (!requestedCompanyId || requestedCompanyId !== authCompanyId) {
      throw new NotFoundException('La empresa o la página no existe');
    }
  }

  async requirePermission(
    siteId: string,
    userId: string,
    companyId: string,
    permission: SitePermission,
  ) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, companyId },
      select: { id: true, companyId: true, name: true, slug: true },
    });
    if (!site) throw new NotFoundException('La página no existe');

    if (await this.isCompanyAdministrator(userId, companyId)) {
      return { site, role: 'company_admin' };
    }

    const member = await this.prisma.siteMember.findUnique({
      where: { siteId_userId: { siteId, userId } },
    });

    if (!member || member.companyId !== companyId || member.status !== 'active') {
      throw new ForbiddenException('No tienes acceso a esta página');
    }
    if (!canSiteRole(member.role, permission)) {
      throw new ForbiddenException('Tu permiso en esta página no permite esta acción');
    }
    return { site, role: member.role };
  }

  async create(
    dto: CreateSiteDto,
    actorUserId: string,
    authCompanyId: string,
  ) {
    await this.assertSessionCompany(dto.companyId, authCompanyId);

    const [company, actor] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: dto.companyId } }),
      this.prisma.user.findFirst({
        where: { id: actorUserId, companyId: dto.companyId, status: 'active' },
        select: { id: true },
      }),
    ]);
    if (!company) throw new NotFoundException('La empresa no existe');
    if (!actor) throw new ForbiddenException('La cuenta no pertenece a esta empresa');

    const existingCompanySites = await this.prisma.site.count({
      where: { companyId: dto.companyId },
    });

    if (existingCompanySites > 0) {
      const companyAdmin = await this.isCompanyAdministrator(
        actorUserId,
        dto.companyId,
      );
      if (!companyAdmin) {
        const ownership = await this.prisma.siteMember.findFirst({
          where: {
            companyId: dto.companyId,
            userId: actorUserId,
            role: 'owner',
            status: 'active',
          },
          select: { id: true },
        });
        if (!ownership) {
          throw new ForbiddenException(
            'Sólo el propietario del negocio puede crear otra página',
          );
        }
      }
    }

    if (dto.catalogId) {
      const catalog = await this.prisma.commerceCatalog.findFirst({
        where: { id: dto.catalogId, companyId: dto.companyId, status: 'active' },
      });
      if (!catalog) throw new NotFoundException('El catálogo no pertenece a la empresa');
    }

    const existingSlug = await this.prisma.site.findUnique({
      where: { slug: dto.slug.trim() },
      select: { id: true },
    });
    if (existingSlug) {
      throw new ConflictException('Esta dirección ya está siendo utilizada');
    }

    return this.prisma.$transaction(async (tx) => {
      const site = await tx.site.create({
        data: {
          name: dto.name.trim(),
          slug: dto.slug.trim(),
          template: dto.template ?? 'hero',
          primaryColor: dto.primaryColor,
          accentColor: dto.accentColor,
          backgroundType: dto.backgroundType ?? 'color',
          backgroundValue: dto.backgroundValue,
          logoUrl: dto.logoUrl,
          heroImageUrl: dto.heroImageUrl,
          heroTitle: dto.heroTitle?.trim(),
          heroSubtitle: dto.heroSubtitle?.trim(),
          heroButtonText: dto.heroButtonText?.trim(),
          heroButtonUrl: dto.heroButtonUrl,
          announcementText: dto.announcementText?.trim(),
          whatsappPhone: dto.whatsappPhone?.trim(),
          facebookUrl: dto.facebookUrl?.trim(),
          instagramUrl: dto.instagramUrl?.trim(),
          tiktokUrl: dto.tiktokUrl?.trim(),
          extraLinkLabel: dto.extraLinkLabel?.trim(),
          extraLinkUrl: dto.extraLinkUrl?.trim(),
          isPrimary: existingCompanySites === 0,
          companyId: dto.companyId,
          catalogId: dto.catalogId,
          sections: {
            create: [
              { type: 'hero', title: 'Inicio', sortOrder: 0 },
              { type: 'promotions', title: 'Promociones', sortOrder: 10 },
              { type: 'catalog', title: 'Productos', sortOrder: 20 },
              { type: 'loyalty', title: 'Recompensas', sortOrder: 30 },
              { type: 'location', title: 'Ubicación', sortOrder: 40 },
              { type: 'contact', title: 'Contacto', sortOrder: 50 },
            ],
          },
        },
        include: { sections: { orderBy: { sortOrder: 'asc' } } },
      });

      await tx.siteMember.create({
        data: {
          siteId: site.id,
          companyId: dto.companyId,
          userId: actorUserId,
          role: 'owner',
          status: 'active',
          invitedByUserId: actorUserId,
        },
      });
      return site;
    });
  }

  async findAllByCompany(
    companyId: string,
    userId: string,
    authCompanyId: string,
  ) {
    await this.assertSessionCompany(companyId, authCompanyId);
    const admin = await this.isCompanyAdministrator(userId, companyId);
    let siteIds: string[] | undefined;
    if (!admin) {
      const memberships = await this.prisma.siteMember.findMany({
        where: { companyId, userId, status: 'active' },
        select: { siteId: true },
      });
      siteIds = memberships.map((item) => item.siteId);
      if (siteIds.length === 0) return [];
    }

    return this.prisma.site.findMany({
      where: {
        companyId,
        ...(siteIds ? { id: { in: siteIds } } : {}),
      },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findByCompany(
    companyId: string,
    userId: string,
    authCompanyId: string,
  ) {
    const sites = await this.findAllByCompany(companyId, userId, authCompanyId);
    const site = sites[0];
    if (!site) throw new NotFoundException('La empresa todavía no tiene sitio');
    return site;
  }

  async findOneByCompany(
    companyId: string,
    siteId: string,
    userId: string,
    authCompanyId: string,
  ) {
    await this.assertSessionCompany(companyId, authCompanyId);
    await this.requirePermission(siteId, userId, companyId, 'view');
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, companyId },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!site) throw new NotFoundException('La página no existe');
    return site;
  }

  async findPublic(slug: string) {
    const site = await this.prisma.site.findFirst({
      where: { slug, status: 'published' },
      include: {
        company: { select: { id: true, name: true } },
        sections: {
          where: { enabled: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!site) throw new NotFoundException('El sitio no existe');
    return site;
  }

  async update(
    id: string,
    dto: UpdateSiteDto,
    confirmedLiveUpdate: boolean,
    actorUserId: string,
    companyId: string,
  ) {
    await this.requirePermission(id, actorUserId, companyId, 'edit');
    const site = await this.prisma.site.findFirst({ where: { id, companyId } });
    if (!site) throw new NotFoundException('El sitio no existe');
    if (site.status === 'published' && !confirmedLiveUpdate) {
      throw new ConflictException(
        'Esta página está publicada: confirma expresamente los cambios visibles.',
      );
    }

    if (dto.catalogId !== undefined) {
      const catalog = await this.prisma.commerceCatalog.findFirst({
        where: { id: dto.catalogId, companyId, status: 'active' },
      });
      if (!catalog) throw new NotFoundException('El catálogo no pertenece a la empresa');
    }

    const slug = dto.slug?.trim();
    if (slug && slug !== site.slug) {
      const existing = await this.prisma.site.findUnique({ where: { slug } });
      if (existing) throw new ConflictException('Esta dirección ya está siendo utilizada');
    }

    return this.prisma.site.update({
      where: { id },
      data: {
        name: dto.name === undefined ? undefined : dto.name.trim(),
        slug,
        template: dto.template,
        catalogId: dto.catalogId,
        primaryColor: dto.primaryColor,
        accentColor: dto.accentColor,
        backgroundType: dto.backgroundType,
        backgroundValue: dto.backgroundValue,
        logoUrl: dto.logoUrl,
        heroImageUrl: dto.heroImageUrl,
        heroTitle: dto.heroTitle === undefined ? undefined : dto.heroTitle.trim(),
        heroSubtitle:
          dto.heroSubtitle === undefined ? undefined : dto.heroSubtitle.trim(),
        heroButtonText:
          dto.heroButtonText === undefined ? undefined : dto.heroButtonText.trim(),
        heroButtonUrl: dto.heroButtonUrl,
        announcementText:
          dto.announcementText === undefined
            ? undefined
            : dto.announcementText.trim() || null,
        whatsappPhone:
          dto.whatsappPhone === undefined
            ? undefined
            : dto.whatsappPhone.trim() || null,
        facebookUrl:
          dto.facebookUrl === undefined ? undefined : dto.facebookUrl.trim() || null,
        instagramUrl:
          dto.instagramUrl === undefined ? undefined : dto.instagramUrl.trim() || null,
        tiktokUrl:
          dto.tiktokUrl === undefined ? undefined : dto.tiktokUrl.trim() || null,
        extraLinkLabel:
          dto.extraLinkLabel === undefined
            ? undefined
            : dto.extraLinkLabel.trim() || null,
        extraLinkUrl:
          dto.extraLinkUrl === undefined ? undefined : dto.extraLinkUrl.trim() || null,
      },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async replaceSections(
    id: string,
    dto: UpdateSiteSectionsDto,
    confirmedLiveUpdate: boolean,
    actorUserId: string,
    companyId: string,
  ) {
    await this.requirePermission(id, actorUserId, companyId, 'edit');
    const site = await this.prisma.site.findFirst({
      where: { id, companyId },
    });
    if (!site) throw new NotFoundException('El sitio no existe');

    if ((site.status === 'published' || dto.publish === true) && !confirmedLiveUpdate) {
      throw new ConflictException('Confirma los cambios visibles antes de publicar o guardar.');
    }
    if (dto.expectedUpdatedAt &&
        new Date(dto.expectedUpdatedAt).getTime() !== site.updatedAt.getTime()) {
      throw new ConflictException('El sitio fue actualizado. Recarga antes de guardar.');
    }

    const allowed = new Set([
      'hero', 'banner', 'catalog', 'promotions', 'gallery', 'video', 'menu',
      'text', 'loyalty', 'location', 'contact',
    ]);
    for (const section of dto.sections) {
      if (!allowed.has(section.type)) {
        throw new ConflictException('Sección no permitida');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // La condición de versión y estado se evalúa antes de tocar secciones.
      const update = await tx.site.updateMany({
        where: { id, companyId, status: site.status, updatedAt: site.updatedAt },
        data: {
          updatedAt: new Date(),
          ...(dto.publish === true
            ? { status: 'published', publishedAt: new Date() }
            : {}),
        },
      });
      if (update.count !== 1) {
        throw new ConflictException('El sitio cambió durante el guardado. Recarga la página.');
      }
      await tx.siteSection.deleteMany({ where: { siteId: id } });
      if (dto.sections.length) {
        await tx.siteSection.createMany({
          data: dto.sections.map((section, index) => ({
            siteId: id,
            type: section.type,
            title: section.title?.trim() || null,
            enabled: section.enabled ?? true,
            sortOrder: section.sortOrder ?? index * 10,
            layout: section.layout?.trim() || 'default',
            content: section.content ? (section.content as any) : undefined,
          })),
        });
      }
      return tx.site.findUniqueOrThrow({
        where: { id },
        include: { sections: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async publish(id: string, actorUserId: string, companyId: string) {
    await this.requirePermission(id, actorUserId, companyId, 'publish');
    return this.prisma.site.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
    });
  }

  async unpublish(id: string, actorUserId: string, companyId: string) {
    await this.requirePermission(id, actorUserId, companyId, 'publish');
    return this.prisma.site.update({
      where: { id },
      data: { status: 'draft' },
    });
  }

  async setPrimary(id: string, actorUserId: string, companyId: string) {
    await this.requirePermission(id, actorUserId, companyId, 'publish');
    return this.prisma.$transaction(async (tx) => {
      await tx.site.updateMany({
        where: { companyId, isPrimary: true },
        data: { isPrimary: false },
      });
      return tx.site.update({ where: { id }, data: { isPrimary: true } });
    });
  }
}

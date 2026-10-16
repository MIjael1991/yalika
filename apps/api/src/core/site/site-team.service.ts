import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SiteService } from './site.service';
import {
  isAssignableSiteRole,
  SITE_COLLABORATOR_LIMIT,
} from './site-permissions';
import { AddSiteMemberDto, UpdateSiteMemberDto } from './site-team.dto';

@Injectable()
export class SiteTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteService: SiteService,
  ) {}

  private async activeCollaborators(siteId: string) {
    return this.prisma.siteMember.count({
      where: {
        siteId,
        status: 'active',
        role: { not: 'owner' },
      },
    });
  }

  async list(siteId: string, actorUserId: string, companyId: string) {
    const access = await this.siteService.requirePermission(
      siteId,
      actorUserId,
      companyId,
      'manage_team',
    );
    const members = await this.prisma.siteMember.findMany({
      where: { siteId, companyId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: members.map((item) => item.userId) }, companyId },
      select: { id: true, name: true, email: true, status: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return {
      site: access.site,
      collaboratorLimit: SITE_COLLABORATOR_LIMIT,
      members: members.map((member) => ({
        ...member,
        user: byId.get(member.userId) ?? null,
      })),
    };
  }

  async add(
    siteId: string,
    dto: AddSiteMemberDto,
    actorUserId: string,
    companyId: string,
  ) {
    await this.siteService.requirePermission(
      siteId,
      actorUserId,
      companyId,
      'manage_team',
    );
    if (!isAssignableSiteRole(dto.role)) {
      throw new BadRequestException('Permiso de página no válido');
    }
    const email = dto.email.trim().toLowerCase();
    const target = await this.prisma.user.findFirst({
      where: { email, companyId, status: 'active' },
      select: { id: true, name: true, email: true },
    });
    if (!target) {
      throw new NotFoundException(
        'No encontré un usuario activo de este negocio con ese correo',
      );
    }
    const existing = await this.prisma.siteMember.findUnique({
      where: { siteId_userId: { siteId, userId: target.id } },
    });
    if (existing?.role === 'owner') {
      throw new BadRequestException('El propietario ya tiene acceso total');
    }
    if (!existing || existing.status !== 'active') {
      const active = await this.activeCollaborators(siteId);
      if (active >= SITE_COLLABORATOR_LIMIT) {
        throw new BadRequestException(
          `Por ahora esta página admite ${SITE_COLLABORATOR_LIMIT} colaborador adicional. La estructura ya permite ampliar el límite después.`,
        );
      }
    }

    const member = await this.prisma.siteMember.upsert({
      where: { siteId_userId: { siteId, userId: target.id } },
      update: {
        role: dto.role,
        status: 'active',
        invitedByUserId: actorUserId,
      },
      create: {
        siteId,
        companyId,
        userId: target.id,
        role: dto.role,
        status: 'active',
        invitedByUserId: actorUserId,
      },
    });
    return { member, user: target };
  }

  async update(
    siteId: string,
    memberId: string,
    dto: UpdateSiteMemberDto,
    actorUserId: string,
    companyId: string,
  ) {
    await this.siteService.requirePermission(
      siteId,
      actorUserId,
      companyId,
      'manage_team',
    );
    const member = await this.prisma.siteMember.findFirst({
      where: { id: memberId, siteId, companyId },
    });
    if (!member) throw new NotFoundException('El acceso no existe');
    if (member.role === 'owner') {
      throw new BadRequestException('El acceso del propietario no se puede desactivar aquí');
    }
    if (dto.role && !isAssignableSiteRole(dto.role)) {
      throw new BadRequestException('Permiso de página no válido');
    }
    if (dto.status === 'active' && member.status !== 'active') {
      const active = await this.activeCollaborators(siteId);
      if (active >= SITE_COLLABORATOR_LIMIT) {
        throw new BadRequestException(
          `Por ahora esta página admite ${SITE_COLLABORATOR_LIMIT} colaborador adicional.`,
        );
      }
    }
    return this.prisma.siteMember.update({
      where: { id: member.id },
      data: { role: dto.role, status: dto.status },
    });
  }
}

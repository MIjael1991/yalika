import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { validateNewPasswordPair } from '../../auth/account-security.helpers';
import { cleanPermissions } from '../../auth/permissions';
import { cashierRoleName } from '../../auth/tenant-policy';
import { hashPassword } from '../../auth/password';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCashierDto,
  ResetCashierPasswordDto,
  SetCashierPermissionsDto,
  SetCashierStatusDto,
} from './team.dto';

const CASHIER_ROLE_LABEL = 'Cajero';

const memberSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { name: true } },
  memberships: { select: { companyId: true, permissions: true } },
} as const;

/** La pantalla recibe los permisos extra de la empresa, no la lista cruda. */
function withPermissions<
  T extends { memberships?: { companyId: string; permissions: string[] }[] },
>(user: T, companyId: string) {
  const { memberships, ...rest } = user;
  const membership = (memberships ?? []).find(
    (item) => item.companyId === companyId,
  );
  return { ...rest, permissions: cleanPermissions(membership?.permissions) };
}

/**
 * Equipo de una empresa: el administrador da de alta a sus cajeros y los
 * desactiva o les cambia la contraseña. Un cajero nunca puede crear cuentas.
 */
@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const users = await this.prisma.user.findMany({
      where: { companyId },
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => withPermissions(user, companyId));
  }

  async createCashier(
    companyId: string,
    actorId: string,
    dto: CreateCashierDto,
  ) {
    const problem = validateNewPasswordPair(dto.password, dto.confirmPassword);
    if (problem) throw new BadRequestException(problem);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }

    const passwordHash = await hashPassword(dto.password);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const role =
        (await tx.role.findFirst({
          where: {
            companyId,
            name: { equals: cashierRoleName, mode: 'insensitive' },
          },
          select: { id: true },
        })) ??
        (await tx.role.create({
          data: {
            name: CASHIER_ROLE_LABEL,
            description: 'Vende y cobra en caja',
            status: 'active',
            companyId,
          },
          select: { id: true },
        }));

      const user = await tx.user.create({
        data: {
          name: dto.name.trim().replace(/\s+/g, ' '),
          email,
          status: 'active',
          passwordHash,
          passwordChangedAt: now,
          companyId,
          roleId: role.id,
        },
        select: memberSelect,
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          companyId,
          status: 'active',
          permissions: [],
          invitedByUserId: actorId,
        },
      });

      await tx.event.create({
        data: {
          type: 'team.cashier_created',
          source: 'yalika.team',
          entityType: 'user',
          entityId: user.id,
          data: { module: 'yalika', createdBy: actorId },
          companyId,
        },
      });

      return withPermissions(
        { ...user, memberships: [{ companyId, permissions: [] }] },
        companyId,
      );
    });
  }

  /** Solo se administran cuentas de cajero de la propia empresa. */
  private async cashierOf(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
        role: { name: { equals: cashierRoleName, mode: 'insensitive' } },
      },
      select: { id: true },
    });

    if (!user) throw new NotFoundException('El cajero no existe');
  }

  async setStatus(
    companyId: string,
    actorId: string,
    userId: string,
    dto: SetCashierStatusDto,
  ) {
    await this.cashierOf(companyId, userId);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { status: dto.status },
        select: memberSelect,
      });

      if (dto.status === 'inactive') {
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.event.create({
        data: {
          type: `team.cashier_${dto.status === 'active' ? 'activated' : 'deactivated'}`,
          source: 'yalika.team',
          entityType: 'user',
          entityId: userId,
          data: { module: 'yalika', changedBy: actorId },
          companyId,
        },
      });

      return withPermissions(user, companyId);
    });
  }

  /** El administrador activa o quita permisos extra de un cajero. */
  async setPermissions(
    companyId: string,
    actorId: string,
    userId: string,
    dto: SetCashierPermissionsDto,
  ) {
    await this.cashierOf(companyId, userId);
    const permissions = cleanPermissions(dto.permissions);

    return this.prisma.$transaction(async (tx) => {
      await tx.membership.upsert({
        where: { userId_companyId: { userId, companyId } },
        create: {
          userId,
          companyId,
          status: 'active',
          permissions,
          invitedByUserId: actorId,
        },
        update: { permissions },
      });

      await tx.event.create({
        data: {
          type: 'team.cashier_permissions_changed',
          source: 'yalika.team',
          entityType: 'user',
          entityId: userId,
          data: { module: 'yalika', changedBy: actorId, permissions },
          companyId,
        },
      });

      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: memberSelect,
      });
      return withPermissions(user, companyId);
    });
  }

  async resetPassword(
    companyId: string,
    actorId: string,
    userId: string,
    dto: ResetCashierPasswordDto,
  ) {
    const problem = validateNewPasswordPair(dto.password, dto.confirmPassword);
    if (problem) throw new BadRequestException(problem);

    await this.cashierOf(companyId, userId);
    const passwordHash = await hashPassword(dto.password);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      // La contraseña anterior ya no debe seguir abriendo sesiones.
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.event.create({
        data: {
          type: 'team.cashier_password_reset',
          source: 'yalika.team',
          entityType: 'user',
          entityId: userId,
          data: { module: 'yalika', changedBy: actorId },
          companyId,
        },
      });
    });

    return { ok: true };
  }
}

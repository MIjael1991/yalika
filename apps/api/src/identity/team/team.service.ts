import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { validateNewPasswordPair } from '../../auth/account-security.helpers';
import { cashierRoleName } from '../../auth/tenant-policy';
import { hashPassword } from '../../auth/password';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCashierDto,
  ResetCashierPasswordDto,
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
} as const;

/**
 * Equipo de una empresa: el administrador da de alta a sus cajeros y los
 * desactiva o les cambia la contraseña. Un cajero nunca puede crear cuentas.
 */
@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId },
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });
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

      return user;
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

      return user;
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

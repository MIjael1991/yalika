import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { verifyMemberAccessToken } from '../engagement/ticket-claim';
import { ConfigureScratchDto } from './dto/configure-scratch.dto';
import { PlayScratchDto } from './dto/play-scratch.dto';
import { RedeemScratchDto } from './dto/redeem-scratch.dto';

@Injectable()
export class ScratchService {
  constructor(private readonly prisma: PrismaService) {}

  private async activeCampaign(companyId: string, loyaltyProgramId?: string) {
    const now = new Date();

    return this.prisma.scratchCampaign.findFirst({
      where: {
        companyId,
        loyaltyProgramId,
        status: 'active',
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: {
        prizes: {
          where: { status: 'active' },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    return this.prisma.scratchCampaign.findFirst({
      where: { companyId },
      include: {
        prizes: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { attempts: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async configure(companyId: string, dto: ConfigureScratchDto) {
    const [company, program] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
      }),
      this.prisma.loyaltyProgram.findUnique({
        where: { id: dto.loyaltyProgramId },
      }),
    ]);

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    if (!program || program.companyId !== companyId) {
      throw new BadRequestException('El Club QR no pertenece a esta empresa');
    }

    if (program.status !== 'active') {
      throw new BadRequestException('Primero activa el Club QR');
    }

    const totalProbability = dto.prizes.reduce(
      (total, prize) => total + prize.probabilityPercent,
      0,
    );

    if (totalProbability > 100) {
      throw new BadRequestException(
        'La suma de probabilidades no puede superar 100%',
      );
    }

    const now = new Date();

    if (program.endsAt <= now) {
      throw new BadRequestException('El Club QR ya terminó');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.scratchCampaign.updateMany({
        where: {
          companyId,
          status: { in: ['active', 'paused'] },
        },
        data: {
          status: 'closed',
          closedAt: now,
        },
      });

      return tx.scratchCampaign.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          status: 'active',
          validDays: dto.validDays,
          startsAt: now,
          endsAt: program.endsAt,
          companyId,
          loyaltyProgramId: program.id,
          prizes: {
            create: dto.prizes.map((prize, index) => ({
              name: prize.name.trim(),
              description: prize.description?.trim(),
              probabilityBasisPoints: prize.probabilityPercent * 100,
              stock: prize.stock ?? null,
              remaining: prize.stock ?? null,
              sortOrder: index,
              companyId,
            })),
          },
        },
        include: {
          prizes: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: { attempts: true },
          },
        },
      });
    });
  }

  async getMemberStatus(
    companyId: string,
    loyaltyProgramId: string,
    customerId: string,
  ) {
    const campaign = await this.activeCampaign(companyId, loyaltyProgramId);

    if (!campaign) {
      return null;
    }

    const visits = await this.prisma.visit.findMany({
      where: {
        companyId,
        customerId,
        loyaltyProgramId,
        source: 'order',
        status: 'confirmed',
      },
      select: { id: true },
    });
    const visitIds = visits.map((visit) => visit.id);
    const [usedAttempts, latestAttempt] = await Promise.all([
      visitIds.length > 0
        ? this.prisma.scratchAttempt.count({
            where: {
              visitId: { in: visitIds },
            },
          })
        : Promise.resolve(0),
      this.prisma.scratchAttempt.findFirst({
        where: {
          campaignId: campaign.id,
          customerId,
        },
        include: { prize: true },
        orderBy: { playedAt: 'desc' },
      }),
    ]);

    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      availableAttempts: Math.max(visits.length - usedAttempts, 0),
      possiblePrizes: campaign.prizes.map((prize) => ({
        id: prize.id,
        name: prize.name,
      })),
      latestAttempt: latestAttempt
        ? {
            status: latestAttempt.status,
            claimCode: latestAttempt.claimCode,
            expiresAt: latestAttempt.expiresAt,
            prize: latestAttempt.prize
              ? { name: latestAttempt.prize.name }
              : null,
          }
        : null,
    };
  }

  async play(slug: string, dto: PlayScratchDto) {
    const site = await this.prisma.site.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });

    if (!site || site.status !== 'published') {
      throw new NotFoundException('Esta página no está publicada');
    }

    if (
      !verifyMemberAccessToken(dto.memberToken, dto.customerId, site.companyId)
    ) {
      throw new BadRequestException(
        'Vuelve a identificarte para usar tu raspadito',
      );
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });

    if (!customer || customer.companyId !== site.companyId) {
      throw new NotFoundException('El cliente no existe');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const campaign = await tx.scratchCampaign.findFirst({
        where: {
          companyId: site.companyId,
          status: 'active',
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!campaign) {
        throw new NotFoundException(
          'No hay un raspadito activo en este momento',
        );
      }

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "scratch_campaigns"
        WHERE "id" = ${campaign.id}
        FOR UPDATE
      `;

      const visits = await tx.visit.findMany({
        where: {
          companyId: site.companyId,
          customerId: customer.id,
          loyaltyProgramId: campaign.loyaltyProgramId,
          source: 'order',
          status: 'confirmed',
        },
        select: { id: true },
        orderBy: { occurredAt: 'asc' },
      });
      const visitIds = visits.map((visit) => visit.id);
      const used = visitIds.length
        ? await tx.scratchAttempt.findMany({
            where: {
              visitId: { in: visitIds },
            },
            select: { visitId: true },
          })
        : [];
      const usedIds = new Set(used.map((attempt) => attempt.visitId));
      const eligibleVisit = visits.find((visit) => !usedIds.has(visit.id));

      if (!eligibleVisit) {
        throw new BadRequestException(
          'No tienes intentos disponibles. Cada compra pagada concede uno.',
        );
      }

      const prizes = await tx.scratchPrize.findMany({
        where: {
          campaignId: campaign.id,
          status: 'active',
        },
        orderBy: { sortOrder: 'asc' },
      });
      const draw = randomInt(1, 10001);
      let upperLimit = 0;
      let selectedPrize: (typeof prizes)[number] | null = null;

      for (const prize of prizes) {
        upperLimit += prize.probabilityBasisPoints;

        if (draw <= upperLimit) {
          if (prize.remaining === null || prize.remaining > 0) {
            selectedPrize = prize;
          }
          break;
        }
      }

      const expiresAt = selectedPrize
        ? new Date(now.getTime() + campaign.validDays * 86_400_000)
        : null;
      const claimCode = selectedPrize
        ? `ORION-${randomBytes(5).toString('hex').toUpperCase()}`
        : null;
      const attempt = await tx.scratchAttempt.create({
        data: {
          status: selectedPrize ? 'won' : 'not_won',
          claimCode,
          expiresAt,
          visitId: eligibleVisit.id,
          customerId: customer.id,
          companyId: site.companyId,
          campaignId: campaign.id,
          prizeId: selectedPrize?.id,
        },
        include: { prize: true },
      });

      if (selectedPrize && selectedPrize.remaining !== null) {
        await tx.scratchPrize.update({
          where: { id: selectedPrize.id },
          data: { remaining: { decrement: 1 } },
        });
      }

      return {
        attempt,
        loyaltyProgramId: campaign.loyaltyProgramId,
      };
    });

    const scratch = await this.getMemberStatus(
      site.companyId,
      result.loyaltyProgramId,
      customer.id,
    );

    return {
      result: result.attempt.prize ? 'won' : 'not_won',
      prize: result.attempt.prize
        ? {
            name: result.attempt.prize.name,
            description: result.attempt.prize.description,
          }
        : null,
      claimCode: result.attempt.claimCode,
      expiresAt: result.attempt.expiresAt,
      scratch,
    };
  }

  async redeem(companyId: string, dto: RedeemScratchDto) {
    const claimCode = dto.claimCode.trim().toUpperCase();

    const result = await this.prisma.$transaction(async (tx) => {
      const authorizedBy = await tx.user.findUnique({
        where: { id: dto.authorizedById },
      });

      if (
        !authorizedBy ||
        authorizedBy.companyId !== companyId ||
        authorizedBy.status !== 'active'
      ) {
        throw new BadRequestException(
          'El usuario autorizador no es válido para esta empresa',
        );
      }

      const attemptToLock = await tx.scratchAttempt.findUnique({
        where: { claimCode },
        select: { id: true, companyId: true },
      });

      if (!attemptToLock || attemptToLock.companyId !== companyId) {
        throw new NotFoundException('El código del premio no existe');
      }

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "scratch_attempts"
        WHERE "id" = ${attemptToLock.id}
        FOR UPDATE
      `;

      const attempt = await tx.scratchAttempt.findUnique({
        where: { id: attemptToLock.id },
        include: {
          customer: true,
          prize: true,
          visit: true,
        },
      });

      if (!attempt) {
        throw new NotFoundException('El código del premio no existe');
      }

      if (attempt.status === 'redeemed') {
        throw new BadRequestException('Este premio ya fue canjeado');
      }

      if (attempt.status !== 'won' || !attempt.prize) {
        throw new BadRequestException('Este código no tiene un premio vigente');
      }

      if (attempt.visit.status !== 'confirmed') {
        throw new BadRequestException(
          'La compra relacionada fue anulada o reembolsada',
        );
      }

      if (attempt.expiresAt && attempt.expiresAt < new Date()) {
        await tx.scratchAttempt.update({
          where: { id: attempt.id },
          data: { status: 'cancelled' },
        });

        if (attempt.prize.remaining !== null) {
          await tx.scratchPrize.update({
            where: { id: attempt.prize.id },
            data: { remaining: { increment: 1 } },
          });
        }

        return { expired: true as const };
      }

      const redeemed = await tx.scratchAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'redeemed',
          redeemedAt: new Date(),
          redeemedById: authorizedBy.id,
        },
      });

      return {
        expired: false as const,
        data: {
          id: redeemed.id,
          claimCode: redeemed.claimCode,
          status: redeemed.status,
          redeemedAt: redeemed.redeemedAt,
          customer: {
            id: attempt.customer.id,
            name: attempt.customer.name,
            phone: attempt.customer.phone,
          },
          prize: {
            id: attempt.prize.id,
            name: attempt.prize.name,
            description: attempt.prize.description,
          },
          authorizedBy: {
            id: authorizedBy.id,
            name: authorizedBy.name,
          },
        },
      };
    });

    if (result.expired) {
      throw new BadRequestException('Este premio ya venció');
    }

    return result.data;
  }
}

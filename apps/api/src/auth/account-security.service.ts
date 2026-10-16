import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword, consumePasswordCheck } from './password';
import {
  PASSWORD_RESET_MINUTES,
  createRecoveryKey,
  hashOpaqueToken,
  recoveryKeyHash,
  validateNewPasswordPair,
} from './account-security.helpers';
import { publicBaseUrl } from '../common/public-url';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const GENERIC_RESET_MESSAGE =
  'Si el correo corresponde a una cuenta activa y la recuperación por correo está disponible, recibirás instrucciones para continuar.';

const getPublicUrl = publicBaseUrl;

function emailDeliveryAvailable() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
    process.env.YALIKA_EMAIL_FROM?.trim() &&
    getPublicUrl(),
  );
}

async function sendResetEmail(to: string, resetUrl: string) {
  if (!emailDeliveryAvailable()) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.YALIKA_EMAIL_FROM,
      to: [to],
      subject: 'Recupera tu contraseña de Yalika',
      text: `Abre este enlace para crear una nueva contraseña. El enlace vence en ${PASSWORD_RESET_MINUTES} minutos: ${resetUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Recupera tu acceso a Yalika</h2><p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#22d3ee;color:#062033;text-decoration:none;border-radius:10px;font-weight:700">Crear nueva contraseña</a></p><p>Este enlace vence en ${PASSWORD_RESET_MINUTES} minutos y sólo puede usarse una vez.</p><p>Si tú no hiciste la solicitud, puedes ignorar este correo.</p></div>`,
    }),
  }).catch(() => null);

  if (!response?.ok) {
    console.error(
      'Yalika password reset email failed',
      response?.status ?? 'network',
    );
    return false;
  }

  return true;
}

@Injectable()
export class AccountSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  getPublicRecoveryStatus() {
    return {
      ok: true,
      emailDeliveryAvailable: emailDeliveryAvailable(),
      recoveryKeySupported: true,
      passwordMinLength: 10,
    };
  }

  async getSecurityStatus(userId: string) {
    const [user, key] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { passwordChangedAt: true, email: true },
      }),
      this.prisma.authRecoveryKey.findUnique({
        where: { userId },
        select: { createdAt: true, updatedAt: true },
      }),
    ]);

    if (!user) throw new UnauthorizedException('Tu sesión ya no es válida.');

    return {
      ok: true,
      email: user.email,
      emailDeliveryAvailable: emailDeliveryAvailable(),
      recoveryKeyConfigured: Boolean(key),
      recoveryKeyUpdatedAt: key?.updatedAt ?? null,
      passwordChangedAt: user.passwordChangedAt,
      passwordMinLength: 10,
    };
  }

  async generateRecoveryKey(userId: string) {
    const raw = createRecoveryKey();
    const keyHash = recoveryKeyHash(userId, raw);

    await this.prisma.authRecoveryKey.upsert({
      where: { userId },
      update: { keyHash },
      create: {
        userId,
        keyHash,
      },
    });

    return {
      ok: true,
      recoveryKey: raw,
      warning:
        'Guárdala ahora en un lugar seguro. Yalika no puede volver a mostrar esta misma clave.',
    };
  }

  async changePassword(
    userId: string,
    currentSessionToken: string,
    dto: ChangePasswordDto,
  ) {
    const validation = validateNewPasswordPair(
      dto.newPassword,
      dto.confirmPassword,
    );
    if (validation) throw new BadRequestException(validation);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException(
        'No pudimos validar tu contraseña actual.',
      );
    }

    const currentMatches = await verifyPassword(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentMatches) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }

    if (await verifyPassword(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual.',
      );
    }

    const passwordHash = await hashPassword(dto.newPassword);
    const now = new Date();
    const currentTokenHash = hashOpaqueToken(currentSessionToken);

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

      if (dto.closeOtherSessions !== false) {
        await tx.authSession.updateMany({
          where: {
            userId,
            revokedAt: null,
            tokenHash: { not: currentTokenHash },
          },
          data: { revokedAt: now },
        });
      }
    });

    return {
      ok: true,
      message:
        dto.closeOtherSessions === false
          ? 'Contraseña actualizada.'
          : 'Contraseña actualizada. Las demás sesiones quedaron cerradas.',
    };
  }

  async requestPasswordReset(emailInput: string, requestedIp?: string) {
    const email = emailInput.trim().toLowerCase();
    const now = new Date();
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        status: 'active',
      },
      select: { id: true, email: true },
    });

    if (!user) {
      await consumePasswordCheck('yalika-password-reset-padding');
      return {
        ok: true,
        message: GENERIC_RESET_MESSAGE,
        emailDeliveryAvailable: emailDeliveryAvailable(),
      };
    }

    const recent = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(now.getTime() - 60_000) },
      },
      select: { id: true },
    });

    if (!recent && emailDeliveryAvailable()) {
      const rawToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(
        now.getTime() + PASSWORD_RESET_MINUTES * 60_000,
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        });
        await tx.passwordResetToken.create({
          data: {
            id: randomUUID(),
            tokenHash: hashOpaqueToken(rawToken),
            expiresAt,
            requestedIp: requestedIp?.slice(0, 100),
            userId: user.id,
          },
        });
      });

      const resetUrl = `${getPublicUrl()}/recuperar?token=${encodeURIComponent(rawToken)}`;
      const sent = await sendResetEmail(user.email, resetUrl);
      if (!sent) {
        await this.prisma.passwordResetToken.updateMany({
          where: { tokenHash: hashOpaqueToken(rawToken), usedAt: null },
          data: { usedAt: new Date() },
        });
      }
    }

    return {
      ok: true,
      message: GENERIC_RESET_MESSAGE,
      emailDeliveryAvailable: emailDeliveryAvailable(),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const validation = validateNewPasswordPair(
      dto.newPassword,
      dto.confirmPassword,
    );
    if (validation) throw new BadRequestException(validation);

    const now = new Date();
    let userId = '';
    let resetTokenId: string | null = null;
    let usedRecoveryKey = false;

    if (dto.token?.trim()) {
      const row = await this.prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashOpaqueToken(dto.token.trim()) },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
          user: { select: { status: true } },
        },
      });

      if (
        !row ||
        row.usedAt ||
        row.expiresAt <= now ||
        row.user.status !== 'active'
      ) {
        throw new BadRequestException(
          'El enlace ya no es válido. Solicita uno nuevo o usa tu clave de recuperación.',
        );
      }

      userId = row.userId;
      resetTokenId = row.id;
    } else if (dto.email?.trim() && dto.recoveryKey?.trim()) {
      const user = await this.prisma.user.findFirst({
        where: {
          email: {
            equals: dto.email.trim().toLowerCase(),
            mode: 'insensitive',
          },
          status: 'active',
        },
        select: { id: true },
      });

      if (user) {
        const key = await this.prisma.authRecoveryKey.findUnique({
          where: { userId: user.id },
          select: { keyHash: true },
        });
        if (key?.keyHash === recoveryKeyHash(user.id, dto.recoveryKey)) {
          userId = user.id;
          usedRecoveryKey = true;
        }
      }

      if (!userId) {
        await consumePasswordCheck(dto.newPassword);
        throw new BadRequestException('No pudimos validar la recuperación.');
      }
    } else {
      throw new BadRequestException(
        'Usa el enlace enviado a tu correo o escribe tu correo y clave de recuperación.',
      );
    }

    const passwordHash = await hashPassword(dto.newPassword);

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
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
      if (resetTokenId) {
        await tx.passwordResetToken.update({
          where: { id: resetTokenId },
          data: { usedAt: now },
        });
      }
      if (usedRecoveryKey) {
        await tx.authRecoveryKey.deleteMany({ where: { userId } });
      }
    });

    return {
      ok: true,
      message: 'Contraseña actualizada. Ya puedes entrar a Yalika.',
    };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  consumePasswordCheck,
  createSessionToken,
  hashSessionToken,
  verifyPassword,
} from './password';
import { homePathForRole, modulesForRole } from './module-access';

const sessionUserSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  companyId: true,
  role: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

function getSessionDurationMs() {
  const configuredHours = Number(process.env.YALIKA_SESSION_HOURS ?? 12);
  const hours = Number.isFinite(configuredHours)
    ? Math.min(Math.max(configuredHours, 1), 720)
    : 12;

  return hours * 60 * 60 * 1000;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(
    dto: LoginDto,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user?.passwordHash || user.status !== 'active') {
      await consumePasswordCheck(dto.password);
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const passwordMatches = await verifyPassword(
      dto.password,
      user.passwordHash,
    );
    const now = new Date();

    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException(
        'No se pudo iniciar sesión. Espera unos minutos y vuelve a intentarlo.',
      );
    }

    if (!passwordMatches) {
      const failedLoginAttempts = user.failedLoginAttempts + 1;
      const lockedUntil =
        failedLoginAttempts >= 5
          ? new Date(now.getTime() + 15 * 60 * 1000)
          : null;

      await this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          failedLoginAttempts: lockedUntil ? 0 : failedLoginAttempts,
          lockedUntil,
        },
      });

      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const token = createSessionToken();
    const expiresAt = new Date(now.getTime() + getSessionDurationMs());

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          expiresAt: {
            lte: now,
          },
        },
        data: {
          revokedAt: now,
        },
      });

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: now,
        },
      });

      return tx.authSession.create({
        data: {
          tokenHash: hashSessionToken(token),
          expiresAt,
          ipAddress: metadata.ipAddress?.slice(0, 100),
          userAgent: metadata.userAgent?.slice(0, 500),
          userId: user.id,
        },
      });
    });

    const modules = modulesForRole(user.role?.name);
    const homePath = homePathForRole(user.role?.name);

    return {
      token,
      expiresAt,
      sessionId: session.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        companyId: user.companyId,
        role: user.role,
        modules,
        homePath,
      },
    };
  }

  async authenticate(token: string) {
    const session = await this.prisma.authSession.findUnique({
      where: {
        tokenHash: hashSessionToken(token),
      },
      include: {
        user: {
          select: sessionUserSelect,
        },
      },
    });
    const now = new Date();

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'active'
    ) {
      throw new UnauthorizedException('Tu sesión terminó. Vuelve a ingresar.');
    }

    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await this.prisma.authSession.update({
        where: {
          id: session.id,
        },
        data: {
          lastSeenAt: now,
        },
      });
    }

    const modules = modulesForRole(session.user.role?.name);
    const homePath = homePathForRole(session.user.role?.name);

    return {
      sessionId: session.id,
      sessionToken: token,
      expiresAt: session.expiresAt,
      user: {
        ...session.user,
        modules,
        homePath,
      },
    };
  }

  async logout(token: string) {
    await this.prisma.authSession.updateMany({
      where: {
        tokenHash: hashSessionToken(token),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}

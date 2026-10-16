import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { validateNewPasswordPair } from './account-security.helpers';
import { hashPassword } from './password';
import { RegisterDto } from './dto/register.dto';

const PUBLIC_ACCOUNT_ROLE = 'Administrador';

function registrationEnabled() {
  const configured =
    process.env.YALEKA_PUBLIC_REGISTRATION?.trim().toLowerCase();
  if (!configured) return process.env.NODE_ENV !== 'production';
  return configured === 'true';
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function companyNameFor(organizationName: string, email: string) {
  const suffix = createHash('sha256')
    .update(email)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();
  const base = clean(organizationName).slice(0, 120);
  return `${base} Â· ${suffix}`;
}

@Injectable()
export class PublicRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  getStatus() {
    return {
      enabled: registrationEnabled(),
      passwordMinLength: 10,
      module: 'yalika',
    };
  }

  async register(dto: RegisterDto) {
    if (!registrationEnabled()) {
      throw new ForbiddenException(
        'El registro pÃºblico estÃ¡ temporalmente cerrado. Intenta mÃ¡s tarde.',
      );
    }

    if (!dto.acceptTerms) {
      throw new BadRequestException(
        'Debes aceptar los tÃ©rminos para crear tu cuenta.',
      );
    }

    const validation = validateNewPasswordPair(
      dto.password,
      dto.confirmPassword,
    );
    if (validation) throw new BadRequestException(validation);

    const email = dto.email.trim().toLowerCase();
    const name = clean(dto.name);
    const organizationName = clean(dto.organizationName);

    const existing = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseÃ±a.',
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const now = new Date();
    const companyName = companyNameFor(organizationName, email);

    const result = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          status: 'active',
        },
        select: { id: true, name: true },
      });

      const role = await tx.role.create({
        data: {
          name: PUBLIC_ACCOUNT_ROLE,
          description: 'Administrador de su espacio Yalika',
          status: 'active',
          companyId: company.id,
        },
        select: { id: true, name: true },
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          status: 'active',
          passwordHash,
          passwordChangedAt: now,
          companyId: company.id,
          roleId: role.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          companyId: true,
        },
      });

      await tx.event.create({
        data: {
          type: 'account.registered',
          source: 'yaleka.web',
          entityType: 'user',
          entityId: user.id,
          data: {
            module: 'yalika',
            registration: 'public',
          },
          companyId: company.id,
        },
      });

      return { company, role, user };
    });

    return {
      ok: true,
      message: 'Cuenta Yalika creada. Ya puedes ingresar y usar los módulos disponibles para tu cuenta.',
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
      },
      homePath: '/',
    };
  }
}


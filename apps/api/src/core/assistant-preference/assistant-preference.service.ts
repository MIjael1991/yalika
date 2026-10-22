import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAssistantPreferenceDto } from './dto/update-assistant-preference.dto';

const preferenceSelect = {
  preferredName: true,
  automaticLocale: true,
  voiceLocale: true,
  voiceName: true,
  voiceRate: true,
} as const;

/** Módulos con interruptor: en producción solo si la variable es "true"; fuera, salvo "false". */
function featureOn(name: string) {
  const value = process.env[name]?.trim();
  return process.env.NODE_ENV === 'production'
    ? value === 'true'
    : value !== 'false';
}

function defaultPreferredName(currentName: string) {
  return currentName.trim().split(/\s+/)[0] || 'Usuario';
}

@Injectable()
export class AssistantPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(userId: string, currentName: string) {
    const preference = await this.prisma.assistantPreference.findUnique({
      where: { userId },
      select: preferenceSelect,
    });

    if (preference) {
      return preference;
    }

    return {
      preferredName: defaultPreferredName(currentName),
      automaticLocale: true,
      voiceLocale: 'es-MX',
      voiceName: null,
      voiceRate: 0.95,
    };
  }

  async updateForUser(
    userId: string,
    currentName: string,
    dto: UpdateAssistantPreferenceDto,
  ) {
    const preferredName =
      dto.preferredName === undefined
        ? undefined
        : dto.preferredName.trim() || defaultPreferredName(currentName);
    const voiceName =
      dto.voiceName === undefined ? undefined : dto.voiceName.trim() || null;
    const data = {
      ...(preferredName !== undefined ? { preferredName } : {}),
      ...(dto.automaticLocale !== undefined
        ? { automaticLocale: dto.automaticLocale }
        : {}),
      ...(dto.voiceLocale !== undefined
        ? { voiceLocale: dto.voiceLocale }
        : {}),
      ...(voiceName !== undefined ? { voiceName } : {}),
      ...(dto.voiceRate !== undefined ? { voiceRate: dto.voiceRate } : {}),
    };

    return this.prisma.assistantPreference.upsert({
      where: { userId },
      create: {
        userId,
        preferredName: preferredName ?? defaultPreferredName(currentName),
        automaticLocale: dto.automaticLocale ?? true,
        voiceLocale: dto.voiceLocale ?? 'es-MX',
        voiceName: voiceName ?? null,
        voiceRate: dto.voiceRate ?? 0.95,
      },
      update: data,
      select: preferenceSelect,
    });
  }
  private requireGeneralAccess(modules: readonly string[]) {
    if (!modules.includes('all')) {
      throw new ForbiddenException('No tienes acceso a estos servicios');
    }
  }

  async findVisibleForUser(userId: string, modules: readonly string[]) {
    this.requireGeneralAccess(modules);

    const preference = await this.prisma.assistantPreference.findUnique({
      where: { userId },
      select: { visibleModules: true },
    });

    return {
      visibleModules: preference?.visibleModules ?? null,
      // Availability is distinct from user visibility and never grants access.
      availableModules: [
        'surveys',
        'life',
        'pos',
        'sites',
        ...(featureOn('CLINICAL_MODULE_ENABLED') ? ['health'] : []),
        ...(featureOn('YALIKA_VETERINARIA_ENABLED') ? ['veterinaria'] : []),
        ...(featureOn('YALIKA_PRESENTE_ENABLED') ? ['presente'] : []),
      ],
    };
  }

  async updateVisibleForUser(
    userId: string,
    modules: readonly string[],
    visibleModules: string[],
  ) {
    this.requireGeneralAccess(modules);

    const valid = new Set([
      'surveys',
      'life',
      'pos',
      'sites',
      'health',
      'veterinaria',
      'presente',
    ]);

    if (
      !Array.isArray(visibleModules) ||
      visibleModules.length > valid.size ||
      new Set(visibleModules).size !== visibleModules.length ||
      !visibleModules.every((id) => typeof id === 'string' && valid.has(id))
    ) {
      throw new BadRequestException('La seleccion de servicios no es valida');
    }

    return this.prisma.assistantPreference.upsert({
      where: { userId },
      create: {
        userId,
        visibleModules,
      },
      update: {
        visibleModules,
      },
      select: {
        visibleModules: true,
      },
    });
  }
}

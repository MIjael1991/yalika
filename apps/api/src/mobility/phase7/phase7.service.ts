import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MobilityPhase6Service } from '../phase6/phase6.service';
import {
  ConfirmVoiceCommandDto,
  QuickRideRequestDto,
  UpdateExperiencePreferenceDto,
  VoiceInterpretDto,
} from './phase7.dto';

@Injectable()
export class MobilityPhase7Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phase6: MobilityPhase6Service,
  ) {}

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private normalize(text: string) {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[Â¿?Â¡!.,;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // YALIKA_PHASE8_PATCH_V1
  private extractAmount(text: string) {
    const textValue = this.normalize(text);
    const digits = textValue.match(/(?:\$\s*)?\b(\d{1,4}(?:[.,]\d{1,2})?)\b/);
    if (digits) return this.money(Number(digits[1].replace(',', '.')));
    const tens: Record<string, number> = {
      veinte: 20,
      treinta: 30,
      cuarenta: 40,
      cincuenta: 50,
      sesenta: 60,
      setenta: 70,
      ochenta: 80,
      noventa: 90,
    };
    const ones: Record<string, number> = {
      uno: 1,
      un: 1,
      dos: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
      seis: 6,
      siete: 7,
      ocho: 8,
      nueve: 9,
    };
    const wordMatch = textValue.match(
      /\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)(?:\s+y\s+(uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?\b/,
    );
    if (wordMatch)
      return tens[wordMatch[1]] + (wordMatch[2] ? ones[wordMatch[2]] : 0);
    if (/\b(cien|ciento)\b/.test(textValue)) return 100;
    return null;
  }

  private intentOf(text: string, subjectType: string) {
    const t = this.normalize(text);

    if (
      t.includes('ayuda') ||
      t.includes('que puedo decir') ||
      t.includes('comandos')
    ) {
      return { intent: 'HELP', confidence: 0.99 };
    }

    if (
      t.includes('seguridad') ||
      t.includes('emergencia') ||
      t.includes('auxilio') ||
      t.includes('peligro')
    ) {
      return { intent: 'OPEN_SAFETY', confidence: 0.99 };
    }

    if (
      t.includes('comparte') ||
      t.includes('compartir viaje') ||
      t.includes('manda mi viaje')
    ) {
      return { intent: 'OPEN_SHARE', confidence: 0.97 };
    }

    if (
      t.includes('cuanto recomiendas') ||
      t.includes('que precio recomiendas') ||
      t.includes('que tarifa recomiendas') ||
      t.includes('recomiendame un precio') ||
      t.includes('recomiendame una tarifa') ||
      t.includes('precio recomendado') ||
      t.includes('tarifa recomendada') ||
      t.includes('cuanto deberia pagar')
    ) {
      return { intent: 'GET_RECOMMENDATION', confidence: 0.98 };
    }

    if (
      t.includes('conductores cerca') ||
      t.includes('quien esta cerca') ||
      t.includes('buscar conductor') ||
      t.includes('choferes cerca')
    ) {
      return { intent: 'GET_CANDIDATES', confidence: 0.96 };
    }

    if (
      subjectType === 'DRIVER' &&
      (t === 'acepto' ||
        t.includes('acepto el viaje') ||
        t.includes('aceptar viaje') ||
        t.includes('acepto la oferta'))
    ) {
      return { intent: 'DRIVER_ACCEPT', confidence: 0.99 };
    }

    if (
      subjectType === 'DRIVER' &&
      (t.includes('contraoferta') ||
        t.includes('contraoferto') ||
        t.includes('yo cobro') ||
        t.includes('quiero cobrar'))
    ) {
      return { intent: 'DRIVER_COUNTER', confidence: 0.96 };
    }

    if (
      subjectType === 'PASSENGER' &&
      (t.includes('acepto la propuesta') ||
        t.includes('aceptar propuesta') ||
        t.includes('acepto la oferta del conductor'))
    ) {
      return { intent: 'PASSENGER_ACCEPT_PROPOSAL', confidence: 0.98 };
    }

    if (
      subjectType === 'PASSENGER' &&
      (t.includes('quiero pagar') ||
        t.includes('ofrezco') ||
        t.includes('mi oferta') ||
        t.includes('sube a') ||
        t.includes('baja a'))
    ) {
      return { intent: 'CHANGE_PASSENGER_OFFER', confidence: 0.96 };
    }

    if (
      subjectType === 'PASSENGER' &&
      (t.includes('quiero un viaje') ||
        t.includes('quiero ir') ||
        t.includes('llevame') ||
        t.includes('llevarme'))
    ) {
      return { intent: 'CREATE_RIDE', confidence: 0.88 };
    }

    return { intent: 'UNKNOWN', confidence: 0.25 };
  }

  capabilities() {
    return {
      language: 'es-MX',
      voicePipeline: {
        input:
          'El frontend convierte voz a texto y envia el texto a este interprete.',
        backend:
          'Yalika interpreta intencion, valida contexto y exige confirmacion antes de acciones sensibles.',
        output:
          'La respuesta spokenResponse puede ser leida por TTS del dispositivo.',
      },
      examples: {
        passenger: [
          'Yalika, quiero pagar 70',
          'Que precio recomiendas',
          'Muestrame conductores cerca',
          'Acepto la propuesta',
          'Comparte mi viaje',
          'Abre seguridad',
        ],
        driver: ['Acepto el viaje', 'Contraoferta 70', 'Abre seguridad'],
      },
      safetyRule:
        'Cambiar dinero, aceptar una propuesta o emparejar un viaje requiere confirmacion.',
      notYetAutomatic: [
        'Llamar a policia/911',
        'Enviar SMS reales',
        'Geocodificar una direccion solo por nombre sin proveedor de mapas',
      ],
    };
  }

  /**
   * El sujeto de la voz/preferencias debe ser quien tiene la sesión:
   * PASSENGER = su propio userId; DRIVER = el perfil de conductor que le pertenece.
   */
  private async isSubject(
    actorUserId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<boolean> {
    if (subjectType === 'PASSENGER') return subjectId === actorUserId;
    if (subjectType === 'DRIVER') {
      const driver = await this.prisma.mobilityDriver.findUnique({
        where: { id: subjectId },
        select: { userId: true },
      });
      return driver?.userId === actorUserId;
    }
    return false;
  }

  private async assertSubject(
    actorUserId: string,
    subjectType: string,
    subjectId: string,
  ) {
    if (!['PASSENGER', 'DRIVER'].includes(subjectType)) {
      throw new BadRequestException('Tipo de usuario no valido.');
    }
    if (!(await this.isSubject(actorUserId, subjectType, subjectId))) {
      throw new ForbiddenException(
        'Solo puedes usar tu propia cuenta de pasajero o conductor.',
      );
    }
  }

  async preferenceFor(
    actorUserId: string,
    subjectType: string,
    subjectId: string,
  ) {
    await this.assertSubject(actorUserId, subjectType, subjectId);
    return this.preference(subjectType, subjectId);
  }

  private async preference(subjectType: string, subjectId: string) {
    const existing = await this.prisma.mobilityExperiencePreference.findUnique({
      where: {
        subjectType_subjectId: {
          subjectType,
          subjectId,
        },
      },
    });
    if (existing) return existing;

    return this.prisma.mobilityExperiencePreference.create({
      data: {
        subjectType,
        subjectId,
      },
    });
  }

  async updatePreference(
    actorUserId: string,
    dto: UpdateExperiencePreferenceDto,
  ) {
    await this.assertSubject(actorUserId, dto.subjectType, dto.subjectId);
    return this.prisma.mobilityExperiencePreference.upsert({
      where: {
        subjectType_subjectId: {
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
        },
      },
      create: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        language: dto.language ?? 'es-MX',
        voiceEnabled: dto.voiceEnabled ?? true,
        spokenConfirmations: dto.spokenConfirmations ?? true,
        fareMode: dto.fareMode ?? 'BALANCED',
        searchRadiusKm: dto.searchRadiusKm ?? 8,
        simpleMode: dto.simpleMode ?? true,
        largeControls: dto.largeControls ?? false,
        reduceMotion: dto.reduceMotion ?? false,
      },
      update: {
        language: dto.language,
        voiceEnabled: dto.voiceEnabled,
        spokenConfirmations: dto.spokenConfirmations,
        fareMode: dto.fareMode,
        searchRadiusKm: dto.searchRadiusKm,
        simpleMode: dto.simpleMode,
        largeControls: dto.largeControls,
        reduceMotion: dto.reduceMotion,
      },
    });
  }

  async quickRide(actorUserId: string, dto: QuickRideRequestDto) {
    if (dto.passengerUserId !== actorUserId) {
      throw new ForbiddenException(
        'Solo puedes pedir viajes con tu propia cuenta de pasajero.',
      );
    }
    const pref = await this.preference('PASSENGER', dto.passengerUserId);
    const mode = dto.mode ?? pref.fareMode ?? 'BALANCED';

    const created = await this.phase6.createNegotiation({
      passengerUserId: dto.passengerUserId,
      originAddress: dto.originAddress,
      originLat: dto.originLat,
      originLng: dto.originLng,
      destinationAddress: dto.destinationAddress,
      destinationLat: dto.destinationLat,
      destinationLng: dto.destinationLng,
      city: dto.city,
      trafficLevel: dto.trafficLevel,
      proposedFare: dto.proposedFare,
      clientRequestId: dto.clientRequestId,
    });

    const requestId = created.request.id;
    const recommendation = await this.phase6.recommendation(requestId);

    if (dto.proposedFare === undefined && mode !== 'BALANCED') {
      const target =
        mode === 'ECONOMY'
          ? recommendation.reasonableFare
          : recommendation.fastMatchFare;

      await this.phase6.passengerOffer(requestId, {
        passengerUserId: dto.passengerUserId,
        amount: target,
        clientRequestId: dto.clientRequestId
          ? `${dto.clientRequestId}-${mode.toLowerCase()}`
          : undefined,
        note: `Modo rapido Yalika: ${mode}`,
      });
    }

    await this.prisma.mobilityNegotiationContext.upsert({
      where: { requestId },
      create: {
        requestId,
        city: dto.city,
        requestedMode: mode,
        createdByVoice: dto.createdByVoice ?? false,
        preferredSearchRadiusKm: pref.searchRadiusKm,
      },
      update: {
        city: dto.city,
        requestedMode: mode,
        createdByVoice: dto.createdByVoice ?? false,
        preferredSearchRadiusKm: pref.searchRadiusKm,
      },
    });

    return {
      ...(await this.phase6.getNegotiation(requestId)),
      experience: {
        mode,
        simpleMode: pref.simpleMode,
        voiceEnabled: pref.voiceEnabled,
        searchRadiusKm: pref.searchRadiusKm,
      },
    };
  }

  private async executeCommand(command: any) {
    const payload = (command.payload ?? {}) as Record<string, any>;

    switch (command.intent) {
      case 'GET_RECOMMENDATION':
        if (!command.requestId) {
          throw new BadRequestException(
            'Falta requestId para consultar recomendacion.',
          );
        }
        return this.phase6.recommendation(command.requestId);

      case 'GET_CANDIDATES':
        if (!command.requestId) {
          throw new BadRequestException(
            'Falta requestId para buscar conductores.',
          );
        }
        return this.phase6.candidates(command.requestId, {
          radiusKm: Number(payload.radiusKm ?? 8),
          limit: 10,
        });

      case 'CHANGE_PASSENGER_OFFER':
        if (!command.requestId || !command.amount) {
          throw new BadRequestException(
            'Falta viaje activo o importe de la oferta.',
          );
        }
        return this.phase6.passengerOffer(command.requestId, {
          passengerUserId: command.subjectId,
          amount: command.amount,
          clientRequestId: `voice-${command.id}`,
          note: 'Oferta confirmada por voz',
        });

      case 'DRIVER_COUNTER':
        if (!command.requestId || !command.amount) {
          throw new BadRequestException(
            'Falta viaje activo o importe de contraoferta.',
          );
        }
        return this.phase6.driverCounter(command.requestId, {
          driverId: command.subjectId,
          amount: command.amount,
          etaMinutes: Number(payload.etaMinutes ?? 7),
          clientRequestId: `voice-${command.id}`,
          note: 'Contraoferta confirmada por voz',
        });

      case 'DRIVER_ACCEPT':
        if (!command.requestId) {
          throw new BadRequestException('Falta viaje activo.');
        }
        return this.phase6.driverAccept(command.requestId, {
          driverId: command.subjectId,
          etaMinutes: Number(payload.etaMinutes ?? 7),
          clientRequestId: `voice-${command.id}`,
          note: 'Aceptacion confirmada por voz',
        });

      case 'PASSENGER_ACCEPT_PROPOSAL':
        if (!command.requestId || !command.proposalId) {
          throw new BadRequestException(
            'Falta la propuesta concreta que se quiere aceptar.',
          );
        }
        return this.phase6.acceptProposal(
          command.requestId,
          command.proposalId,
          {
            passengerUserId: command.subjectId,
          },
        );

      case 'CREATE_RIDE':
        if (
          !payload.originAddress ||
          payload.originLat === undefined ||
          payload.originLng === undefined ||
          !payload.destinationAddress ||
          payload.destinationLat === undefined ||
          payload.destinationLng === undefined
        ) {
          throw new BadRequestException(
            'La voz necesita coordenadas ya resueltas por el mapa para crear el viaje.',
          );
        }
        return this.quickRide(command.subjectId, {
          passengerUserId: command.subjectId,
          originAddress: payload.originAddress,
          originLat: Number(payload.originLat),
          originLng: Number(payload.originLng),
          destinationAddress: payload.destinationAddress,
          destinationLat: Number(payload.destinationLat),
          destinationLng: Number(payload.destinationLng),
          city: payload.city,
          trafficLevel: payload.trafficLevel,
          proposedFare: command.amount ?? undefined,
          clientRequestId: `voice-ride-${command.id}`,
          createdByVoice: true,
        });

      default:
        return {
          noExecution: true,
          intent: command.intent,
        };
    }
  }

  async interpret(actorUserId: string, dto: VoiceInterpretDto) {
    await this.assertSubject(actorUserId, dto.subjectType, dto.subjectId);

    if (
      dto.subjectType === 'PASSENGER' &&
      dto.passengerUserId !== undefined &&
      dto.passengerUserId !== actorUserId
    ) {
      throw new ForbiddenException(
        'El pasajero debe ser quien tiene la sesion.',
      );
    }
    if (
      dto.subjectType === 'DRIVER' &&
      dto.driverId !== undefined &&
      dto.driverId !== dto.subjectId
    ) {
      throw new ForbiddenException(
        'El conductor debe ser quien tiene la sesion.',
      );
    }
    if (dto.subjectType === 'PASSENGER' && dto.requestId) {
      const request = await this.prisma.mobilityNegotiationRequest.findUnique({
        where: { id: dto.requestId },
        select: { passengerUserId: true },
      });
      if (!request || request.passengerUserId !== actorUserId) {
        throw new NotFoundException('Negociacion no encontrada.');
      }
    }

    const pref = await this.preference(dto.subjectType, dto.subjectId);
    if (!pref.voiceEnabled) {
      throw new ConflictException(
        'Los comandos por voz estan desactivados para este usuario.',
      );
    }

    const normalizedText = this.normalize(dto.text);
    if (
      ['confirmar', 'si confirmo', 'si confirmar'].includes(normalizedText) ||
      ['cancelar', 'no cancelar', 'no confirmo'].includes(normalizedText)
    ) {
      const pending = await this.prisma.mobilityVoiceCommand.findFirst({
        where: {
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
          status: 'CONFIRMATION_REQUIRED',
          expiresAt: { gt: new Date() },
          ...(dto.requestId ? { requestId: dto.requestId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!pending)
        throw new BadRequestException(
          'No hay accion pendiente de confirmacion.',
        );
      const confirm = ['confirmar', 'si confirmo', 'si confirmar'].includes(
        normalizedText,
      );
      return this.confirm(actorUserId, pending.id, { confirm });
    }
    const classified = this.intentOf(dto.text, dto.subjectType);
    const amount = this.extractAmount(dto.text);

    let requiresConfirmation = false;
    let spokenResponse = '';
    let frontendAction: Record<string, unknown> | null = null;

    switch (classified.intent) {
      case 'HELP':
        spokenResponse =
          'Puedes pedirme precio recomendado, conductores cercanos, cambiar tu oferta, aceptar, contraofertar, compartir el viaje o abrir seguridad.';
        break;
      case 'OPEN_SAFETY':
        spokenResponse = 'Abriendo el centro de seguridad.';
        frontendAction = {
          type: 'OPEN_SAFETY_CENTER',
          requestId: dto.requestId,
        };
        break;
      case 'OPEN_SHARE':
        spokenResponse = 'Abriendo las opciones para compartir tu viaje.';
        frontendAction = { type: 'OPEN_SHARE_TRIP', requestId: dto.requestId };
        break;
      case 'GET_RECOMMENDATION':
        spokenResponse = 'Consultando el precio recomendado.';
        break;
      case 'GET_CANDIDATES':
        spokenResponse = 'Buscando conductores cercanos.';
        break;
      case 'CHANGE_PASSENGER_OFFER':
        if (!amount) {
          spokenResponse =
            'Dime el importe. Por ejemplo: quiero pagar 70 pesos.';
        } else {
          requiresConfirmation = true;
          spokenResponse = `Vas a cambiar tu oferta a ${amount} pesos. Di confirmar para continuar.`;
        }
        break;
      case 'DRIVER_COUNTER':
        if (!amount) {
          spokenResponse =
            'Dime el importe de la contraoferta. Por ejemplo: contraoferta 70.';
        } else {
          requiresConfirmation = true;
          spokenResponse = `Vas a contraofertar ${amount} pesos. Di confirmar para continuar.`;
        }
        break;
      case 'DRIVER_ACCEPT':
        requiresConfirmation = true;
        spokenResponse =
          'Vas a aceptar la oferta actual del pasajero. Di confirmar para continuar.';
        break;
      case 'PASSENGER_ACCEPT_PROPOSAL':
        requiresConfirmation = true;
        spokenResponse =
          'Vas a aceptar esta propuesta del conductor. Di confirmar para continuar.';
        break;
      case 'CREATE_RIDE':
        requiresConfirmation = true;
        spokenResponse = amount
          ? `Preparare el viaje con una oferta de ${amount} pesos. Di confirmar para continuar.`
          : 'Preparare el viaje con la recomendacion de Yalika. Di confirmar para continuar.';
        break;
      default:
        spokenResponse =
          'No entendi ese comando. Puedes decir: que precio recomiendas, quiero pagar 70, conductores cerca o abre seguridad.';
    }

    const command = await this.prisma.mobilityVoiceCommand.create({
      data: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        rawText: dto.text,
        normalizedText,
        intent: classified.intent,
        confidence: classified.confidence,
        requiresConfirmation,
        status: requiresConfirmation ? 'CONFIRMATION_REQUIRED' : 'INTERPRETED',
        requestId: dto.requestId,
        proposalId: dto.proposalId,
        amount: amount ?? undefined,
        payload: {
          passengerUserId: dto.passengerUserId,
          driverId: dto.driverId,
          etaMinutes: dto.etaMinutes,
          originAddress: dto.originAddress,
          originLat: dto.originLat,
          originLng: dto.originLng,
          destinationAddress: dto.destinationAddress,
          destinationLat: dto.destinationLat,
          destinationLng: dto.destinationLng,
          city: dto.city,
          trafficLevel: dto.trafficLevel,
          radiusKm: pref.searchRadiusKm,
          context: dto.context,
        } as any,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    });

    if (
      !requiresConfirmation &&
      ['GET_RECOMMENDATION', 'GET_CANDIDATES'].includes(classified.intent)
    ) {
      try {
        const result = await this.executeCommand(command);
        const updated = await this.prisma.mobilityVoiceCommand.update({
          where: { id: command.id },
          data: {
            status: 'EXECUTED',
            executedAt: new Date(),
            result: result as any,
          },
        });
        return {
          command: updated,
          spokenResponse,
          frontendAction,
          result,
        };
      } catch (error: any) {
        await this.prisma.mobilityVoiceCommand.update({
          where: { id: command.id },
          data: {
            status: 'FAILED',
            result: {
              message: error?.message ?? 'Error ejecutando comando',
            } as any,
          },
        });
        throw error;
      }
    }

    return {
      command,
      spokenResponse,
      frontendAction,
      requiresConfirmation,
    };
  }

  async confirm(actorUserId: string, id: string, dto: ConfirmVoiceCommandDto) {
    const command = await this.prisma.mobilityVoiceCommand.findUnique({
      where: { id },
    });
    if (
      !command ||
      !(await this.isSubject(
        actorUserId,
        command.subjectType,
        command.subjectId,
      ))
    ) {
      // Mismo mensaje exista o no: no revelar comandos de otras personas.
      throw new NotFoundException('Comando no encontrado.');
    }
    if (command.status === 'EXECUTED')
      return { command, idempotent: true, result: command.result };
    if (command.status !== 'CONFIRMATION_REQUIRED')
      throw new ConflictException(
        'Este comando ya no esta pendiente. No se repetira la accion.',
      );
    if (!command.requiresConfirmation)
      throw new BadRequestException('Este comando no necesita confirmacion.');
    if (command.expiresAt <= new Date()) {
      await this.prisma.mobilityVoiceCommand.updateMany({
        where: { id, status: 'CONFIRMATION_REQUIRED' },
        data: { status: 'EXPIRED' },
      });
      throw new ConflictException('La confirmacion vencio. Repite el comando.');
    }
    if (!dto.confirm) {
      const changed = await this.prisma.mobilityVoiceCommand.updateMany({
        where: { id, status: 'CONFIRMATION_REQUIRED' },
        data: { status: 'CANCELLED' },
      });
      if (changed.count !== 1)
        throw new ConflictException('La accion ya fue procesada.');
      return {
        command: await this.prisma.mobilityVoiceCommand.findUnique({
          where: { id },
        }),
        spokenResponse: 'Accion cancelada.',
      };
    }
    const claimed = await this.prisma.mobilityVoiceCommand.updateMany({
      where: {
        id,
        status: 'CONFIRMATION_REQUIRED',
        expiresAt: { gt: new Date() },
      },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count !== 1)
      throw new ConflictException('Ya se esta procesando o vencio.');
    try {
      const result = await this.executeCommand(command);
      const updated = await this.prisma.mobilityVoiceCommand.update({
        where: { id },
        data: {
          status: 'EXECUTED',
          executedAt: new Date(),
          result: result as any,
        },
      });
      return {
        command: updated,
        spokenResponse: 'Listo. Accion confirmada.',
        result,
      };
    } catch (error: unknown) {
      await this.prisma.mobilityVoiceCommand.updateMany({
        where: { id, status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          result: {
            message:
              'No se pudo ejecutar. Revisa el estado antes de reintentar.',
          } as any,
        },
      });
      throw error;
    }
  }

  async diagnostics() {
    const now = new Date();

    const [
      activePolicies,
      expiredOpen,
      pendingVoiceExpired,
      openNegotiations,
      voiceCommands,
    ] = await Promise.all([
      this.prisma.mobilityNegotiationPolicy.findMany({
        where: { isActive: true },
        orderBy: [{ city: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.mobilityNegotiationRequest.count({
        where: {
          status: 'OPEN',
          expiresAt: { lt: now },
        },
      }),
      this.prisma.mobilityVoiceCommand.count({
        where: {
          status: 'CONFIRMATION_REQUIRED',
          expiresAt: { lt: now },
        },
      }),
      this.prisma.mobilityNegotiationRequest.count({
        where: { status: 'OPEN' },
      }),
      this.prisma.mobilityVoiceCommand.count(),
    ]);

    const policyGroups = new Map<string, number>();
    for (const p of activePolicies) {
      const key = p.city ?? '__GENERIC__';
      policyGroups.set(key, (policyGroups.get(key) ?? 0) + 1);
    }
    const duplicatedPolicies = Array.from(policyGroups.entries())
      .filter(([, count]) => count > 1)
      .map(([scope, count]) => ({ scope, count }));

    return {
      status:
        expiredOpen === 0 &&
        pendingVoiceExpired === 0 &&
        duplicatedPolicies.length === 0
          ? 'PASS_WITH_KNOWN_PRODUCTION_GAPS'
          : 'REVIEW',
      checks: {
        duplicatedActivePolicies: duplicatedPolicies,
        expiredNegotiationsStillOpen: expiredOpen,
        expiredVoiceConfirmationsPending: pendingVoiceExpired,
        currentOpenNegotiations: openNegotiations,
        voiceCommandsCreated: voiceCommands,
      },
      knownProductionGaps: [
        {
          code: 'AUTH_SESSION',
          severity: 'HIGH',
          detail:
            'Mobility todavia debe derivar pasajero/conductor desde la sesion autenticada, no confiar en IDs enviados por el cliente.',
        },
        {
          code: 'BASE_TRIP_PIN_HASH',
          severity: 'HIGH',
          detail:
            'El safetyPin del viaje base debe migrar de texto plano a hash/HMAC con rate limit.',
        },
        {
          code: 'OTP_REAL',
          severity: 'HIGH',
          detail:
            'La verificacion de telefono MVP debe sustituirse por OTP real.',
        },
        {
          code: 'MAP_PROVIDER_REAL',
          severity: 'MEDIUM',
          detail:
            'El proveedor FALLBACK debe sustituirse por rutas/ETA/trafico reales antes de operar.',
        },
        {
          code: 'VOICE_STT_TTS',
          severity: 'MEDIUM',
          detail:
            'El backend de voz ya interpreta comandos; falta conectar microfono STT y lectura TTS en el frontend/app.',
        },
        {
          code: 'ECONOMIC_CALIBRATION',
          severity: 'MEDIUM',
          detail:
            'Tarifas, impuestos, comision, procesamiento de pago y costos reales deben calibrarse antes de lanzamiento.',
        },
      ],
    };
  }
}

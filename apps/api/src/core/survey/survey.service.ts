import { randomBytes } from 'node:crypto';
import {
  contactKey,
  invitationHash,
  parseParticipants,
  type InvitationContact,
} from './survey-invitations';
import { AccessSurveyDto } from './dto/access-survey.dto';
import {
  accessCodeHash,
  formatAccessCode,
  newAccessCode,
  normalizeAccessCode,
} from './survey-access-code';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';

import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import { publicBaseUrl } from '../../common/public-url';
import {
  assertCanOpen,
  effectiveSurveyStatus,
  resolveClosesAt,
  surveyIsOpen,
} from './survey-closing';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtractSurveyIneDto } from './dto/extract-survey-ine.dto';
import { SaveSurveyDto } from './dto/save-survey.dto';
import { SuggestSurveyDto } from './dto/suggest-survey.dto';
import { SubmitSurveyDto } from './dto/submit-survey.dto';
import { SurveyResultsQueryDto } from './dto/survey-results-query.dto';
import {
  decryptSurveyValue,
  encryptSurveyValue,
  hashPrivacyNotice,
  hashSurveyIdentity,
} from './survey-privacy';
import {
  buildSurveyInsights,
  normalizeSurveyDimension,
  surveyAnswerKeys,
} from './survey-results';
import { buildAiSurveySuggestion, SurveyAiError } from './survey-ai-suggestion';
import { SurveyIneExtractionService } from './survey-ine-extraction';
import { SurveyIneStorageService } from './survey-ine-storage';
import {
  buildSurveySuggestion,
  parseSurveyRequestRequirements,
  updateSurveyDraftLocally,
} from './survey-suggestion';

const surveyInclude = {
  questions: {
    orderBy: {
      sortOrder: 'asc' as const,
    },
  },
  _count: {
    select: {
      responses: true,
      ineSubmissions: {
        where: {
          deletedAt: null,
        },
      },
    },
  },
} as const;

function cleanOptions(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function completeAnswerSummary(
  question: { id: string; options: Prisma.JsonValue },
  aggregates: Array<{ questionId: string; optionKey: string; count: number }>,
) {
  const questionAnswers = aggregates.filter(
    (item) => item.questionId === question.id,
  );
  const configuredOptions = cleanOptions(question.options);
  const aggregateKey = (option: string) =>
    /^otr[oa]$/i.test(option) ? 'Otro' : option;
  const configuredKeys = new Set(configuredOptions.map(aggregateKey));

  return [
    ...configuredOptions.map((option) => ({
      option,
      count:
        questionAnswers.find((item) => item.optionKey === aggregateKey(option))
          ?.count ?? 0,
    })),
    ...questionAnswers
      .filter((item) => !configuredKeys.has(item.optionKey))
      .map((item) => ({
        option: item.optionKey,
        count: item.count,
      }))
      .sort((a, b) => b.count - a.count),
  ];
}

@Injectable()
export class SurveyService implements OnModuleInit {
  private readonly ineExtractionAttempts = new Map<string, number[]>();
  private readonly codeFailures = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ineStorage: SurveyIneStorageService,
    private readonly ineExtraction: SurveyIneExtractionService,
  ) {}

  onModuleInit() {
    const removeExpired = () => {
      void this.cleanupExpiredIne().catch(() => undefined);
    };
    setTimeout(removeExpired, 30_000).unref();
    setInterval(removeExpired, 6 * 60 * 60 * 1000).unref();
  }

  private async resolveInvite(surveyId: string, token?: string) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ForbiddenException(
        'Utiliza tu enlace individual de invitación',
      );
    const invite = await this.prisma.surveyInvitation.findFirst({
      where: { surveyId, tokenHash: invitationHash(token) },
    });
    if (!invite || invite.usedAt)
      throw new ForbiddenException('El enlace no es válido o ya fue utilizado');
    return invite;
  }

  private async takenCodeHashes(surveyId: string) {
    const rows = await this.prisma.surveyInvitation.findMany({
      where: { surveyId, codeHash: { not: null } },
      select: { codeHash: true },
    });
    return new Set(rows.map((row) => row.codeHash!));
  }

  /** Código nuevo que no se repite dentro de la encuesta (reserva su hash en `taken`). */
  private freshAccessCode(surveyId: string, taken: Set<string>) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = newAccessCode();
      const hash = accessCodeHash(surveyId, code);
      if (!taken.has(hash)) {
        taken.add(hash);
        return code;
      }
    }
    throw new BadRequestException('No pudimos generar códigos, intenta de nuevo');
  }

  private codeFailureCount(key: string) {
    const now = Date.now();
    const recent = (this.codeFailures.get(key) ?? []).filter(
      (value) => now - value < 15 * 60_000,
    );
    if (recent.length) this.codeFailures.set(key, recent);
    else this.codeFailures.delete(key);
    return recent.length;
  }

  private recordCodeFailure(key: string) {
    this.codeFailures.set(key, [
      ...(this.codeFailures.get(key) ?? []),
      Date.now(),
    ]);
  }

  /**
   * Cambia un código de acceso por el enlace personal de una sola vez. El mensaje de error es el mismo
   * para código inexistente, mal escrito o ya usado, y hay límite de intentos por persona y por encuesta.
   */
  async accessByCode(slug: string, dto: AccessSurveyDto, clientKey: string) {
    const survey = await this.prisma.survey.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: { id: true, status: true, closesAt: true, accessMode: true },
    });

    if (survey && effectiveSurveyStatus(survey) === 'closed') {
      throw new NotFoundException(
        'Esta encuesta ya terminó y no recibe más respuestas.',
      );
    }
    if (
      !survey ||
      !surveyIsOpen(survey) ||
      (survey.accessMode ?? 'public') === 'public'
    ) {
      throw new NotFoundException(
        'Esta encuesta no existe o ya no acepta respuestas',
      );
    }

    const personKey = `${survey.id}:${clientKey}`;
    if (
      this.codeFailureCount(personKey) >= 8 ||
      this.codeFailureCount(survey.id) >= 300
    ) {
      throw new BadRequestException(
        'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
      );
    }

    const code = normalizeAccessCode(dto.code);
    const invite = code
      ? await this.prisma.surveyInvitation.findFirst({
          where: { surveyId: survey.id, codeHash: accessCodeHash(survey.id, code) },
        })
      : null;

    if (!invite || invite.usedAt) {
      this.recordCodeFailure(personKey);
      this.recordCodeFailure(survey.id);
      throw new ForbiddenException('El código no es válido o ya fue utilizado');
    }

    return { invitation: decryptSurveyValue(invite.tokenCipher) };
  }

  async importParticipants(
    id: string,
    companyId: string,
    userId: string,
    filename: string,
    content: string,
  ) {
    const survey = await this.findOne(id, companyId, userId);
    if ((survey.accessMode ?? 'public') === 'public')
      throw new BadRequestException(
        'Selecciona audiencia Grupo o Privada antes de importar',
      );
    const contacts = await parseParticipants(filename, content, {
      lenient: true,
    });
    const takenCodes = await this.takenCodeHashes(id);
    const data = contacts.map((contact) => {
      const token = randomBytes(32).toString('base64url');
      const code = this.freshAccessCode(id, takenCodes);
      return {
        surveyId: id,
        tokenHash: invitationHash(token),
        tokenCipher: encryptSurveyValue(token)!,
        contactHash: hashSurveyIdentity(contactKey(contact))!,
        detailsCipher: encryptSurveyValue(JSON.stringify(contact))!,
        codeHash: accessCodeHash(id, code),
        codeCipher: encryptSurveyValue(code)!,
      };
    });
    const result = await this.prisma.surveyInvitation.createMany({
      data,
      skipDuplicates: true,
    });
    return { imported: result.count, skipped: contacts.length - result.count };
  }

  async exportInvitations(id: string, companyId: string, userId: string) {
    const survey = await this.findOne(id, companyId, userId);
    const invites = await this.prisma.surveyInvitation.findMany({
      where: { surveyId: id },
      orderBy: { createdAt: 'asc' },
    });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Invitaciones');
    sheet.addRow([
      'Nombre',
      'Correo',
      'Teléfono',
      'Grupo',
      'Referencia',
      'Código de acceso',
      'Enlace individual',
      'Estado',
    ]);
    // Sin dirección pública configurada (por ejemplo en tu computadora) el Excel sale igual, con los
    // códigos; solo quedan vacíos los enlaces individuales.
    const publicUrl = publicBaseUrl();
    const taken = await this.takenCodeHashes(id);
    for (const invite of invites) {
      const contact = JSON.parse(
        decryptSurveyValue(invite.detailsCipher),
      ) as InvitationContact;
      const token = decryptSurveyValue(invite.tokenCipher);
      let code = invite.codeCipher ? decryptSurveyValue(invite.codeCipher) : '';
      if (!code && !invite.usedAt) {
        // Invitaciones anteriores a los códigos: se les asigna uno al exportar.
        code = this.freshAccessCode(id, taken);
        await this.prisma.surveyInvitation.update({
          where: { id: invite.id },
          data: {
            codeHash: accessCodeHash(id, code),
            codeCipher: encryptSurveyValue(code)!,
          },
        });
      }
      sheet.addRow([
        contact.name,
        contact.email,
        contact.phone,
        contact.group,
        contact.reference,
        invite.usedAt || !code ? '' : formatAccessCode(code),
        invite.usedAt || !publicUrl
          ? ''
          : `${publicUrl}/e/${encodeURIComponent(survey.slug)}?invitation=${encodeURIComponent(token)}`,
        invite.usedAt ? 'Respondida' : 'Pendiente',
      ]);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 25;
    });
    sheet.getColumn(7).width = 80;
    return {
      data: Buffer.from(await workbook.xlsx.writeBuffer()),
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'invitaciones.xlsx',
    };
  }

  async suggest(dto: SuggestSurveyDto) {
    const request = dto.request.trim();
    const requirements = parseSurveyRequestRequirements(request);
    if (requirements.error) {
      throw new BadRequestException(requirements.error);
    }

    let aiNotice =
      'La IA no está configurada en este servidor. Usamos una propuesta local de respaldo.';
    try {
      const suggestion = await buildAiSurveySuggestion(request, dto.draft);
      if (suggestion) return suggestion;
    } catch (error) {
      aiNotice =
        error instanceof SurveyAiError
          ? {
              access:
                'La IA rechazó la configuración de acceso. Usamos el respaldo local.',
              limit:
                'La IA alcanzó un límite de uso o de capacidad. Usamos el respaldo local.',
              unavailable:
                'No pudimos obtener respuesta de la IA. Usamos el respaldo local.',
              quality:
                'La propuesta de IA no pasó la revisión de calidad. Usamos el respaldo local.',
            }[error.code]
          : 'No pudimos conectar con la IA a tiempo. Usamos el respaldo local.';
    }

    const localDraftUpdate = updateSurveyDraftLocally(request, dto.draft);
    const fallback = localDraftUpdate ?? buildSurveySuggestion(request);
    return {
      ...fallback,
      note: `${aiNotice} ${localDraftUpdate?.note ?? 'Revisa las preguntas y adáptalas antes de publicar.'}`,
    };
  }

  private slug(value: string) {
    const slug = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    if (slug.length < 3) {
      throw new BadRequestException(
        'El nombre de la encuesta es demasiado corto para crear su enlace',
      );
    }

    return slug;
  }

  private preparedQuestions(dto: SaveSurveyDto) {
    return dto.questions.map((question, index) => {
      let options = (question.options ?? [])
        .map((option) => option.trim())
        .filter(Boolean);

      if (question.type === 'yesno') {
        options = ['Sí', 'No'];
      }

      if (question.type === 'rating' && options.length < 2) {
        options = ['1', '2', '3', '4', '5'];
      }

      if (
        ['choice', 'multi', 'rating'].includes(question.type) &&
        options.length < 2
      ) {
        throw new BadRequestException(
          `Agrega al menos dos opciones en la pregunta ${index + 1}`,
        );
      }

      return {
        prompt: question.prompt.trim(),
        type: question.type,
        options,
        required: true,
        publicAggregate:
          question.publicAggregate ??
          ['choice', 'multi', 'yesno', 'rating'].includes(question.type),
        sortOrder: index,
      };
    });
  }

  private async availableSlug(requested: string, excludeId?: string) {
    const base = this.slug(requested);

    for (let suffix = 0; suffix < 100; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const existing = await this.prisma.survey.findUnique({
        where: {
          slug: candidate,
        },
        select: {
          id: true,
        },
      });

      if (!existing || existing.id === excludeId) {
        return candidate;
      }
    }

    throw new ConflictException(
      'No fue posible crear un enlace único para esta encuesta',
    );
  }

  async findAll(companyId: string, userId: string) {
    const surveys = await this.prisma.survey.findMany({
      where: {
        companyId,
        createdById: userId,
      },
      include: surveyInclude,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return surveys.map((survey) => ({
      ...survey,
      status: effectiveSurveyStatus(survey),
    }));
  }

  async findOne(id: string, companyId: string, userId: string) {
    const survey = await this.prisma.survey.findFirst({
      where: {
        id,
        companyId,
        createdById: userId,
      },
      include: surveyInclude,
    });

    if (!survey) {
      throw new NotFoundException('La encuesta no existe');
    }

    return survey;
  }

  async create(dto: SaveSurveyDto, companyId: string, userId: string) {
    const closesAt = resolveClosesAt(dto.closesAt, null);
    assertCanOpen(dto.status ?? 'draft', closesAt);
    const questions = this.preparedQuestions(dto);
    const slug = await this.availableSlug(dto.slug || dto.title);

    return this.prisma.survey.create({
      data: {
        title: dto.title.trim(),
        slug,
        description: dto.description?.trim(),
        status: dto.status ?? 'draft',
        identityMode: dto.identityMode ?? 'phone',
        accessMode: dto.accessMode ?? 'public',
        closesAt,
        personalFields: dto.personalFields
          ? dto.personalFields.map((field) => ({
              key: field.key,
              required: field.required,
            }))
          : undefined,
        collectMunicipality: dto.collectMunicipality ?? false,
        collectLocality: dto.collectLocality ?? false,
        collectLeaderProposal: dto.collectLeaderProposal ?? false,
        collectIne: dto.collectIne ?? false,
        ineCaptureMode: dto.collectIne
          ? (dto.ineCaptureMode ?? 'front')
          : 'front',
        ineAutoExtract: dto.collectIne ? (dto.ineAutoExtract ?? false) : false,
        ineRequired: dto.collectIne ?? false,
        collectPostalCode: dto.collectPostalCode ?? false,
        collectAddress: dto.collectAddress ?? false,
        collectCurp: dto.collectCurp ?? false,
        collectVoterKey: dto.collectVoterKey ?? false,
        collectElectoralSection: dto.collectElectoralSection ?? false,
        ineRetentionDays: dto.ineRetentionDays ?? 30,
        ineStorageMode: dto.collectIne
          ? (dto.ineStorageMode ?? 'temporary')
          : 'temporary',
        showPublicResults: dto.showPublicResults ?? false,
        privacyNotice: dto.privacyNotice.trim(),
        thankYouMessage:
          dto.thankYouMessage?.trim() ||
          'Gracias. Tu participación fue registrada correctamente.',
        companyId,
        createdById: userId,
        questions: {
          create: questions,
        },
      },
      include: surveyInclude,
    });
  }

  async update(
    id: string,
    dto: SaveSurveyDto,
    companyId: string,
    userId: string,
  ) {
    const current = await this.findOne(id, companyId, userId);
    const closesAt = resolveClosesAt(dto.closesAt, current.closesAt);
    assertCanOpen(dto.status ?? current.status, closesAt);
    const questions = this.preparedQuestions(dto);
    const currentQuestions = current.questions.map((question) => ({
      prompt: question.prompt,
      type: question.type,
      options: cleanOptions(question.options),
      required: question.required,
      publicAggregate: question.publicAggregate,
      sortOrder: question.sortOrder,
    }));
    const nextQuestions = questions;

    if (
      current._count.responses > 0 &&
      JSON.stringify(currentQuestions) !== JSON.stringify(nextQuestions)
    ) {
      throw new ConflictException(
        'Esta encuesta ya tiene respuestas. Duplícala para cambiar sus preguntas sin alterar los resultados.',
      );
    }

    const slug = await this.availableSlug(dto.slug || dto.title, id);

    return this.prisma.$transaction(async (tx) => {
      if (current._count.responses === 0) {
        await tx.surveyQuestion.deleteMany({
          where: {
            surveyId: id,
          },
        });
      }

      return tx.survey.update({
        where: {
          id,
        },
        data: {
          title: dto.title.trim(),
          slug,
          description: dto.description?.trim(),
          status: dto.status ?? current.status,
          identityMode: dto.identityMode ?? current.identityMode,
          accessMode: dto.accessMode ?? current.accessMode ?? 'public',
          closesAt,
          personalFields: dto.personalFields
            ? dto.personalFields.map((field) => ({
                key: field.key,
                required: field.required,
              }))
            : undefined,
          collectMunicipality:
            dto.collectMunicipality ?? current.collectMunicipality,
          collectLocality: dto.collectLocality ?? current.collectLocality,
          collectLeaderProposal:
            dto.collectLeaderProposal ?? current.collectLeaderProposal,
          collectIne: dto.collectIne ?? current.collectIne,
          ineCaptureMode:
            (dto.collectIne ?? current.collectIne)
              ? (dto.ineCaptureMode ?? current.ineCaptureMode)
              : 'front',
          ineAutoExtract:
            (dto.collectIne ?? current.collectIne)
              ? (dto.ineAutoExtract ?? current.ineAutoExtract)
              : false,
          ineRequired: dto.collectIne ?? current.collectIne,
          collectPostalCode: dto.collectPostalCode ?? current.collectPostalCode,
          collectAddress: dto.collectAddress ?? current.collectAddress,
          collectCurp: dto.collectCurp ?? current.collectCurp,
          collectVoterKey: dto.collectVoterKey ?? current.collectVoterKey,
          collectElectoralSection:
            dto.collectElectoralSection ?? current.collectElectoralSection,
          ineRetentionDays: dto.ineRetentionDays ?? current.ineRetentionDays,
          ineStorageMode:
            (dto.collectIne ?? current.collectIne)
              ? (dto.ineStorageMode ?? current.ineStorageMode)
              : 'temporary',
          showPublicResults: dto.showPublicResults ?? current.showPublicResults,
          privacyNotice: dto.privacyNotice.trim(),
          thankYouMessage: dto.thankYouMessage?.trim(),
          questions:
            current._count.responses === 0
              ? {
                  create: questions,
                }
              : undefined,
        },
        include: surveyInclude,
      });
    });
  }

  async updateStatus(
    id: string,
    status: string,
    companyId: string,
    userId: string,
    confirmClose = false,
  ) {
    const current = await this.findOne(id, companyId, userId);

    if (status === 'closed' && current.status !== 'closed' && !confirmClose) {
      throw new BadRequestException(
        'Confirma el cierre de la encuesta antes de continuar',
      );
    }

    assertCanOpen(status, current.closesAt);

    return this.prisma.survey.update({
      where: {
        id,
      },
      data: {
        status,
      },
      include: surveyInclude,
    });
  }

  async remove(id: string, companyId: string, userId: string) {
    const survey = await this.findOne(id, companyId, userId);

    if (survey._count.responses > 0) {
      throw new ConflictException(
        'La encuesta tiene respuestas y debe conservarse para auditoría. Puedes cerrarla.',
      );
    }

    await this.prisma.survey.delete({
      where: {
        id,
      },
    });

    return {
      deleted: true,
      id,
    };
  }

  async findPublic(slug: string, invitationToken?: string) {
    const survey = await this.prisma.survey.findUnique({
      where: {
        slug: slug.trim().toLowerCase(),
      },
      include: {
        company: {
          select: {
            name: true,
          },
        },
        questions: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
        _count: {
          select: {
            responses: true,
          },
        },
      },
    });

    if (survey && effectiveSurveyStatus(survey) === 'closed') {
      throw new NotFoundException(
        'Esta encuesta ya terminó y no recibe más respuestas.',
      );
    }

    if (!survey || !surveyIsOpen(survey)) {
      throw new NotFoundException(
        'Esta encuesta no existe o todavía no está abierta',
      );
    }

    if ((survey.accessMode ?? 'public') !== 'public')
      await this.resolveInvite(survey.id, invitationToken);
    return {
      personalFields: survey.personalFields,
      accessMode: survey.accessMode ?? 'public',
      id: survey.id,
      title: survey.title,
      slug: survey.slug,
      description: survey.description,
      identityMode: survey.identityMode,
      collectMunicipality: survey.collectMunicipality,
      collectLocality: survey.collectLocality,
      collectIne: survey.collectIne,
      ineCaptureMode: survey.ineCaptureMode,
      ineAutoExtract: survey.ineAutoExtract,
      ineRequired: survey.ineRequired,
      ineRetentionDays: survey.ineRetentionDays,
      ineStorageMode: survey.ineStorageMode,
      collectPostalCode: survey.collectPostalCode,
      collectAddress: survey.collectAddress,
      collectCurp: survey.collectCurp,
      collectVoterKey: survey.collectVoterKey,
      collectElectoralSection: survey.collectElectoralSection,
      showPublicResults: survey.showPublicResults,
      privacyNotice: survey.privacyNotice,
      thankYouMessage: survey.thankYouMessage,
      company: survey.company,
      questions: survey.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        options: cleanOptions(question.options),
        required: question.required,
        sortOrder: question.sortOrder,
      })),
      responseCount: survey._count.responses,
    };
  }

  private validateIdentity(
    survey: {
      personalFields?: Prisma.JsonValue;
      identityMode: string;
      collectMunicipality: boolean;
      collectLocality: boolean;
      collectPostalCode: boolean;
      collectAddress: boolean;
      collectCurp: boolean;
      collectVoterKey: boolean;
      collectElectoralSection: boolean;
    },
    dto: SubmitSurveyDto,
  ) {
    if (Array.isArray(survey.personalFields)) {
      const fields = survey.personalFields as Array<{
        key: string;
        required: boolean;
      }>;
      const clean: Record<string, string> = {};
      for (const field of fields) {
        const value = String(
          dto.person?.[
            field.key as keyof NonNullable<SubmitSurveyDto['person']>
          ] ?? '',
        ).trim();
        if (field.required && !value)
          throw new BadRequestException(
            `Falta completar: ${{ name: 'Nombre', email: 'Correo', phone: 'Teléfono', address: 'Domicilio', municipality: 'Municipio', locality: 'Localidad', postalCode: 'Código postal', curp: 'CURP', voterKey: 'Clave de elector', electoralSection: 'Sección electoral' }[field.key] ?? field.key}`,
          );
        if (
          value &&
          field.key === 'phone' &&
          !/^\d{10,15}$/.test(value.replace(/\D/g, ''))
        )
          throw new BadRequestException('Revisa el teléfono');
        if (value && field.key === 'postalCode' && !/^\d{5}$/.test(value))
          throw new BadRequestException('Revisa el código postal');
        if (value && field.key === 'curp' && !/^[A-Z0-9]{18}$/i.test(value))
          throw new BadRequestException('Revisa la CURP');
        if (
          value &&
          field.key === 'electoralSection' &&
          !/^\d{1,4}$/.test(value)
        )
          throw new BadRequestException('Revisa la sección electoral');
        clean[field.key] = value;
      }
      dto.person = clean;
      return {
        name: clean.name ?? '',
        email: (clean.email ?? '').toLowerCase(),
        phone: (clean.phone ?? '').replace(/\D/g, ''),
        postalCode: clean.postalCode ?? '',
        address: clean.address ?? '',
        curp: (clean.curp ?? '').toUpperCase(),
        voterKey: (clean.voterKey ?? '').toUpperCase(),
        electoralSection: clean.electoralSection ?? '',
      };
    }
    const { identityMode } = survey;
    const name = dto.person?.name?.trim() ?? '';
    const email = dto.person?.email?.trim().toLowerCase() ?? '';
    const phone = dto.person?.phone?.replace(/\D/g, '') ?? '';

    if (identityMode !== 'anonymous' && !name) {
      throw new BadRequestException('Escribe tu nombre');
    }

    if (identityMode === 'phone' && phone.length < 10) {
      throw new BadRequestException(
        'Escribe un teléfono de al menos 10 dígitos',
      );
    }

    if (identityMode === 'email' && !email) {
      throw new BadRequestException('Escribe tu correo');
    }

    if (identityMode === 'email_or_phone' && !email && phone.length < 10) {
      throw new BadRequestException('Escribe tu correo o teléfono');
    }

    if (identityMode === 'email_and_phone' && (!email || phone.length < 10)) {
      throw new BadRequestException('Escribe tu correo y teléfono');
    }

    if (survey.collectMunicipality && !dto.person?.municipality?.trim()) {
      throw new BadRequestException('Escribe tu municipio');
    }

    if (survey.collectLocality && !dto.person?.locality?.trim()) {
      throw new BadRequestException('Escribe tu colonia o localidad');
    }

    const postalCode = dto.person?.postalCode?.replace(/\D/g, '') ?? '';
    const address = dto.person?.address?.trim() ?? '';
    const curp = dto.person?.curp?.trim().toUpperCase() ?? '';
    const voterKey =
      dto.person?.voterKey
        ?.trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '') ?? '';

    if (survey.collectPostalCode && !/^\d{5}$/.test(postalCode)) {
      throw new BadRequestException('Escribe un código postal de 5 dígitos');
    }
    if (survey.collectAddress && address.length < 5) {
      throw new BadRequestException('Escribe tu domicilio');
    }
    if (survey.collectCurp && !/^[A-Z0-9]{18}$/.test(curp)) {
      throw new BadRequestException('Revisa la CURP; debe tener 18 caracteres');
    }
    if (
      survey.collectVoterKey &&
      (voterKey.length < 16 || voterKey.length > 20)
    ) {
      throw new BadRequestException('Revisa la clave de elector');
    }
    const electoralSection =
      dto.person?.electoralSection?.replace(/\D/g, '') ?? '';
    if (survey.collectElectoralSection && !/^\d{1,4}$/.test(electoralSection)) {
      throw new BadRequestException('Revisa la sección electoral');
    }

    return {
      name,
      email,
      phone,
      postalCode,
      address,
      curp,
      voterKey,
      electoralSection,
    };
  }

  private validateAnswer(
    question: {
      prompt: string;
      type: string;
      options: Prisma.JsonValue;
      required: boolean;
    },
    value: unknown,
  ) {
    const missing =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (question.required && missing) {
      throw new BadRequestException(`Falta responder: ${question.prompt}`);
    }

    if (missing) return;

    if (question.type === 'text') {
      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Revisa la respuesta: ${question.prompt}`,
        );
      }
      if (value.trim().length > 3000) {
        throw new BadRequestException(
          `La respuesta es demasiado larga: ${question.prompt}`,
        );
      }
      return;
    }

    const allowed = cleanOptions(question.options);
    const allowsOther = allowed.some((option) => /^otr[oa]$/i.test(option));

    if (question.type === 'multi') {
      if (!Array.isArray(value)) {
        throw new BadRequestException(
          `Revisa la respuesta: ${question.prompt}`,
        );
      }
    } else if (Array.isArray(value)) {
      throw new BadRequestException(
        `Selecciona una sola respuesta: ${question.prompt}`,
      );
    }

    const values = Array.isArray(value) ? value : [value];
    if (values.length > allowed.length) {
      throw new BadRequestException(
        `Elegiste demasiadas opciones: ${question.prompt}`,
      );
    }

    const normalizedValues = values.map((item) => String(item).trim());
    if (
      normalizedValues.some((answer) => !answer || answer.length > 180) ||
      new Set(normalizedValues).size !== normalizedValues.length
    ) {
      throw new BadRequestException(`Revisa la respuesta: ${question.prompt}`);
    }

    const invalid = normalizedValues.some((answer) => {
      if (allowed.includes(answer) && !/^otr[oa]$/i.test(answer)) {
        return false;
      }

      const otherMatch = answer.match(/^otr[oa]\s*[:—-]\s*(.+)$/i);
      return !(
        allowsOther &&
        otherMatch?.[1] &&
        otherMatch[1].trim().length > 0 &&
        otherMatch[1].trim().length <= 160
      );
    });

    if (invalid) {
      throw new BadRequestException(`Revisa la respuesta: ${question.prompt}`);
    }
  }

  private guardIneExtraction(key: string) {
    const now = Date.now();
    const recent = (this.ineExtractionAttempts.get(key) ?? []).filter(
      (value) => now - value < 60_000,
    );
    if (recent.length >= 4) {
      throw new BadRequestException(
        'Espera un momento antes de intentar leer otra fotografía',
      );
    }
    recent.push(now);
    this.ineExtractionAttempts.set(key, recent);
  }

  async extractIneFront(
    slug: string,
    dto: ExtractSurveyIneDto,
    clientKey: string,
  ) {
    const survey = await this.prisma.survey.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: {
        accessMode: true,
        personalFields: true,
        id: true,
        status: true,
        closesAt: true,
        identityMode: true,
        collectMunicipality: true,
        collectLocality: true,
        collectPostalCode: true,
        collectAddress: true,
        collectCurp: true,
        collectVoterKey: true,
        collectElectoralSection: true,
        collectIne: true,
        ineAutoExtract: true,
      },
    });
    if (!survey || !surveyIsOpen(survey)) {
      throw new NotFoundException(
        'Esta encuesta no existe o ya no acepta respuestas',
      );
    }
    if (!survey.collectIne || !survey.ineAutoExtract) {
      throw new BadRequestException(
        'Esta encuesta no utiliza lectura automática de INE',
      );
    }
    if ((survey.accessMode ?? 'public') !== 'public')
      await this.resolveInvite(survey.id, dto.invitationToken);
    const hasPrefillTarget = Array.isArray(survey.personalFields)
      ? survey.personalFields.length > 0
      : survey.identityMode !== 'anonymous' ||
        survey.collectMunicipality ||
        survey.collectLocality ||
        survey.collectPostalCode ||
        survey.collectAddress ||
        survey.collectCurp ||
        survey.collectVoterKey ||
        survey.collectElectoralSection;
    if (!hasPrefillTarget) {
      throw new BadRequestException(
        'Esta encuesta no solicita datos que puedan completarse desde la INE',
      );
    }

    this.guardIneExtraction(`${survey.id}:${clientKey}`);
    const prepared = this.ineStorage.prepareImage(dto.frontImage, 'frente');
    const safeDataUrl = `data:${prepared.mimeType};base64,${prepared.bytes.toString('base64')}`;
    return this.ineExtraction.extract(safeDataUrl);
  }

  async submit(slug: string, dto: SubmitSurveyDto) {
    const survey = await this.prisma.survey.findUnique({
      where: {
        slug: slug.trim().toLowerCase(),
      },
      include: {
        questions: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    if (!survey || !surveyIsOpen(survey)) {
      throw new NotFoundException(
        'Esta encuesta no existe o ya no acepta respuestas',
      );
    }

    const invite =
      (survey.accessMode ?? 'public') === 'public'
        ? null
        : await this.resolveInvite(survey.id, dto.invitationToken);

    if (!dto.acceptPrivacy) {
      throw new BadRequestException(
        'Debes aceptar el aviso de privacidad para continuar',
      );
    }

    const needsBack = survey.ineCaptureMode === 'front_back';
    if (survey.ineRequired && !dto.ine?.frontImage) {
      throw new BadRequestException(
        'Para enviar esta encuesta toma una fotografía del frente de tu INE',
      );
    }
    if (survey.ineRequired && needsBack && !dto.ine?.backImage) {
      throw new BadRequestException(
        'Para enviar esta encuesta toma también la fotografía del reverso de tu INE',
      );
    }
    if (dto.ine?.backImage && !dto.ine.frontImage) {
      throw new BadRequestException(
        'Agrega primero la fotografía del frente de la INE',
      );
    }
    if (dto.ine?.frontImage && needsBack && !dto.ine.backImage) {
      throw new BadRequestException(
        survey.ineRequired
          ? 'Falta la fotografía del reverso de la INE'
          : 'Completa frente y reverso o elimina la fotografía para continuar sin INE',
      );
    }
    if (dto.ine?.backImage && !needsBack) {
      throw new BadRequestException(
        'Esta encuesta sólo solicita el frente de la INE',
      );
    }

    if (!survey.collectIne && dto.ine) {
      throw new BadRequestException(
        'Esta encuesta no solicita fotografías de INE',
      );
    }

    const person = this.validateIdentity(survey, dto);

    const questionIds = new Set(
      survey.questions.map((question) => question.id),
    );
    const unknownAnswer = Object.keys(dto.answers).find(
      (questionId) => !questionIds.has(questionId),
    );
    if (unknownAnswer) {
      throw new BadRequestException(
        'La respuesta contiene una pregunta no válida',
      );
    }

    for (const question of survey.questions) {
      this.validateAnswer(question, dto.answers[question.id]);
    }

    const emailHash = hashSurveyIdentity(person.email);
    const phoneHash = hashSurveyIdentity(person.phone);

    let storedIne: Awaited<
      ReturnType<SurveyIneStorageService['storePair']>
    > | null = null;

    if (dto.ine?.frontImage) {
      const front = this.ineStorage.prepareImage(dto.ine.frontImage, 'frente');
      const back = dto.ine.backImage
        ? this.ineStorage.prepareImage(dto.ine.backImage, 'reverso')
        : undefined;
      storedIne = await this.ineStorage.storePair(
        survey.companyId,
        survey.id,
        front,
        back,
      );
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        if (invite) {
          const claimed = await tx.surveyInvitation.updateMany({
            where: { id: invite.id, surveyId: survey.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          if (claimed.count !== 1)
            throw new ConflictException('Este enlace ya fue utilizado');
        }
        const shouldStoreRespondent = Array.isArray(survey.personalFields)
          ? survey.personalFields.length > 0
          : survey.identityMode !== 'anonymous' ||
            survey.collectMunicipality ||
            survey.collectLocality ||
            survey.collectPostalCode ||
            survey.collectAddress ||
            survey.collectCurp ||
            survey.collectVoterKey ||
            survey.collectElectoralSection;
        let respondent =
          shouldStoreRespondent && (emailHash || phoneHash)
            ? await tx.surveyRespondent.findFirst({
                where: {
                  companyId: survey.companyId,
                  responses: { some: { surveyId: survey.id } },
                  OR: [
                    ...(emailHash ? [{ emailHash }] : []),
                    ...(phoneHash ? [{ phoneHash }] : []),
                  ],
                },
              })
            : null;

        if (respondent) {
          const duplicate = await tx.surveyResponse.findFirst({
            where: {
              surveyId: survey.id,
              respondentId: respondent.id,
            },
            select: {
              id: true,
            },
          });

          if (duplicate) {
            throw new ConflictException(
              'Este teléfono o correo ya respondió esta encuesta',
            );
          }

          respondent = await tx.surveyRespondent.update({
            where: {
              id: respondent.id,
            },
            data: {
              nameCipher: encryptSurveyValue(person.name),
              emailCipher: emailHash
                ? encryptSurveyValue(person.email)
                : undefined,
              emailHash: emailHash ?? undefined,
              phoneCipher: phoneHash
                ? encryptSurveyValue(person.phone)
                : undefined,
              phoneHash: phoneHash ?? undefined,
              municipalityCipher: encryptSurveyValue(dto.person?.municipality),
              localityCipher: encryptSurveyValue(dto.person?.locality),
              postalCodeCipher: encryptSurveyValue(person.postalCode),
              addressCipher: encryptSurveyValue(person.address),
              curpCipher: encryptSurveyValue(person.curp),
              voterKeyCipher: encryptSurveyValue(person.voterKey),
              electoralSectionCipher: encryptSurveyValue(
                person.electoralSection,
              ),
            },
          });
        } else if (shouldStoreRespondent) {
          respondent = await tx.surveyRespondent.create({
            data: {
              nameCipher: encryptSurveyValue(person.name),
              emailCipher: encryptSurveyValue(person.email),
              emailHash,
              phoneCipher: encryptSurveyValue(person.phone),
              phoneHash,
              municipalityCipher: encryptSurveyValue(dto.person?.municipality),
              localityCipher: encryptSurveyValue(dto.person?.locality),
              postalCodeCipher: encryptSurveyValue(person.postalCode),
              addressCipher: encryptSurveyValue(person.address),
              curpCipher: encryptSurveyValue(person.curp),
              voterKeyCipher: encryptSurveyValue(person.voterKey),
              electoralSectionCipher: encryptSurveyValue(
                person.electoralSection,
              ),
              companyId: survey.companyId,
            },
          });
        }

        const answers = survey.questions.flatMap((question) => {
          const value = dto.answers[question.id];

          if (
            value === undefined ||
            value === null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0)
          ) {
            return [];
          }

          return [
            {
              questionId: question.id,
              value: JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue,
            },
          ];
        });

        const folioCounter = await tx.survey.update({
          where: { id: survey.id },
          data: { nextFolio: { increment: 1 } },
          select: { nextFolio: true },
        });
        const folio = folioCounter.nextFolio;

        const response = await tx.surveyResponse.create({
          data: {
            surveyId: survey.id,
            folio,
            respondentId: respondent?.id,
            privacyAcceptedAt: new Date(),
            privacyNoticeHash: hashPrivacyNotice(survey.privacyNotice),
            consentContact: dto.consentContact ?? false,
            contactChannels: dto.contactChannels ?? [],
            ineSubmission: storedIne
              ? {
                  create: {
                    id: storedIne.id,
                    surveyId: survey.id,
                    frontObjectKey: storedIne.frontObjectKey,
                    frontMimeType: storedIne.frontMimeType,
                    frontBytes: storedIne.frontBytes,
                    backObjectKey: storedIne.backObjectKey,
                    backMimeType: storedIne.backMimeType,
                    backBytes: storedIne.backBytes,
                    expiresAt: new Date(
                      Date.now() + survey.ineRetentionDays * 86_400_000,
                    ),
                  },
                }
              : undefined,
            answers: {
              create: answers,
            },
          },
        });

        for (const question of survey.questions) {
          if (!question.publicAggregate) {
            continue;
          }

          const value = dto.answers[question.id];
          const values = Array.isArray(value) ? value : [value];

          for (const item of values) {
            if (item === undefined || item === null || item === '') {
              continue;
            }

            const raw = String(item).trim().slice(0, 180);
            const optionKey = /^otr[oa]\s*[:—-]/i.test(raw) ? 'Otro' : raw;

            await tx.surveyAnswerAggregate.upsert({
              where: {
                surveyId_questionId_optionKey: {
                  surveyId: survey.id,
                  questionId: question.id,
                  optionKey,
                },
              },
              update: {
                count: {
                  increment: 1,
                },
              },
              create: {
                surveyId: survey.id,
                questionId: question.id,
                optionKey,
                count: 1,
              },
            });
          }
        }

        // I2: metadata operacional minima dentro de la misma transaccion.
        // La PK determinista impide dos eventos para la misma respuesta.
        await tx.event.create({
          data: {
            id: `survey.response.completed:${response.id}`,
            type: 'survey.response.completed.v1',
            source: 'survey',
            entityType: 'survey',
            entityId: survey.id,
            companyId: survey.companyId,
            data: { responseId: response.id },
          },
        });

        return {
          id: response.id,
          folio: String(response.folio).padStart(6, '0'),
          thankYouMessage: survey.thankYouMessage,
          results: survey.showPublicResults
            ? await this.resultsById(survey.id, tx)
            : null,
        };
      });

      return result;
    } catch (error) {
      if (storedIne) {
        await this.ineStorage.deletePair(storedIne).catch(() => undefined);
      }
      throw error;
    }
  }

  private async resultsById(
    surveyId: string,
    database: Pick<PrismaService, 'survey' | 'surveyAnswerAggregate'> = this
      .prisma,
  ) {
    const survey = await database.survey.findUnique({
      where: {
        id: surveyId,
      },
      include: {
        questions: {
          where: {
            publicAggregate: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        _count: {
          select: {
            responses: true,
          },
        },
      },
    });

    if (!survey) {
      throw new NotFoundException('La encuesta no existe');
    }

    const aggregates = await database.surveyAnswerAggregate.findMany({
      where: {
        surveyId,
      },
    });

    return {
      responseCount: survey._count.responses,
      questions: survey.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        answers: completeAnswerSummary(question, aggregates),
      })),
    };
  }

  async results(
    id: string,
    companyId: string,
    userId: string,
    query: SurveyResultsQueryDto = {},
  ) {
    const survey = await this.prisma.survey.findFirst({
      where: {
        id,
        companyId,
        createdById: userId,
      },
      include: {
        questions: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
        _count: {
          select: {
            responses: true,
          },
        },
      },
    });

    if (!survey) {
      throw new NotFoundException('La encuesta no existe');
    }

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (to && /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? '')) {
      to.setUTCHours(23, 59, 59, 999);
    }

    if (from && to && from > to) {
      throw new BadRequestException(
        'La fecha inicial debe ser anterior a la fecha final',
      );
    }

    const responseMetadata = await this.prisma.surveyResponse.findMany({
      where: {
        surveyId: survey.id,
      },
      select: {
        id: true,
        folio: true,
        completedAt: true,
        respondent: {
          select: {
            nameCipher: true,
            emailCipher: true,
            phoneCipher: true,
            municipalityCipher: true,
            localityCipher: true,
            postalCodeCipher: true,
            addressCipher: true,
            curpCipher: true,
            voterKeyCipher: true,
            electoralSectionCipher: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    const preparedResponses = responseMetadata.map((response) => ({
      ...response,
      name: decryptSurveyValue(response.respondent?.nameCipher),
      email: decryptSurveyValue(response.respondent?.emailCipher),
      phone: decryptSurveyValue(response.respondent?.phoneCipher),
      municipality: decryptSurveyValue(response.respondent?.municipalityCipher),
      locality: decryptSurveyValue(response.respondent?.localityCipher),
      postalCode: decryptSurveyValue(response.respondent?.postalCodeCipher),
      address: decryptSurveyValue(response.respondent?.addressCipher),
      curp: decryptSurveyValue(response.respondent?.curpCipher),
      voterKey: decryptSurveyValue(response.respondent?.voterKeyCipher),
      electoralSection: decryptSurveyValue(
        response.respondent?.electoralSectionCipher,
      ),
    }));
    const municipalityFilter = normalizeSurveyDimension(query.municipality);
    const localityFilter = normalizeSurveyDimension(query.locality);
    const electoralSectionFilter = String(query.electoralSection ?? '').replace(
      /\D/g,
      '',
    );
    const selectedResponses = preparedResponses.filter((response) => {
      if (from && response.completedAt < from) return false;
      if (to && response.completedAt > to) return false;
      if (
        municipalityFilter &&
        normalizeSurveyDimension(response.municipality) !== municipalityFilter
      ) {
        return false;
      }
      if (
        localityFilter &&
        normalizeSurveyDimension(response.locality) !== localityFilter
      ) {
        return false;
      }
      if (
        electoralSectionFilter &&
        response.electoralSection !== electoralSectionFilter
      ) {
        return false;
      }
      return true;
    });
    const selectedResponseIds = selectedResponses.map(
      (response) => response.id,
    );
    const hasFilters = Boolean(
      query.from ||
      query.to ||
      municipalityFilter ||
      localityFilter ||
      electoralSectionFilter,
    );

    let aggregates: Array<{
      questionId: string;
      optionKey: string;
      count: number;
    }>;

    if (hasFilters) {
      const filteredAnswers = selectedResponseIds.length
        ? await this.prisma.surveyAnswer.findMany({
            where: {
              responseId: {
                in: selectedResponseIds,
              },
              question: {
                publicAggregate: true,
              },
            },
            select: {
              questionId: true,
              value: true,
            },
          })
        : [];
      const counts = new Map<string, number>();

      for (const answer of filteredAnswers) {
        for (const optionKey of surveyAnswerKeys(answer.value)) {
          const key = `${answer.questionId}\u0000${optionKey}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }

      aggregates = Array.from(counts.entries()).map(([key, count]) => {
        const [questionId, optionKey] = key.split('\u0000');
        return { questionId, optionKey, count };
      });
    } else {
      aggregates = await this.prisma.surveyAnswerAggregate.findMany({
        where: {
          surveyId: survey.id,
        },
      });
    }

    const textLimit = query.textLimit ?? 100;
    const privateQuestions = survey.questions.filter(
      (question) => !question.publicAggregate,
    );
    const privateAnswerGroups = await Promise.all(
      privateQuestions.map(async (question) => {
        if (hasFilters && selectedResponseIds.length === 0) {
          return {
            questionId: question.id,
            count: 0,
            answers: [] as Prisma.JsonValue[],
          };
        }

        const where: Prisma.SurveyAnswerWhereInput = {
          questionId: question.id,
          response: {
            surveyId: survey.id,
          },
          ...(hasFilters
            ? {
                responseId: {
                  in: selectedResponseIds,
                },
              }
            : {}),
        };
        const [count, answers] = await Promise.all([
          this.prisma.surveyAnswer.count({ where }),
          this.prisma.surveyAnswer.findMany({
            where,
            select: {
              value: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: textLimit,
          }),
        ]);

        return {
          questionId: question.id,
          count,
          answers: answers.map((answer) => answer.value),
        };
      }),
    );
    const questionResults = survey.questions.map((question) => {
      const privateGroup = privateAnswerGroups.find(
        (group) => group.questionId === question.id,
      );
      const textAnswers = (privateGroup?.answers ?? []).flatMap((value) => {
        if (typeof value === 'string') return [value];
        if (Array.isArray(value)) return value.map(String);
        return value === null ? [] : [JSON.stringify(value)];
      });

      return {
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        answers: completeAnswerSummary(question, aggregates),
        textAnswers,
        textAnswerCount: privateGroup?.count ?? 0,
        textAnswersTruncated: (privateGroup?.count ?? 0) > textAnswers.length,
      };
    });
    const uniqueValues = (values: string[]) =>
      Array.from(
        new Map(
          values
            .filter(Boolean)
            .map((value) => [normalizeSurveyDimension(value), value.trim()]),
        ).values(),
      ).toSorted((a, b) => a.localeCompare(b, 'es-MX'));

    return {
      totalResponseCount: survey._count.responses,
      responseCount: selectedResponses.length,
      filters: {
        from: query.from ?? '',
        to: query.to ?? '',
        municipality: query.municipality?.trim() ?? '',
        locality: query.locality?.trim() ?? '',
        electoralSection: electoralSectionFilter,
      },
      availableMunicipalities: uniqueValues(
        preparedResponses.map((response) => response.municipality),
      ),
      availableLocalities: uniqueValues(
        preparedResponses.map((response) => response.locality),
      ),
      availableElectoralSections: uniqueValues(
        preparedResponses.map((response) => response.electoralSection),
      ),
      participants: selectedResponses.map((response) => ({
        responseId: response.id,
        folio: String(response.folio).padStart(6, '0'),
        completedAt: response.completedAt,
        name: response.name,
        email: response.email,
        phone: response.phone,
        municipality: response.municipality,
        locality: response.locality,
        postalCode: response.postalCode,
        address: response.address,
        curp: response.curp,
        voterKey: response.voterKey,
        electoralSection: response.electoralSection,
      })),
      questions: questionResults,
      insights: buildSurveyInsights(
        selectedResponses.length,
        questionResults.map((question) => ({
          prompt: question.prompt,
          type: question.type,
          answers: question.answers,
          textAnswerCount: question.textAnswerCount,
        })),
      ),
      generatedAt: new Date(),
    };
  }

  private safeExportName(value: string) {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 70) || 'encuesta'
    );
  }

  private ineExtension(mimeType?: string | null) {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
  }

  private async exportDataset(
    surveyId: string,
    companyId: string,
    userId: string,
  ) {
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, companyId, createdById: userId },
      include: {
        questions: { orderBy: { sortOrder: 'asc' } },
        responses: {
          orderBy: { folio: 'asc' },
          include: { respondent: true, answers: true, ineSubmission: true },
        },
      },
    });
    if (!survey) throw new NotFoundException('La encuesta no existe');
    const rows = survey.responses.map((response) => ({
      responseId: response.id,
      folio: String(response.folio).padStart(6, '0'),
      completedAt: response.completedAt,
      name: decryptSurveyValue(response.respondent?.nameCipher),
      phone: decryptSurveyValue(response.respondent?.phoneCipher),
      email: decryptSurveyValue(response.respondent?.emailCipher),
      municipality: decryptSurveyValue(response.respondent?.municipalityCipher),
      locality: decryptSurveyValue(response.respondent?.localityCipher),
      postalCode: decryptSurveyValue(response.respondent?.postalCodeCipher),
      address: decryptSurveyValue(response.respondent?.addressCipher),
      curp: decryptSurveyValue(response.respondent?.curpCipher),
      voterKey: decryptSurveyValue(response.respondent?.voterKeyCipher),
      electoralSection: decryptSurveyValue(
        response.respondent?.electoralSectionCipher,
      ),
      answers: new Map(
        response.answers.map((answer) => [answer.questionId, answer.value]),
      ),
      ine: response.ineSubmission,
    }));
    return { survey, rows };
  }

  private answerForExport(value: Prisma.JsonValue | undefined) {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return value.map(String).join(' | ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private async buildSurveyWorkbook(
    surveyId: string,
    companyId: string,
    userId: string,
  ) {
    const { survey, rows } = await this.exportDataset(
      surveyId,
      companyId,
      userId,
    );
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Yalika';
    workbook.created = new Date();
    const summary = workbook.addWorksheet('Resumen');
    summary.mergeCells('A1:F1');
    summary.getCell('A1').value = `Yalika · ${survey.title}`;
    summary.getCell('A1').font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFFFFFF' },
    };
    summary.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF17365D' },
    };
    summary.getCell('A1').alignment = { horizontal: 'center' };
    summary.addRow([]);
    summary.addRow(['Indicador', 'Valor']);
    summary.addRow(['Encuesta', survey.title]);
    summary.addRow(['Respuestas', rows.length]);
    summary.addRow([
      'INE disponibles',
      rows.filter(
        (row) => row.ine && !row.ine.deletedAt && row.ine.frontObjectKey,
      ).length,
    ]);
    summary.addRow([
      'Frente + reverso',
      rows.filter((row) => row.ine?.backObjectKey && !row.ine.deletedAt).length,
    ]);
    summary.addRow(['Generado', new Date().toLocaleString('es-MX')]);
    summary.columns = [{ width: 24 }, { width: 45 }];

    const sheet = workbook.addWorksheet('Respuestas', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const fixed = [
      'Folio',
      'Fecha',
      'Nombre',
      'Teléfono',
      'Correo',
      'Municipio',
      'Colonia/localidad',
      'Código postal',
      'Domicilio',
      'CURP',
      'Clave de elector',
      'Sección electoral',
      'INE',
      'Abrir frente',
      'Abrir reverso',
    ];
    sheet.addRow([
      ...fixed,
      ...survey.questions.map((q, i) => `${i + 1}. ${q.prompt}`),
    ]);
    const hdr = sheet.getRow(1);
    hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hdr.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF17365D' },
    };
    hdr.alignment = { vertical: 'middle', wrapText: true };
    for (const row of rows) {
      const front = Boolean(
        row.ine && !row.ine.deletedAt && row.ine.frontObjectKey,
      );
      const back = Boolean(
        row.ine && !row.ine.deletedAt && row.ine.backObjectKey,
      );
      const vals: any[] = [
        row.folio,
        row.completedAt,
        row.name || '',
        row.phone || '',
        row.email || '',
        row.municipality || '',
        row.locality || '',
        row.postalCode || '',
        row.address || '',
        row.curp || '',
        row.voterKey || '',
        row.electoralSection || '',
        back ? 'Frente + reverso' : front ? 'Frente' : 'No',
        front
          ? {
              text: 'Abrir frente',
              hyperlink: `INE_ORIGINALES/${row.folio}_FRENTE.${this.ineExtension(row.ine?.frontMimeType)}`,
            }
          : '',
        back
          ? {
              text: 'Abrir reverso',
              hyperlink: `INE_ORIGINALES/${row.folio}_REVERSO.${this.ineExtension(row.ine?.backMimeType)}`,
            }
          : '',
        ...survey.questions.map((q) =>
          this.answerForExport(row.answers.get(q.id)),
        ),
      ];
      const added = sheet.addRow(vals);
      added.getCell(1).numFmt = '@';
      added.getCell(2).numFmt = 'dd/mm/yyyy hh:mm';
      added.alignment = { vertical: 'top', wrapText: true };
    }
    if (sheet.columnCount > 0)
      sheet.autoFilter = {
        from: 'A1',
        to: sheet.getRow(1).getCell(sheet.columnCount).address,
      };
    sheet.columns.forEach((column, index) => {
      column.width = index === 8 ? 34 : index >= fixed.length ? 28 : 18;
    });
    const sections = workbook.addWorksheet('Secciones');
    sections.addRow(['Sección electoral', 'Respuestas']);
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.electoralSection || 'Sin sección';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of [...counts.entries()].sort(([a], [b]) =>
      a.localeCompare(b, 'es-MX'),
    ))
      sections.addRow([key, count]);
    sections.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sections.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF17365D' },
    };
    sections.columns = [{ width: 24 }, { width: 14 }];
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      survey,
      rows,
    };
  }

  async exportExcel(surveyId: string, companyId: string, userId: string) {
    const built = await this.buildSurveyWorkbook(surveyId, companyId, userId);
    return {
      data: built.buffer,
      filename: `${this.safeExportName(built.survey.title)}_resultados.xlsx`,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async exportIneArchive(surveyId: string, companyId: string, userId: string) {
    const { survey, rows } = await this.exportDataset(
      surveyId,
      companyId,
      userId,
    );
    const total = rows.reduce(
      (sum, row) =>
        sum +
        (row.ine && !row.ine.deletedAt
          ? row.ine.frontBytes + row.ine.backBytes
          : 0),
      0,
    );
    if (total > 600 * 1024 * 1024)
      throw new BadRequestException(
        'El paquete supera 600 MB. Descarga por periodos o respalda con mayor frecuencia.',
      );
    const zip = new JSZip();
    const folder = zip.folder('INE_ORIGINALES');
    if (!folder) throw new BadRequestException('No pude preparar las INE');
    let count = 0;
    for (const row of rows) {
      const ine = row.ine;
      if (!ine || ine.deletedAt || !ine.frontObjectKey) continue;
      folder.file(
        `${row.folio}_FRENTE.${this.ineExtension(ine.frontMimeType)}`,
        await this.ineStorage.read(ine.frontObjectKey),
      );
      count++;
      if (ine.backObjectKey)
        folder.file(
          `${row.folio}_REVERSO.${this.ineExtension(ine.backMimeType)}`,
          await this.ineStorage.read(ine.backObjectKey),
        );
    }
    zip.file(
      'LEEME.txt',
      `Yalika · ${survey.title}\nDocumentos: ${count}\nLos nombres usan el mismo folio del Excel.\n`,
    );
    return {
      data: await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      }),
      filename: `${this.safeExportName(survey.title)}_INE.zip`,
      type: 'application/zip',
    };
  }

  async exportBackup(surveyId: string, companyId: string, userId: string) {
    const built = await this.buildSurveyWorkbook(surveyId, companyId, userId);
    const total = built.rows.reduce(
      (sum, row) =>
        sum +
        (row.ine && !row.ine.deletedAt
          ? row.ine.frontBytes + row.ine.backBytes
          : 0),
      0,
    );
    if (total > 600 * 1024 * 1024)
      throw new BadRequestException(
        'El respaldo supera 600 MB. Descarga las INE por partes o respalda con mayor frecuencia.',
      );
    const zip = new JSZip();
    zip.file('Reporte_Encuesta.xlsx', built.buffer);
    const folder = zip.folder('INE_ORIGINALES');
    if (!folder) throw new BadRequestException('No pude preparar el respaldo');
    const manifest: Array<Record<string, string | boolean>> = [];
    for (const row of built.rows) {
      const ine = row.ine;
      const item: Record<string, string | boolean> = {
        folio: row.folio,
        responseId: row.responseId,
        completedAt: row.completedAt.toISOString(),
        electoralSection: row.electoralSection || '',
        ineFront: false,
        ineBack: false,
      };
      if (ine && !ine.deletedAt && ine.frontObjectKey) {
        const fn = `${row.folio}_FRENTE.${this.ineExtension(ine.frontMimeType)}`;
        folder.file(fn, await this.ineStorage.read(ine.frontObjectKey));
        item.ineFront = fn;
        if (ine.backObjectKey) {
          const bn = `${row.folio}_REVERSO.${this.ineExtension(ine.backMimeType)}`;
          folder.file(bn, await this.ineStorage.read(ine.backObjectKey));
          item.ineBack = bn;
        }
      }
      manifest.push(item);
    }
    zip.file(
      'manifest.json',
      JSON.stringify(
        {
          surveyId,
          title: built.survey.title,
          exportedAt: new Date().toISOString(),
          responses: manifest,
        },
        null,
        2,
      ),
    );
    zip.file(
      'LEEME.txt',
      'Respaldo Yalika. El folio del Excel coincide con las fotografías. Extrae todo el ZIP antes de abrir enlaces del Excel.\n',
    );
    return {
      data: await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      }),
      filename: `${this.safeExportName(built.survey.title)}_RESPALDO_COMPLETO.zip`,
      type: 'application/zip',
    };
  }

  private async cleanupExpiredIne(surveyId?: string) {
    const expired = await this.prisma.surveyIneSubmission.findMany({
      where: {
        ...(surveyId ? { surveyId } : {}),
        deletedAt: null,
        backupConfirmedAt: { not: null },
        expiresAt: {
          lte: new Date(),
        },
      },
      select: {
        id: true,
        frontObjectKey: true,
        backObjectKey: true,
      },
      take: 25,
    });

    for (const item of expired) {
      try {
        await this.ineStorage.deletePair(item);
        await this.prisma.surveyIneSubmission.update({
          where: { id: item.id },
          data: {
            frontObjectKey: null,
            backObjectKey: null,
            deletedAt: new Date(),
          },
        });
      } catch {
        // Se intentará nuevamente al abrir la lista de documentos.
      }
    }
  }

  async ineSubmissions(surveyId: string, companyId: string, userId: string) {
    await this.findOne(surveyId, companyId, userId);
    await this.cleanupExpiredIne(surveyId);

    const submissions = await this.prisma.surveyIneSubmission.findMany({
      where: {
        surveyId,
      },
      include: {
        response: {
          select: {
            folio: true,
            completedAt: true,
            respondent: {
              select: {
                nameCipher: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return submissions.map((item) => ({
      id: item.id,
      folio: String(item.response.folio).padStart(6, '0'),
      personName:
        decryptSurveyValue(item.response.respondent?.nameCipher) ||
        'Participación anónima',
      completedAt: item.response.completedAt,
      expiresAt: item.expiresAt,
      downloadedAt: item.downloadedAt,
      downloadCount: item.downloadCount,
      backupConfirmedAt: item.backupConfirmedAt,
      deletedAt: item.deletedAt,
      available: Boolean(!item.deletedAt && item.frontObjectKey),
      retentionOverdue: Boolean(
        !item.deletedAt &&
        item.frontObjectKey &&
        item.expiresAt <= new Date() &&
        !item.backupConfirmedAt,
      ),
      hasBack: Boolean(!item.deletedAt && item.backObjectKey),
      totalBytes: item.frontBytes + item.backBytes,
    }));
  }

  async confirmBackup(
    surveyId: string,
    companyId: string,
    userId: string,
    confirmed: boolean,
  ) {
    if (!confirmed) {
      throw new BadRequestException(
        'Confirma que guardaste el respaldo antes de marcarlo como protegido',
      );
    }
    await this.findOne(surveyId, companyId, userId);
    const confirmedAt = new Date();
    const result = await this.prisma.surveyIneSubmission.updateMany({
      where: {
        surveyId,
        deletedAt: null,
        frontObjectKey: { not: null },
      },
      data: { backupConfirmedAt: confirmedAt },
    });
    return { confirmed: true, count: result.count, confirmedAt };
  }

  async purgeBackedUpIne(
    surveyId: string,
    companyId: string,
    userId: string,
    confirmed: boolean,
  ) {
    if (!confirmed) {
      throw new BadRequestException(
        'Confirma que deseas liberar del servidor sólo las INE ya respaldadas',
      );
    }
    await this.findOne(surveyId, companyId, userId);
    const items = await this.prisma.surveyIneSubmission.findMany({
      where: {
        surveyId,
        deletedAt: null,
        backupConfirmedAt: { not: null },
        frontObjectKey: { not: null },
      },
      select: { id: true, frontObjectKey: true, backObjectKey: true },
    });
    let deleted = 0;
    for (const item of items) {
      await this.ineStorage.deletePair(item);
      await this.prisma.surveyIneSubmission.update({
        where: { id: item.id },
        data: {
          frontObjectKey: null,
          backObjectKey: null,
          deletedAt: new Date(),
        },
      });
      deleted += 1;
    }
    return { deleted, onlyBackedUp: true };
  }

  async downloadIne(
    surveyId: string,
    submissionId: string,
    side: string,
    companyId: string,
    userId: string,
  ) {
    if (side !== 'front' && side !== 'back') {
      throw new BadRequestException('Elige frente o reverso de la INE');
    }

    await this.findOne(surveyId, companyId, userId);
    const submission = await this.prisma.surveyIneSubmission.findFirst({
      where: {
        id: submissionId,
        surveyId,
      },
      include: {
        response: { select: { folio: true } },
      },
    });

    if (!submission || submission.deletedAt) {
      throw new NotFoundException('Estas fotografías ya no están disponibles');
    }

    const key =
      side === 'front' ? submission.frontObjectKey : submission.backObjectKey;
    const mimeType =
      side === 'front' ? submission.frontMimeType : submission.backMimeType;
    if (!key || !mimeType) {
      throw new NotFoundException('La fotografía no está disponible');
    }

    const data = await this.ineStorage.read(key);
    await this.prisma.surveyIneSubmission.update({
      where: { id: submission.id },
      data: {
        downloadedAt: new Date(),
        downloadCount: {
          increment: 1,
        },
      },
    });

    return {
      data,
      mimeType,
      side,
      folio: String(submission.response.folio).padStart(6, '0'),
    };
  }

  async deleteIne(
    surveyId: string,
    submissionId: string,
    companyId: string,
    userId: string,
  ) {
    await this.findOne(surveyId, companyId, userId);
    const submission = await this.prisma.surveyIneSubmission.findFirst({
      where: {
        id: submissionId,
        surveyId,
      },
    });

    if (!submission) {
      throw new NotFoundException('El documento no existe');
    }
    if (submission.deletedAt) {
      return { deleted: true, id: submission.id };
    }

    await this.ineStorage.deletePair(submission);
    await this.prisma.surveyIneSubmission.update({
      where: { id: submission.id },
      data: {
        frontObjectKey: null,
        backObjectKey: null,
        deletedAt: new Date(),
      },
    });

    return { deleted: true, id: submission.id };
  }

  async publicResults(slug: string) {
    const survey = await this.prisma.survey.findUnique({
      where: {
        slug: slug.trim().toLowerCase(),
      },
    });

    if (
      !survey ||
      (survey.accessMode ?? 'public') !== 'public' ||
      !survey.showPublicResults ||
      !surveyIsOpen(survey)
    ) {
      throw new NotFoundException('Los resultados no están disponibles');
    }

    return this.resultsById(survey.id);
  }
}

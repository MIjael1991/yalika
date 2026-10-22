import { BadRequestException } from '@nestjs/common';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { SurveyService } from './survey.service';
import {
  assertCanOpen,
  effectiveSurveyStatus,
  resolveClosesAt,
  surveyIsOpen,
} from './survey-closing';

const now = new Date('2026-10-22T20:00:00.000Z');
const before = new Date('2026-10-22T19:59:59.000Z');
const after = new Date('2026-10-30T18:00:00.000Z');

describe('cierre automático de encuestas', () => {
  it('encuesta abierta sin fecha: sigue recibiendo respuestas', () => {
    const survey = { status: 'active', closesAt: null };
    expect(surveyIsOpen(survey, now)).toBe(true);
    expect(effectiveSurveyStatus(survey, now)).toBe('active');
  });

  it('encuesta de opinión con fecha futura: abierta hasta que llegue la fecha', () => {
    const survey = { status: 'active', closesAt: after };
    expect(surveyIsOpen(survey, now)).toBe(true);
    expect(surveyIsOpen(survey, after)).toBe(false);
  });

  it('encuesta con fecha vencida: se muestra y comporta como cerrada', () => {
    const survey = { status: 'active', closesAt: before };
    expect(surveyIsOpen(survey, now)).toBe(false);
    expect(effectiveSurveyStatus(survey, now)).toBe('closed');
  });

  it('borrador o cerrada a mano nunca reciben respuestas, con o sin fecha', () => {
    expect(surveyIsOpen({ status: 'draft', closesAt: after }, now)).toBe(false);
    expect(effectiveSurveyStatus({ status: 'draft', closesAt: before }, now)).toBe(
      'draft',
    );
    expect(surveyIsOpen({ status: 'closed', closesAt: null }, now)).toBe(false);
  });

  describe('resolveClosesAt', () => {
    it('sin dato no cambia la fecha actual', () => {
      expect(resolveClosesAt(undefined, after, now)).toBe(after);
      expect(resolveClosesAt(undefined, null, now)).toBeNull();
    });

    it('null o vacío quita la fecha', () => {
      expect(resolveClosesAt(null, after, now)).toBeNull();
      expect(resolveClosesAt('', after, now)).toBeNull();
    });

    it('acepta una fecha futura', () => {
      expect(resolveClosesAt(after.toISOString(), null, now)).toEqual(after);
    });

    it('rechaza fechas pasadas o inválidas', () => {
      expect(() => resolveClosesAt(before.toISOString(), null, now)).toThrow(
        BadRequestException,
      );
      expect(() => resolveClosesAt('no es fecha', null, now)).toThrow(
        'La fecha de cierre no es válida',
      );
    });

    it('permite conservar una fecha ya vencida si no se modificó', () => {
      expect(resolveClosesAt(before.toISOString(), before, now)).toEqual(before);
    });
  });

  it('no deja abrir una encuesta cuya fecha ya pasó', () => {
    expect(() => assertCanOpen('active', before, now)).toThrow(
      'La fecha de cierre ya pasó',
    );
    expect(() => assertCanOpen('active', after, now)).not.toThrow();
    expect(() => assertCanOpen('draft', before, now)).not.toThrow();
    expect(() => assertCanOpen('closed', before, now)).not.toThrow();
  });
});

describe('SurveyService con fecha de cierre vencida', () => {
  const expired = {
    id: 'survey-1',
    slug: 'consulta',
    status: 'active',
    accessMode: 'public',
    closesAt: new Date(Date.now() - 60_000),
    questions: [],
    _count: { responses: 3 },
  };
  const serviceWith = (prisma: object) =>
    new SurveyService(prisma as never, {} as never, {} as never);

  it('el enlace público avisa que la encuesta ya terminó', async () => {
    const service = serviceWith({
      survey: { findUnique: jest.fn().mockResolvedValue(expired) },
    });
    await expect(service.findPublic('consulta')).rejects.toThrow(
      'Esta encuesta ya terminó y no recibe más respuestas.',
    );
  });

  it('no recibe respuestas aunque siga marcada como activa', async () => {
    const service = serviceWith({
      survey: { findUnique: jest.fn().mockResolvedValue(expired) },
    });
    await expect(service.submit('consulta', {} as never)).rejects.toThrow(
      'Esta encuesta no existe o ya no acepta respuestas',
    );
  });

  it('el panel del dueño la muestra como cerrada', async () => {
    const service = serviceWith({
      survey: { findMany: jest.fn().mockResolvedValue([expired]) },
    });
    const [survey] = await service.findAll('company-1', 'user-1');
    expect(survey.status).toBe('closed');
  });

  it('no se puede reabrir sin cambiar o quitar la fecha', async () => {
    const update = jest.fn();
    const service = serviceWith({
      survey: { findFirst: jest.fn().mockResolvedValue(expired), update },
    });
    await expect(
      service.updateStatus('survey-1', 'active', 'company-1', 'user-1'),
    ).rejects.toThrow('La fecha de cierre ya pasó');
    expect(update).not.toHaveBeenCalled();
  });
});

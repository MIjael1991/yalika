import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { parseParticipants } from './survey-invitations';
jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { SurveyService } from './survey.service';
const token = randomBytes(32).toString('base64url');
function fixture(extra: Record<string, unknown> = {}) {
  const survey = {
    id: 's1',
    companyId: 'c1',
    status: 'active',
    identityMode: 'anonymous',
    accessMode: 'public',
    questions: [],
    collectIne: false,
    privacyNotice: 'Aviso',
    _count: { responses: 0 },
    ...extra,
  };
  const tx = {
    surveyInvitation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    survey: { update: jest.fn().mockResolvedValue({ nextFolio: 1 }) },
    surveyResponse: {
      create: jest.fn().mockResolvedValue({ id: 'r1', folio: 1 }),
    },
    event: {
      create: jest.fn().mockResolvedValue({
        id: 'survey.response.completed:r1',
      }),
    },
    surveyRespondent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
    },
  };
  const db = {
    survey: {
      findUnique: jest.fn().mockResolvedValue(survey),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    surveyInvitation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'i1', usedAt: null }),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  const storage = {
    prepareImage: jest.fn(),
    storePair: jest.fn(),
    deletePair: jest.fn(),
  };
  return {
    service: new SurveyService(db as never, storage as never, {} as never),
    db,
    tx,
    storage,
  };
}
describe('R12D access and personal fields', () => {
  const previous = process.env.SURVEY_PII_KEY;
  beforeAll(() => {
    process.env.SURVEY_PII_KEY = Buffer.alloc(32, 8).toString('base64');
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.SURVEY_PII_KEY;
    else process.env.SURVEY_PII_KEY = previous;
  });
  it('writes only minimal event metadata from the database company', async () => {
    const { service, tx } = fixture({
      personalFields: [{ key: 'phone', required: true }],
    });

    await expect(
      service.submit('demo', {
        acceptPrivacy: true,
        person: { phone: '4431234567' },
        answers: {},
      }),
    ).resolves.toMatchObject({ id: 'r1' });

    expect(tx.event.create).toHaveBeenCalledTimes(1);

    expect(tx.event.create).toHaveBeenCalledWith({
      data: {
        id: 'survey.response.completed:r1',
        type: 'survey.response.completed.v1',
        source: 'survey',
        entityType: 'survey',
        entityId: 's1',
        companyId: 'c1',
        data: { responseId: 'r1' },
      },
    });
  });

  it('does not report success when the event write fails', async () => {
    const { service, tx } = fixture();

    tx.event.create.mockRejectedValueOnce(new Error('event-write-failed'));

    await expect(
      service.submit('demo', {
        acceptPrivacy: true,
        answers: {},
      }),
    ).rejects.toThrow('event-write-failed');

    expect(tx.surveyResponse.create).toHaveBeenCalledTimes(1);
    expect(tx.event.create).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, 'public'])(
    'preserves historical/public access %s',
    async (accessMode) => {
      const { service, db } = fixture({ accessMode });
      await expect(service.findPublic('demo')).resolves.toMatchObject({
        id: 's1',
      });
      await expect(
        service.submit('demo', { acceptPrivacy: true, answers: {} }),
      ).resolves.toMatchObject({ id: 'r1' });
      expect(db.surveyInvitation.findFirst).not.toHaveBeenCalled();
    },
  );
  it.each(['group', 'private'])(
    'blocks general GET and direct POST for %s',
    async (accessMode) => {
      const { service, db } = fixture({ accessMode });
      await expect(service.findPublic('demo')).rejects.toThrow(
        'enlace individual',
      );
      await expect(
        service.submit('demo', { acceptPrivacy: true, answers: {} }),
      ).rejects.toThrow('enlace individual');
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );
  it('scopes tokens to survey and rejects used invitations', async () => {
    const { service, db } = fixture({ accessMode: 'private' });
    db.surveyInvitation.findFirst.mockResolvedValueOnce(null);
    await expect(service.findPublic('demo', token)).rejects.toThrow(
      'no es válido',
    );
    expect(db.surveyInvitation.findFirst).toHaveBeenCalledWith({
      where: { surveyId: 's1', tokenHash: expect.any(String) as unknown },
    });
    db.surveyInvitation.findFirst.mockResolvedValueOnce({
      id: 'i1',
      usedAt: new Date(),
    });
    await expect(
      service.submit('demo', {
        invitationToken: token,
        acceptPrivacy: true,
        answers: {},
      }),
    ).rejects.toThrow('ya fue utilizado');
  });
  it('claims once in transaction and refuses a losing concurrent submit', async () => {
    const { service, tx } = fixture({ accessMode: 'group' });
    await expect(
      service.submit('demo', {
        invitationToken: token,
        acceptPrivacy: true,
        answers: {},
      }),
    ).resolves.toMatchObject({ id: 'r1' });
    expect(tx.surveyInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', surveyId: 's1', usedAt: null },
      data: { usedAt: expect.any(Date) as unknown },
    });
    tx.surveyInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.submit('demo', {
        invitationToken: token,
        acceptPrivacy: true,
        answers: {},
      }),
    ).rejects.toThrow('ya fue utilizado');
    expect(tx.surveyResponse.create).toHaveBeenCalledTimes(1);
  });
  it('does not consume a token if required answers are missing', async () => {
    const { service, tx } = fixture({
      accessMode: 'group',
      questions: [{ id: 'q', prompt: 'Opinión', type: 'text', required: true }],
    });
    await expect(
      service.submit('demo', {
        invitationToken: token,
        acceptPrivacy: true,
        answers: {},
      }),
    ).rejects.toThrow('Falta responder');
    expect(tx.surveyInvitation.updateMany).not.toHaveBeenCalled();
  });
  it('requires configured field and accepts absent optional address', async () => {
    const { service } = fixture({
      personalFields: [
        { key: 'name', required: true },
        { key: 'address', required: false },
      ],
    });
    await expect(
      service.submit('demo', { acceptPrivacy: true, answers: {} }),
    ).rejects.toThrow('Falta completar');
    await expect(
      service.submit('demo', {
        acceptPrivacy: true,
        person: { name: 'Persona demo' },
        answers: {},
      }),
    ).resolves.toMatchObject({ id: 'r1' });
  });
  it('does not reuse personal records from other surveys', async () => {
    const { service, tx } = fixture({
      personalFields: [{ key: 'phone', required: true }],
    });
    await service.submit('demo', {
      acceptPrivacy: true,
      person: { phone: '4431234567' },
      answers: {},
    });
    expect(tx.surveyRespondent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'c1',
          responses: { some: { surveyId: 's1' } },
        }) as unknown,
      }),
    );
  });
  it('blocks unauthorized owner import and export before list access', async () => {
    const { service, db } = fixture();
    await expect(
      service.importParticipants(
        's1',
        'other-company',
        'other-user',
        'demo.csv',
        '',
      ),
    ).rejects.toThrow('La encuesta no existe');
    await expect(
      service.exportInvitations('s1', 'other-company', 'other-user'),
    ).rejects.toThrow('La encuesta no existe');
    expect(db.surveyInvitation.createMany).not.toHaveBeenCalled();
    expect(db.surveyInvitation.findMany).not.toHaveBeenCalled();
  });
  it('blocks extraction and public results for restricted surveys', async () => {
    const { service, storage } = fixture({
      accessMode: 'private',
      collectIne: true,
      ineAutoExtract: true,
      showPublicResults: true,
    });
    await expect(
      service.extractIneFront('demo', { frontImage: 'photo' }, 'test'),
    ).rejects.toThrow('enlace individual');
    await expect(service.publicResults('demo')).rejects.toThrow(
      'no están disponibles',
    );
    expect(storage.prepareImage).not.toHaveBeenCalled();
  });
});
describe('participant import', () => {
  it('reads semicolon CSV with accents and quotes; deduplicates contacts', async () => {
    const csv =
      'Nombre;Correo;Teléfono/Celular;Grupo;Referencia\n"Pérez; Ana";ANA@example.com;;Segundo;A\nAna;ana@example.com;;;';
    expect(
      await parseParticipants('demo.csv', Buffer.from(csv).toString('base64')),
    ).toEqual([
      {
        name: 'Pérez; Ana',
        email: 'ana@example.com',
        phone: '',
        group: 'Segundo',
        reference: 'A',
      },
    ]);
  });
  it('reads an actual xlsx workbook and a phone-only participant', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Personas');
    sheet.addRow(['Nombre', 'Celular']);
    sheet.addRow(['Persona demo', '4431234567']);
    expect(
      await parseParticipants(
        'demo.xlsx',
        Buffer.from(await book.xlsx.writeBuffer()).toString('base64'),
      ),
    ).toEqual([
      {
        name: 'Persona demo',
        email: '',
        phone: '4431234567',
        group: '',
        reference: '',
      },
    ]);
  });
  it('rejects name-only list and malformed email', async () => {
    await expect(
      parseParticipants(
        'demo.csv',
        Buffer.from('Nombre\nAna').toString('base64'),
      ),
    ).rejects.toThrow('Correo');
    await expect(
      parseParticipants(
        'demo.csv',
        Buffer.from('Nombre,Correo\nAna,invalido').toString('base64'),
      ),
    ).rejects.toThrow('Fila 2');
  });
});

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import ExcelJS from 'exceljs';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import {
  accessCodeHash,
  formatAccessCode,
  newAccessCode,
  normalizeAccessCode,
} from './survey-access-code';
import { parseParticipants } from './survey-invitations';
import { decryptSurveyValue, encryptSurveyValue } from './survey-privacy';
import { SurveyService } from './survey.service';

const b64 = (text: string) => Buffer.from(text).toString('base64');
const previousKey = process.env.SURVEY_PII_KEY;
const previousUrl = process.env.YALIKA_PUBLIC_URL;

beforeAll(() => {
  process.env.SURVEY_PII_KEY = Buffer.alloc(32, 7).toString('base64');
  delete process.env.YALIKA_PUBLIC_URL;
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.SURVEY_PII_KEY;
  else process.env.SURVEY_PII_KEY = previousKey;
  if (previousUrl !== undefined) process.env.YALIKA_PUBLIC_URL = previousUrl;
});

describe('códigos de acceso', () => {
  it('tienen 8 caracteres sin letras ni números confundibles y se muestran en dos bloques', () => {
    const code = newAccessCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(code).not.toMatch(/[ILO01]/);
    expect(formatAccessCode('K7M4PQ2X')).toBe('K7M4-PQ2X');
  });

  it('no se repiten en una lista grande', () => {
    const codes = new Set(Array.from({ length: 3000 }, () => newAccessCode()));
    expect(codes.size).toBe(3000);
  });

  it('se aceptan en minúsculas, con espacios o con guion; lo demás se rechaza', () => {
    expect(normalizeAccessCode('k7m4-pq2x')).toBe('K7M4PQ2X');
    expect(normalizeAccessCode(' K7M4 PQ2X ')).toBe('K7M4PQ2X');
    expect(normalizeAccessCode('K7M4PQ2')).toBeNull();
    expect(normalizeAccessCode('K7M4PQ2O')).toBeNull();
    expect(normalizeAccessCode('hola')).toBeNull();
  });

  it('su huella es estable y distinta en cada encuesta', () => {
    expect(accessCodeHash('s1', 'K7M4PQ2X')).toBe(
      accessCodeHash('s1', 'K7M4PQ2X'),
    );
    expect(accessCodeHash('s1', 'K7M4PQ2X')).not.toBe(
      accessCodeHash('s2', 'K7M4PQ2X'),
    );
    expect(accessCodeHash('s1', 'K7M4PQ2X')).not.toContain('K7M4PQ2X');
  });
});

describe('lista de participantes tolerante (con código)', () => {
  const lenient = { lenient: true };

  it('acepta una lista solo con nombres', async () => {
    const list = await parseParticipants(
      'lista.csv',
      b64('Nombre\nAna\nLuis'),
      lenient,
    );
    expect(list.map((item) => item.name)).toEqual(['Ana', 'Luis']);
  });

  it('un correo o teléfono mal escrito no detiene la importación y queda como nota', async () => {
    const list = await parseParticipants(
      'lista.csv',
      b64('Nombre,Correo,Teléfono\nAna,ana@@x,123\nLuis,luis@x.com,4431234567'),
      lenient,
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ name: 'Ana', email: '', phone: '' });
    expect(list[0].reference).toContain('correo no válido: ana@@x');
    expect(list[0].reference).toContain('teléfono no válido: 123');
    expect(list[1]).toMatchObject({
      email: 'luis@x.com',
      phone: '4431234567',
      reference: '',
    });
  });

  it('no pierde a nadie aunque la fila solo traiga un dato inválido', async () => {
    const list = await parseParticipants(
      'lista.csv',
      b64('Correo\nmal'),
      lenient,
    );
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Persona de la fila 2');
  });

  it('distingue homónimos por Referencia y quita repetidos exactos', async () => {
    const list = await parseParticipants(
      'lista.csv',
      b64(
        'Nombre,Referencia\nJuan Pérez,Sección 1\nJuan Pérez,Sección 2\njuan perez,Sección 1',
      ),
      lenient,
    );
    expect(list.map((item) => item.reference)).toEqual([
      'Sección 1',
      'Sección 2',
    ]);
  });
});

describe('encuestas con código de acceso', () => {
  const group = { id: 's1', accessMode: 'group', slug: 'grupo', questions: [] };
  const build = () => {
    const db = {
      survey: { findFirst: jest.fn(), findUnique: jest.fn() },
      surveyInvitation: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    db.surveyInvitation.createMany.mockImplementation(
      ({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length }),
    );
    return {
      db,
      service: new SurveyService(db as never, {} as never, {} as never),
    };
  };
  const importedRows = (db: ReturnType<typeof build>['db']) =>
    (
      db.surveyInvitation.createMany.mock.calls[0][0] as {
        data: { codeHash: string; codeCipher: string; contactHash: string }[];
      }
    ).data;

  it('A · grupo con un correo equivocado: todos reciben código', async () => {
    const { db, service } = build();
    db.survey.findFirst.mockResolvedValue(group);
    const csv =
      'Nombre,Correo,Teléfono\nAna,ana@@x,\nLuis,luis@x.com,\nRosa,,4431234567';

    const result = await service.importParticipants(
      's1',
      'c1',
      'u1',
      'lista.csv',
      b64(csv),
    );

    expect(result).toEqual({ imported: 3, skipped: 0 });
    const rows = importedRows(db);
    const codes = rows.map((row) => decryptSurveyValue(row.codeCipher));
    expect(codes.every((code) => normalizeAccessCode(code) === code)).toBe(true);
    expect(new Set(codes).size).toBe(3);
    rows.forEach((row, index) =>
      expect(row.codeHash).toBe(accessCodeHash('s1', codes[index])),
    );
  });

  it('B · privada solo con nombres: se importa y cada persona tiene su código', async () => {
    const { db, service } = build();
    db.survey.findFirst.mockResolvedValue({ ...group, accessMode: 'private' });

    const result = await service.importParticipants(
      's1',
      'c1',
      'u1',
      'lista.csv',
      b64('Nombre\nMaría López\nJosé Ruiz'),
    );

    expect(result.imported).toBe(2);
    const rows = importedRows(db);
    expect(new Set(rows.map((row) => row.contactHash)).size).toBe(2);
    expect(new Set(rows.map((row) => row.codeHash)).size).toBe(2);
  });

  it('C · lista anterior sin códigos: al exportar se les asigna y el Excel los trae', async () => {
    const { db, service } = build();
    db.survey.findFirst.mockResolvedValue(group);
    const legacy = (name: string, usedAt: Date | null, id: string) => ({
      id,
      usedAt,
      codeCipher: null,
      tokenCipher: encryptSurveyValue('t'.repeat(43)),
      detailsCipher: encryptSurveyValue(
        JSON.stringify({ name, email: '', phone: '', group: '', reference: '' }),
      ),
    });
    db.surveyInvitation.findMany
      .mockResolvedValueOnce([
        legacy('Pendiente', null, 'i1'),
        legacy('Ya respondió', new Date(), 'i2'),
      ])
      .mockResolvedValueOnce([]);

    const file = await service.exportInvitations('s1', 'c1', 'u1');

    expect(db.surveyInvitation.update).toHaveBeenCalledTimes(1);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.data as never);
    const sheet = book.worksheets[0];
    expect(sheet.getRow(1).getCell(6).text).toBe('Código de acceso');
    expect(sheet.getRow(2).getCell(6).text).toMatch(
      /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/,
    );
    expect(sheet.getRow(2).getCell(8).text).toBe('Pendiente');
    expect(sheet.getRow(3).getCell(6).text).toBe('');
    expect(sheet.getRow(3).getCell(8).text).toBe('Respondida');
  });

  describe('entrar con el código', () => {
    const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
    const open = { id: 's1', status: 'active', closesAt: null, accessMode: 'group' };

    it('un código correcto entrega el enlace personal (también con minúsculas y guion)', async () => {
      const { db, service } = build();
      db.survey.findUnique.mockResolvedValue(open);
      db.surveyInvitation.findFirst.mockResolvedValue({
        usedAt: null,
        tokenCipher: encryptSurveyValue(token),
      });

      await expect(
        service.accessByCode('grupo', { code: 'k7m4-pq2x' }, 'ip-1'),
      ).resolves.toEqual({ invitation: token });
      expect(db.surveyInvitation.findFirst).toHaveBeenCalledWith({
        where: { surveyId: 's1', codeHash: accessCodeHash('s1', 'K7M4PQ2X') },
      });
    });

    it('código mal escrito, inexistente o ya usado dan el mismo mensaje', async () => {
      const { db, service } = build();
      db.survey.findUnique.mockResolvedValue(open);
      const fail = 'El código no es válido o ya fue utilizado';

      await expect(
        service.accessByCode('grupo', { code: 'hola' }, 'ip-1'),
      ).rejects.toThrow(fail);
      db.surveyInvitation.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.accessByCode('grupo', { code: 'K7M4PQ2X' }, 'ip-1'),
      ).rejects.toThrow(fail);
      db.surveyInvitation.findFirst.mockResolvedValueOnce({
        usedAt: new Date(),
        tokenCipher: encryptSurveyValue(token),
      });
      await expect(
        service.accessByCode('grupo', { code: 'K7M4PQ2X' }, 'ip-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('después de 8 intentos fallidos se bloquea a esa persona, no a las demás', async () => {
      const { db, service } = build();
      db.survey.findUnique.mockResolvedValue(open);
      db.surveyInvitation.findFirst.mockResolvedValue(null);

      for (let attempt = 0; attempt < 8; attempt++) {
        await expect(
          service.accessByCode('grupo', { code: 'K7M4PQ2X' }, 'ip-bot'),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      const lookups = db.surveyInvitation.findFirst.mock.calls.length;
      await expect(
        service.accessByCode('grupo', { code: 'K7M4PQ2X' }, 'ip-bot'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.surveyInvitation.findFirst.mock.calls).toHaveLength(lookups);

      db.surveyInvitation.findFirst.mockResolvedValueOnce({
        usedAt: null,
        tokenCipher: encryptSurveyValue(token),
      });
      await expect(
        service.accessByCode('grupo', { code: 'K7M4PQ2X' }, 'ip-otra'),
      ).resolves.toEqual({ invitation: token });
    });

    it('no aplica a encuestas públicas, borradores ni encuestas terminadas', async () => {
      const { db, service } = build();
      db.survey.findUnique.mockResolvedValueOnce({ ...open, accessMode: 'public' });
      await expect(
        service.accessByCode('x', { code: 'K7M4PQ2X' }, 'ip-1'),
      ).rejects.toThrow('no existe o ya no acepta');
      db.survey.findUnique.mockResolvedValueOnce({ ...open, status: 'draft' });
      await expect(
        service.accessByCode('x', { code: 'K7M4PQ2X' }, 'ip-1'),
      ).rejects.toThrow('no existe o ya no acepta');
      db.survey.findUnique.mockResolvedValueOnce({
        ...open,
        closesAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.accessByCode('x', { code: 'K7M4PQ2X' }, 'ip-1'),
      ).rejects.toThrow('ya terminó');
    });
  });
});

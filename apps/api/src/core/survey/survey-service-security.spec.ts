import { BadRequestException } from '@nestjs/common';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { SurveyService } from './survey.service';

describe('SurveyService security boundaries', () => {
  const previousPrivacyKey = process.env.SURVEY_PII_KEY;

  beforeAll(() => {
    process.env.SURVEY_PII_KEY = Buffer.alloc(32, 9).toString('base64');
  });

  afterAll(() => {
    if (previousPrivacyKey === undefined) {
      delete process.env.SURVEY_PII_KEY;
    } else {
      process.env.SURVEY_PII_KEY = previousPrivacyKey;
    }
  });
  it('lists only surveys created by the authenticated user', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new SurveyService(
      { survey: { findMany } } as never,
      {} as never,
      {} as never,
    );

    await service.findAll('company-1', 'user-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-1', createdById: 'user-1' },
      }),
    );
  });

  it('filters direct survey access by creator as well as company', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new SurveyService(
      { survey: { findFirst } } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.findOne('survey-1', 'company-1', 'user-other'),
    ).rejects.toThrow('La encuesta no existe');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'survey-1',
          companyId: 'company-1',
          createdById: 'user-other',
        },
      }),
    );
  });

  it('validates required answers before storing INE photographs', async () => {
    const prepareImage = jest.fn();
    const storePair = jest.fn();
    const prisma = {
      survey: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'survey-1',
          companyId: 'company-1',
          status: 'active',
          identityMode: 'anonymous',
          collectMunicipality: false,
          collectLocality: false,
          collectIne: true,
          ineCaptureMode: 'front_back',
          ineRequired: true,
          privacyNotice: 'Aviso',
          showPublicResults: false,
          thankYouMessage: 'Gracias',
          questions: [
            {
              id: 'q1',
              prompt: 'Respuesta obligatoria',
              type: 'text',
              options: [],
              required: true,
              publicAggregate: false,
            },
          ],
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new SurveyService(
      prisma as never,
      { prepareImage, storePair } as never,
      {} as never,
    );

    await expect(
      service.submit('encuesta', {
        acceptPrivacy: true,
        ine: { frontImage: 'front', backImage: 'back' },
        answers: {},
      }),
    ).rejects.toThrow('Falta responder');

    expect(prepareImage).not.toHaveBeenCalled();
    expect(storePair).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before closing an active survey', async () => {
    const update = jest.fn();
    const findFirst = jest.fn().mockResolvedValue({
      id: 'survey-1',
      status: 'active',
      questions: [],
      _count: { responses: 0, ineSubmissions: 0 },
    });
    const service = new SurveyService(
      { survey: { findFirst, update } } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateStatus('survey-1', 'closed', 'company-1', 'user-1', false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('deletes stored INE files when saving the response fails', async () => {
    const stored = {
      id: 'ine-1',
      frontObjectKey: 'front',
      frontMimeType: 'image/jpeg',
      frontBytes: 12_000,
      backObjectKey: 'back',
      backMimeType: 'image/jpeg',
      backBytes: 12_000,
    };
    const deletePair = jest.fn().mockResolvedValue(undefined);
    const ineStorage = {
      prepareImage: jest.fn().mockReturnValue({
        bytes: Buffer.alloc(12_000),
        mimeType: 'image/jpeg',
      }),
      storePair: jest.fn().mockResolvedValue(stored),
      deletePair,
    };
    const prisma = {
      survey: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'survey-1',
          companyId: 'company-1',
          status: 'active',
          identityMode: 'anonymous',
          collectMunicipality: false,
          collectLocality: false,
          collectIne: true,
          ineCaptureMode: 'front_back',
          ineRequired: true,
          ineRetentionDays: 30,
          privacyNotice: 'Aviso',
          showPublicResults: false,
          thankYouMessage: 'Gracias',
          questions: [
            {
              id: 'q1',
              prompt: 'Comentario',
              type: 'text',
              options: [],
              required: true,
              publicAggregate: false,
            },
          ],
        }),
      },
      $transaction: jest.fn().mockRejectedValue(new Error('database failed')),
    };
    const service = new SurveyService(
      prisma as never,
      ineStorage as never,
      {} as never,
    );

    await expect(
      service.submit('encuesta', {
        acceptPrivacy: true,
        ine: { frontImage: 'front', backImage: 'back' },
        answers: { q1: 'Respuesta' },
      }),
    ).rejects.toThrow('database failed');

    expect(deletePair).toHaveBeenCalledWith(stored);
  });

  it('supports a required front-only INE without asking for the back', async () => {
    const stored = {
      id: 'ine-front',
      frontObjectKey: 'front',
      frontMimeType: 'image/jpeg',
      frontBytes: 12_000,
      backObjectKey: null,
      backMimeType: null,
      backBytes: 0,
    };
    const ineStorage = {
      prepareImage: jest.fn().mockReturnValue({
        bytes: Buffer.alloc(12_000),
        mimeType: 'image/jpeg',
      }),
      storePair: jest.fn().mockResolvedValue(stored),
      deletePair: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      survey: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'survey-front',
          companyId: 'company-1',
          status: 'active',
          identityMode: 'anonymous',
          collectMunicipality: false,
          collectLocality: false,
          collectPostalCode: false,
          collectAddress: false,
          collectCurp: false,
          collectVoterKey: false,
          collectIne: true,
          ineCaptureMode: 'front',
          ineRequired: true,
          ineRetentionDays: 30,
          privacyNotice: 'Aviso',
          showPublicResults: false,
          thankYouMessage: 'Gracias',
          questions: [
            {
              id: 'q1',
              prompt: '¿Todo bien?',
              type: 'yesno',
              options: ['Sí', 'No'],
              required: true,
              publicAggregate: true,
            },
          ],
        }),
      },
      $transaction: jest
        .fn()
        .mockRejectedValue(new Error('stop-after-storage')),
    };
    const service = new SurveyService(
      prisma as never,
      ineStorage as never,
      {} as never,
    );

    await expect(
      service.submit('frente', {
        acceptPrivacy: true,
        ine: { frontImage: 'front' },
        answers: { q1: 'Sí' },
      }),
    ).rejects.toThrow('stop-after-storage');

    expect(ineStorage.prepareImage).toHaveBeenCalledTimes(1);
    expect(ineStorage.storePair).toHaveBeenCalledWith(
      'company-1',
      'survey-front',
      expect.anything(),
      undefined,
    );
  });

  it('requires the back only when the survey explicitly asks for front and back', async () => {
    const prepareImage = jest.fn();
    const prisma = {
      survey: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'survey-both',
          companyId: 'company-1',
          status: 'active',
          identityMode: 'anonymous',
          collectMunicipality: false,
          collectLocality: false,
          collectPostalCode: false,
          collectAddress: false,
          collectCurp: false,
          collectVoterKey: false,
          collectIne: true,
          ineCaptureMode: 'front_back',
          ineRequired: true,
          privacyNotice: 'Aviso',
          questions: [],
        }),
      },
    };
    const service = new SurveyService(
      prisma as never,
      { prepareImage } as never,
      {} as never,
    );

    await expect(
      service.submit('ambas', {
        acceptPrivacy: true,
        ine: { frontImage: 'front' },
        answers: {},
      }),
    ).rejects.toThrow('reverso');
    expect(prepareImage).not.toHaveBeenCalled();
  });

  it('stores configured CP, address, CURP and voter key without requiring phone or email', async () => {
    const createRespondent = jest
      .fn()
      .mockResolvedValue({ id: 'respondent-1' });
    const createResponse = jest
      .fn()
      .mockResolvedValue({ id: 'response-1', folio: 1 });
    const createEvent = jest.fn().mockResolvedValue({
      id: 'survey.response.completed:response-1',
    });
    const transaction = jest.fn().mockImplementation(async (callback) =>
      callback({
        surveyRespondent: {
          findFirst: jest.fn(),
          create: createRespondent,
          update: jest.fn(),
        },
        surveyResponse: {
          findFirst: jest.fn(),
          create: createResponse,
        },
        surveyAnswerAggregate: { upsert: jest.fn() },
        event: { create: createEvent },
        survey: {
          findUnique: jest.fn(),
          update: jest.fn().mockResolvedValue({ nextFolio: 1 }),
        },
      }),
    );
    const prisma = {
      survey: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'survey-data',
          companyId: 'company-1',
          status: 'active',
          identityMode: 'anonymous',
          collectMunicipality: false,
          collectLocality: false,
          collectPostalCode: true,
          collectAddress: true,
          collectCurp: true,
          collectVoterKey: true,
          collectElectoralSection: true,
          collectIne: false,
          ineCaptureMode: 'front',
          ineRequired: false,
          privacyNotice: 'Aviso',
          showPublicResults: false,
          thankYouMessage: 'Gracias',
          questions: [],
        }),
      },
      $transaction: transaction,
    };
    const service = new SurveyService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.submit('datos', {
        acceptPrivacy: true,
        person: {
          postalCode: '58000',
          address: 'Calle Demo 123 Centro',
          curp: 'PELA900101MMNXXX01',
          voterKey: 'PRLPAN90010116M100',
          electoralSection: '1048',
        },
        answers: {},
      }),
    ).resolves.toEqual({
      id: 'response-1',
      folio: '000001',
      thankYouMessage: 'Gracias',
      results: null,
    });

    expect(createEvent).toHaveBeenCalledWith({
      data: {
        id: 'survey.response.completed:response-1',
        type: 'survey.response.completed.v1',
        source: 'survey',
        entityType: 'survey',
        entityId: 'survey-data',
        companyId: 'company-1',
        data: { responseId: 'response-1' },
      },
    });

    expect(createRespondent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailHash: null,
          phoneHash: null,
          postalCodeCipher: expect.any(String),
          addressCipher: expect.any(String),
          curpCipher: expect.any(String),
          voterKeyCipher: expect.any(String),
          electoralSectionCipher: expect.any(String),
        }),
      }),
    );
  });
});

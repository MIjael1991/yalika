import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  proofreadSurveyDraft,
  validateProofreadResult,
} from './survey-proofread';

const source = {
  title: 'Bebidas en fiestas',
  description: 'Preguntas para saber lo que toman.',
  questions: [
    {
      prompt: '¿Que tomas en una fiesta?',
      type: 'choice' as const,
      options: ['Agua', 'Refresco', 'Otra'],
    },
  ],
};

describe('Yalika survey spelling proofreader', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.SURVEY_AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'fake-test-key';
    delete process.env.GEMINI_SURVEY_MODEL;
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('requests Gemini with no strict response schema and does not write data', async () => {
    const fixed = {
      ...source,
      questions: [
        { ...source.questions[0], prompt: '¿Qué tomas en una fiesta?' },
      ],
    };
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(fixed) } }],
        }),
      ),
    );
    const result = await proofreadSurveyDraft(source);
    expect(result).toMatchObject({ mode: 'ai', title: source.title });
    expect(result.questions[0].prompt).toBe('¿Qué tomas en una fiesta?');
    expect(mock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(request.model).toBe('gemini-3.1-flash-lite');
    expect(request.response_format).toBeUndefined();
    expect(request.messages[1].content).not.toContain('fake-test-key');
  });

  it('rejects changes to the number and type of questions', () => {
    expect(() =>
      validateProofreadResult(source, { ...source, questions: [] }),
    ).toThrow();
    expect(() =>
      validateProofreadResult(source, {
        ...source,
        questions: [{ ...source.questions[0], type: 'text' }],
      }),
    ).toThrow();
    expect(() =>
      validateProofreadResult(source, {
        ...source,
        questions: [{ ...source.questions[0], options: ['Agua'] }],
      }),
    ).toThrow();
  });

  it('rejects obvious personal information before contacting Gemini', async () => {
    const mock = jest.spyOn(global, 'fetch');
    await expect(
      proofreadSurveyDraft({ ...source, title: 'juan@example.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock).not.toHaveBeenCalled();
  });

  it('fails closed if Gemini is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const mock = jest.spyOn(global, 'fetch');
    await expect(proofreadSurveyDraft(source)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('does not expose the provider response to the user', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('secret', { status: 400 }));
    await expect(proofreadSurveyDraft(source)).rejects.toThrow(
      'No pudimos corregir',
    );
  });
});

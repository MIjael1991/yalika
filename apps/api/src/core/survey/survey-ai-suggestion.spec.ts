import {
  buildAiSurveySuggestion,
  normalizeAiSuggestion,
} from './survey-ai-suggestion';

describe('survey AI suggestion', () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_SURVEY_MODEL;

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    process.env.OPENAI_SURVEY_MODEL = originalModel;
    jest.restoreAllMocks();
  });

  it('does not call an external service when no key is configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      buildAiSurveySuggestion('Encuesta de mascotas'),
    ).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('normalizes unsafe or incomplete option types', () => {
    const result = normalizeAiSuggestion({
      title: 'Prueba general',
      description: 'Una prueba completa',
      identityMode: 'anonymous',
      questions: [
        {
          prompt: '¿Primera pregunta?',
          type: 'yesno',
          options: ['Claro', 'Nunca'],
          required: true,
          publicAggregate: true,
        },
        {
          prompt: '¿Segunda pregunta?',
          type: 'choice',
          options: ['Única'],
          required: true,
          publicAggregate: true,
        },
        {
          prompt: '¿Tercera pregunta?',
          type: 'rating',
          options: [],
          required: false,
          publicAggregate: true,
        },
      ],
    });

    expect(result.questions[0].options).toEqual(['Sí', 'No']);
    expect(result.questions[1].type).toBe('text');
    expect(result.questions[1].publicAggregate).toBe(false);
    expect(result.questions[2].options[0]).toContain('Muy malo');
    expect(result.questions.every((question) => question.required)).toBe(true);
    expect(result.mode).toBe('ai');
  });

  it('sends the current draft so natural-language edits keep prior work', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_SURVEY_MODEL = 'test-model';
    const output = {
      title: 'Mascotas',
      description: 'Encuesta para familias',
      identityMode: 'anonymous',
      questions: [
        {
          prompt: '¿Tienes mascota?',
          type: 'yesno',
          options: ['Sí', 'No'],
          required: true,
          publicAggregate: true,
        },
        {
          prompt: '¿Cuál prefieres?',
          type: 'choice',
          options: ['Perro', 'Gato', 'Otra'],
          required: true,
          publicAggregate: true,
        },
        {
          prompt: '¿Qué mejorarías?',
          type: 'text',
          options: [],
          required: false,
          publicAggregate: false,
        },
      ],
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: JSON.stringify(output) }),
    } as Response);

    const result = await buildAiSurveySuggestion('Cambia la pregunta 2', {
      title: 'Borrador',
      questions: [{ prompt: 'Pregunta anterior' }],
    });

    expect(result?.title).toBe('Mascotas');
    const request = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(request.model).toBe('test-model');
    expect(request.store).toBe(false);
    expect(request.input[1].content).toContain('Pregunta anterior');
  });
});

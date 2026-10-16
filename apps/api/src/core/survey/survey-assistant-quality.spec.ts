import { buildSurveySuggestion } from './survey-suggestion';
import {
  buildAiSurveySuggestion,
  surveySuggestionNeedsRevision,
  SurveyAiError,
} from './survey-ai-suggestion';

const request = 'que es lo que toman cuan van de fiesta dame 5 preguntas';
const good = () => buildSurveySuggestion(request);
describe('friendly survey assistant', () => {
  const originalKey = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    jest.restoreAllMocks();
  });
  it('turns the reported typo-filled request into five natural, relevant questions', () => {
    const result = good();
    expect(result.questions).toHaveLength(5);
    expect(result.questions[0].prompt).toBe(
      'Cuando vas a una fiesta, ¿qué prefieres tomar?',
    );
    expect(result.questions.map((q) => q.prompt).join(' ')).not.toMatch(
      /cuan\b|dame|relación tienes/,
    );
    expect(result.questions[0].options).toContain('Agua natural o mineral');
    expect(result.questions[4].type).toBe('text');
  });
  it('keeps a topic after a leading generation command', () => {
    expect(
      buildSurveySuggestion(
        'Crea 7 preguntas sobre adopción responsable de mascotas',
      ).title,
    ).toContain('mascotas');
  });
  it('removes trailing generation instructions from unknown topic', () => {
    const result = buildSurveySuggestion(
      'Encuesta sobre ciclismo urbano dame 5 preguntas',
    );
    expect(result.questions).toHaveLength(5);
    expect(JSON.stringify(result)).not.toContain('dame 5 preguntas');
  });
  it('rejects duplicated questions and leaked author instructions', () => {
    const duplicate = good();
    duplicate.questions[1] = duplicate.questions[0];
    expect(surveySuggestionNeedsRevision(duplicate, request)).toBe(true);
    const leak = good();
    leak.questions[0].prompt =
      '¿Qué relación tienes con que toman dame 5 preguntas?';
    expect(surveySuggestionNeedsRevision(leak, request)).toBe(true);
    expect(surveySuggestionNeedsRevision(good(), request)).toBe(false);
  });
  it('retries poor generated content once and accepts the corrected result', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    const bad = good();
    bad.questions[0].prompt =
      '¿Qué relación tienes con que toman dame 5 preguntas?';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ output_text: JSON.stringify(bad) })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ output_text: JSON.stringify(good()) })),
      );
    await expect(buildAiSurveySuggestion(request)).resolves.toMatchObject({
      mode: 'ai',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('stops after two invalid outputs', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    const bad = good();
    bad.questions[1] = bad.questions[0];
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ output_text: JSON.stringify(bad) })),
        ),
      );
    await expect(buildAiSurveySuggestion(request)).rejects.toMatchObject({
      code: 'quality',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('classifies provider access errors without leaking response details', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('private provider detail', { status: 401 }),
      );
    await expect(buildAiSurveySuggestion(request)).rejects.toEqual(
      new SurveyAiError('access'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

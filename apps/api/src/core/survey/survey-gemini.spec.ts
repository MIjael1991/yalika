import { buildAiSurveySuggestion } from './survey-ai-suggestion';
import { buildSurveySuggestion } from './survey-suggestion';
const request = 'quiero 5 preguntas sobre bebidas en fiestas';
const good = () => buildSurveySuggestion(request);
const reply = (value: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
  );
describe('Gemini survey provider', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.SURVEY_AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.OPENAI_API_KEY = 'openai-test';
    delete process.env.GEMINI_SURVEY_MODEL;
  });
  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });
  it('uses Gemini only and strips non-survey records from the draft', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue(reply(good()));
    const draft = {
      ...good(),
      invitations: ['private'],
      images: ['private'],
      responses: ['private'],
    };
    await expect(
      buildAiSurveySuggestion(request, draft),
    ).resolves.toMatchObject({ mode: 'ai' });
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer gemini-test',
    });
    expect(typeof init?.body === 'string' ? init.body : '').toContain(
      'gemini-3.1-flash-lite',
    );
    expect(JSON.parse(String(init?.body)).response_format).toBeUndefined();
    expect(typeof init?.body === 'string' ? init.body : '').not.toContain(
      'private',
    );
    expect(typeof init?.body === 'string' ? init.body : '').not.toContain(
      'openai-test',
    );
  });
  it('does not use OpenAI when the Gemini key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const mock = jest.spyOn(global, 'fetch');
    await expect(buildAiSurveySuggestion(request)).resolves.toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });
  it('does not fall through to OpenAI after quota exhaustion', async () => {
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('secret', { status: 429 }));
    await expect(buildAiSurveySuggestion(request)).rejects.toMatchObject({
      code: 'limit',
      message: 'limit',
    });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('retries a malformed response once', async () => {
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply('invalid'))
      .mockResolvedValueOnce(reply(good()));
    await expect(buildAiSurveySuggestion(request)).resolves.toMatchObject({
      mode: 'ai',
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it('rejects repeated malformed responses', async () => {
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(reply('invalid'));
    await expect(buildAiSurveySuggestion(request)).rejects.toMatchObject({
      code: 'quality',
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it('fails closed on a misspelled provider', async () => {
    process.env.SURVEY_AI_PROVIDER = 'gemni';
    const mock = jest.spyOn(global, 'fetch');
    await expect(buildAiSurveySuggestion(request)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(mock).not.toHaveBeenCalled();
  });
});

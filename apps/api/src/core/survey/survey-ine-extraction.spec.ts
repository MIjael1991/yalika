import { SurveyIneExtractionService } from './survey-ine-extraction';

describe('SurveyIneExtractionService', () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.OPENAI_API_KEY = previousKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('falls back safely when automatic reading is not configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new SurveyIneExtractionService();
    const result = await service.extract('data:image/jpeg;base64,AA==');
    expect(result.available).toBe(false);
    expect(result.curp).toBe('');
  });

  it('normalizes visible INE fields without inventing phone or email fields', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          name: 'ANA PEREZ LOPEZ',
          address: 'CALLE 1 NUM 2 CENTRO',
          postalCode: '58000',
          curp: 'PELA900101MMNXXX01',
          voterKey: 'PRLPAN90010116M100',
          electoralSection: '1048',
          municipality: 'MORELIA',
          locality: 'CENTRO',
          confidence: 91,
        }),
      }),
    }) as never;

    const service = new SurveyIneExtractionService();
    const result = await service.extract('data:image/jpeg;base64,AA==');
    expect(result.available).toBe(true);
    expect(result.postalCode).toBe('58000');
    expect(result.curp).toBe('PELA900101MMNXXX01');
    expect(result.voterKey).toBe('PRLPAN90010116M100');
    expect(result.electoralSection).toBe('1048');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('email');

    const fetchMock = global.fetch as jest.Mock;
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.store).toBe(false);
    expect(requestBody.input[0].content[1]).toEqual(
      expect.objectContaining({
        type: 'input_image',
        image_url: 'data:image/jpeg;base64,AA==',
      }),
    );
  });
  it('falls back to manual entry when the vision request fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as never;

    const service = new SurveyIneExtractionService();
    const result = await service.extract('data:image/jpeg;base64,AA==');

    expect(result.available).toBe(false);
    expect(result.message).toContain('manualmente');
  });
});

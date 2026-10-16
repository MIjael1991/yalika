import { Injectable } from '@nestjs/common';

export type SurveyIneExtractedData = {
  available: boolean;
  name: string;
  address: string;
  postalCode: string;
  curp: string;
  voterKey: string;
  electoralSection: string;
  municipality: string;
  locality: string;
  confidence: number;
  message: string;
};

const extractionSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 180 },
    address: { type: 'string', maxLength: 320 },
    postalCode: { type: 'string', maxLength: 10 },
    curp: { type: 'string', maxLength: 24 },
    voterKey: { type: 'string', maxLength: 24 },
    electoralSection: { type: 'string', maxLength: 8 },
    municipality: { type: 'string', maxLength: 180 },
    locality: { type: 'string', maxLength: 180 },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
  },
  required: [
    'name',
    'address',
    'postalCode',
    'curp',
    'voterKey',
    'electoralSection',
    'municipality',
    'locality',
    'confidence',
  ],
  additionalProperties: false,
} as const;

function outputText(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const response = value as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
  };
  if (typeof response.output_text === 'string') return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        return content.text;
      }
    }
  }
  return '';
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeCurp(value: unknown) {
  const normalized = clean(value, 24).toUpperCase().replace(/\s/g, '');
  return /^[A-Z0-9]{18}$/.test(normalized) ? normalized : '';
}

function normalizeVoterKey(value: unknown) {
  const normalized = clean(value, 24)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return normalized.length >= 16 && normalized.length <= 20 ? normalized : '';
}

function normalizeElectoralSection(value: unknown) {
  const digits = clean(value, 8).replace(/\D/g, '');
  return /^\d{1,4}$/.test(digits) ? digits : '';
}

function normalizePostalCode(value: unknown) {
  const digits = clean(value, 10).replace(/\D/g, '');
  return /^\d{5}$/.test(digits) ? digits : '';
}

function unavailable(message: string): SurveyIneExtractedData {
  return {
    available: false,
    name: '',
    address: '',
    postalCode: '',
    curp: '',
    voterKey: '',
    electoralSection: '',
    municipality: '',
    locality: '',
    confidence: 0,
    message,
  };
}

@Injectable()
export class SurveyIneExtractionService {
  async extract(frontImage: string): Promise<SurveyIneExtractedData> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return unavailable(
        'La lectura automática de INE no está configurada. Puedes llenar los datos manualmente.',
      );
    }

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model:
            process.env.OPENAI_SURVEY_VISION_MODEL?.trim() ||
            process.env.OPENAI_SURVEY_MODEL?.trim() ||
            'gpt-5-mini',
          store: false,
          max_output_tokens: 900,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'Lee únicamente datos claramente visibles en el frente de esta Credencial para Votar de México (INE). No inventes, completes ni deduzcas datos. Extrae nombre, domicilio visible, código postal si aparece, CURP, clave de elector, sección electoral, municipio y colonia/localidad sólo si son legibles. Si el domicilio está oculto o un campo no aparece, devuelve cadena vacía. No busques teléfono ni correo porque no deben inferirse desde la credencial.',
                },
                {
                  type: 'input_image',
                  image_url: frontImage,
                  detail: 'high',
                },
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'ine_visible_fields',
              strict: true,
              schema: extractionSchema,
            },
          },
        }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      return unavailable(
        'No pudimos conectar con la lectura automática. Puedes continuar y llenar los datos manualmente.',
      );
    }

    if (!response.ok) {
      return unavailable(
        'No pudimos leer la INE automáticamente. Puedes continuar y llenar los datos manualmente.',
      );
    }

    const payload: unknown = await response.json();
    const text = outputText(payload);
    if (!text) {
      return unavailable(
        'No encontramos datos legibles automáticamente. Revísalos y escríbelos manualmente.',
      );
    }

    try {
      const raw = JSON.parse(text) as Record<string, unknown>;
      const confidence = Math.max(
        0,
        Math.min(100, Number(raw.confidence) || 0),
      );
      return {
        available: true,
        name: clean(raw.name, 180),
        address: clean(raw.address, 320),
        postalCode: normalizePostalCode(raw.postalCode),
        curp: normalizeCurp(raw.curp),
        voterKey: normalizeVoterKey(raw.voterKey),
        electoralSection: normalizeElectoralSection(raw.electoralSection),
        municipality: clean(raw.municipality, 180),
        locality: clean(raw.locality, 180),
        confidence,
        message:
          'Revisamos el frente de la INE. Confirma los datos antes de enviar; la lectura automática puede equivocarse.',
      };
    } catch {
      return unavailable(
        'No pudimos interpretar la lectura automática. Llena los datos manualmente.',
      );
    }
  }
}

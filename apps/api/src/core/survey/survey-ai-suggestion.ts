import {
  type SurveySuggestion,
  type SurveySuggestionDraft,
  type SurveySuggestionQuestion,
  parseSurveyRequestRequirements,
  suggestionMatchesRequest,
} from './survey-suggestion';

const allowedTypes = new Set<SurveySuggestionQuestion['type']>([
  'choice',
  'multi',
  'yesno',
  'rating',
  'text',
]);

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 3, maxLength: 180 },
    description: { type: 'string', minLength: 3, maxLength: 1000 },
    identityMode: {
      type: 'string',
      enum: ['anonymous', 'phone', 'email_or_phone'],
    },
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string', minLength: 3, maxLength: 500 },
          type: {
            type: 'string',
            enum: ['choice', 'multi', 'yesno', 'rating', 'text'],
          },
          options: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', minLength: 1, maxLength: 180 },
          },
          required: { type: 'boolean' },
          publicAggregate: { type: 'boolean' },
        },
        required: ['prompt', 'type', 'options', 'required', 'publicAggregate'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'description', 'identityMode', 'questions'],
  additionalProperties: false,
} as const;

const instructions = `Eres el creador profesional de encuestas de una plataforma mexicana extremadamente fácil de usar.
Convierte cualquier petición del usuario, sobre cualquier tema lícito, en una encuesta completa, clara, neutral y lista para editar.

Reglas:
- Interpreta la intención, no copies la instrucción literalmente. Corrige en silencio ortografía, acentos y palabras incompletas del creador. Nunca incluyas órdenes como "dame 5 preguntas" dentro del título, preguntas u opciones.
- Redacta como una persona amable que conversa: preguntas breves, concretas y fáciles de responder. Evita plantillas abstractas como "¿Qué relación tienes con...?" cuando el objetivo es conocer hábitos o preferencias.
- Cada pregunta debe aportar información distinta; no repitas la misma idea con sinónimos. Usa opciones coherentes con la pregunta, sin solapamientos evidentes y sin asumir que todos consumen alcohol o usan un servicio.
- Antes de entregar, revisa concordancia, ortografía, claridad, cantidad pedida y relación con el objetivo. Si dice "que toman cuan van de fiesta dame 5 preguntas", entiende una encuesta de cinco preguntas sobre bebidas en fiestas, incluyendo opciones sin alcohol.
- Responde en el idioma del usuario; usa español de México cuando no sea claro.
- Respeta exactamente el número de preguntas solicitado. Si no indica cantidad, crea entre 6 y 8.
- Respeta exactamente la cantidad de cada tipo cuando el usuario la indique (por ejemplo: 2 de sí/no, 3 de opción múltiple y 1 abierta). No cambies esos tipos por otros.
- Entiende el propósito, público y contexto sin obligar al usuario a configurar cada campo.
- Si recibes un borrador y el usuario pide cambiar, eliminar, agregar, acortar, reordenar o mejorar algo, devuelve el borrador completo ya modificado.
- Elige el mejor tipo por pregunta: choice para una respuesta, multi para varias, yesno, rating o text.
- choice y multi deben incluir opciones completas y específicas, normalmente incluyendo "Otra". text no lleva opciones. yesno lleva Sí y No.
- Las escalas deben explicar sus extremos, por ejemplo "1 · Muy malo" y "5 · Excelente"; no dejes números ambiguos.
- Todas las preguntas deben ser obligatorias para impedir envíos incompletos.
- Evita preguntas repetidas, sesgadas, confusas o dobles. Usa lenguaje sencillo para personas sin experiencia técnica.
- Recomienda anonymous si no solicita datos personales. Respeta los datos que el creador pide explícitamente; no le pidas justificar teléfono, domicilio o INE. El aviso de privacidad y consentimiento se gestionan en el formulario. Genera directamente una propuesta útil.
- Los textos abiertos no deben mostrarse en resultados públicos. Marca publicAggregate=true solamente en respuestas agrupables.
- En salud o psicología no diagnostiques, no etiquetes a una persona y no indiques medicamentos. Formula instrumentos de orientación que requieran revisión profesional.
- En política conserva neutralidad y no redactes propaganda ni preguntas que empujen una respuesta.
- Devuelve exclusivamente el objeto solicitado por el esquema.`;

function textValue(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function uniqueOptions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(value.map((option) => textValue(option, 180)).filter(Boolean)),
  ).slice(0, 20);
}

export function normalizeAiSuggestion(value: unknown): SurveySuggestion {
  if (!value || typeof value !== 'object') {
    throw new Error('La IA no devolvió una encuesta válida');
  }

  const raw = value as Record<string, unknown>;
  const title = textValue(raw.title, 180);
  const description = textValue(raw.description, 1000);
  const identityMode = ['anonymous', 'phone', 'email_or_phone'].includes(
    String(raw.identityMode),
  )
    ? (raw.identityMode as SurveySuggestion['identityMode'])
    : 'anonymous';
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = rawQuestions.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];

    const question = entry as Record<string, unknown>;
    const prompt = textValue(question.prompt, 500);
    const requestedType = String(
      question.type,
    ) as SurveySuggestionQuestion['type'];
    const type = allowedTypes.has(requestedType) ? requestedType : 'text';
    let options = uniqueOptions(question.options);

    if (!prompt) return [];
    if (type === 'text') options = [];
    if (type === 'yesno') options = ['Sí', 'No'];
    if (type === 'rating' && options.length < 2) {
      options = [
        '1 · Muy malo o muy poco',
        '2',
        '3',
        '4',
        '5 · Excelente o mucho',
      ];
    }

    const finalType =
      ['choice', 'multi'].includes(type) && options.length < 2 ? 'text' : type;

    return [
      {
        prompt,
        type: finalType,
        options: finalType === 'text' ? [] : options,
        required: true,
        publicAggregate:
          finalType === 'text'
            ? false
            : typeof question.publicAggregate === 'boolean'
              ? question.publicAggregate
              : true,
      },
    ];
  });

  if (!title || !description || questions.length < 1) {
    throw new Error('La IA no devolvió suficientes datos para la encuesta');
  }

  return {
    title,
    description,
    identityMode,
    questions,
    note: 'La IA preparó la encuesta completa. Puedes pedirle otro cambio o editar cualquier detalle antes de publicarla.',
    mode: 'ai',
  };
}

function responseText(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const response = value as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{ type?: string; text?: unknown }>;
    }>;
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

export class SurveyAiError extends Error {
  constructor(
    public readonly code: 'access' | 'limit' | 'unavailable' | 'quality',
  ) {
    super(code);
  }
}

export function surveySuggestionNeedsRevision(
  suggestion: SurveySuggestion,
  request: string,
) {
  if (!suggestionMatchesRequest(suggestion, request)) return true;
  const normalized = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
  const prompts = suggestion.questions.map((question) =>
    normalized(question.prompt),
  );
  if (new Set(prompts).size !== prompts.length) return true;
  return [
    suggestion.title,
    ...suggestion.questions.flatMap((question) => [
      question.prompt,
      ...question.options,
    ]),
  ].some(
    (value) =>
      /\b(?:dame|hazme|genera|crea)\s+(?:\d+|cinco|seis|siete|ocho)?\s*preguntas?\b/i.test(
        value,
      ) ||
      /que relacion tienes con (?:que |quiero |dame )/.test(normalized(value)),
  );
}

async function buildOpenAiSurveySuggestion(
  request: string,
  draft?: SurveySuggestionDraft,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_SURVEY_MODEL?.trim() || 'gpt-5-mini',
        store: false,
        max_output_tokens: 5000,
        input: [
          {
            role: 'system',
            content:
              instructions +
              (attempt
                ? '\nLa propuesta anterior no cumplió la revisión automática. Genera de nuevo, sin copiar instrucciones ni repetir preguntas, respetando la cantidad y los tipos solicitados.'
                : ''),
          },
          {
            role: 'user',
            content: JSON.stringify({
              instruction: request,
              requirements: parseSurveyRequestRequirements(request),
              currentDraft: draft ?? null,
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'survey_suggestion',
            strict: true,
            schema,
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new SurveyAiError(
        response.status === 401 || response.status === 403
          ? 'access'
          : response.status === 429
            ? 'limit'
            : 'unavailable',
      );
    try {
      const payload: unknown = await response.json();
      const output = responseText(payload);
      const suggestion = normalizeAiSuggestion(JSON.parse(output) as unknown);
      if (!surveySuggestionNeedsRevision(suggestion, request))
        return suggestion;
    } catch {
      // Retry malformed output once, without returning provider internals or secrets.
    }
  }
  throw new SurveyAiError('quality');
}

/** One configured provider per request. Never fall through to a paid provider. */
export async function buildAiSurveySuggestion(
  request: string,
  draft?: SurveySuggestionDraft,
) {
  const provider =
    process.env.SURVEY_AI_PROVIDER?.trim().toLowerCase() || 'openai';
  if (provider === 'openai') return buildOpenAiSurveySuggestion(request, draft);
  if (provider !== 'gemini') throw new SurveyAiError('unavailable');
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  // Only the survey definition is sent. No database records, images or invitations.
  const currentDraft = draft
    ? {
        title: draft.title,
        description: draft.description,
        identityMode: draft.identityMode,
        questions: draft.questions?.map((q) => ({
          prompt: q.prompt,
          type: q.type,
          options: q.options,
          required: q.required,
          publicAggregate: q.publicAggregate,
        })),
      }
    : null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model:
            process.env.GEMINI_SURVEY_MODEL?.trim() || 'gemini-3.1-flash-lite',
          max_tokens: 5000,
          messages: [
            {
              role: 'system',
              content:
                instructions +
                '\nDevuelve únicamente JSON válido, sin explicaciones ni bloques Markdown. El objeto debe contener title, description, identityMode y questions. Cada pregunta debe tener prompt, type, options, required y publicAggregate. Conserva exactamente la cantidad y tipos solicitados. Corrige ortografía y puntuación. No inventes datos personales.' +
                (attempt
                  ? '\nCorrige la propuesta: respeta cantidad y tipos, no repitas preguntas ni copies instrucciones.'
                  : ''),
            },
            {
              role: 'user',
              content: JSON.stringify({
                instruction: request,
                requirements: parseSurveyRequestRequirements(request),
                currentDraft,
              }),
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new SurveyAiError(
        response.status === 401 || response.status === 403
          ? 'access'
          : response.status === 429
            ? 'limit'
            : 'unavailable',
      );
    try {
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const output = payload.choices?.[0]?.message?.content;
      if (typeof output !== 'string') continue;
      const suggestion = normalizeAiSuggestion(
        JSON.parse(
          output
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, ''),
        ) as unknown,
      );
      if (!surveySuggestionNeedsRevision(suggestion, request))
        return suggestion;
    } catch {
      // Retry invalid JSON once without exposing provider internals or secrets.
    }
  }
  throw new SurveyAiError('quality');
}

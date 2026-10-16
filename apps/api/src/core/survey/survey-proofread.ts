import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

type QuestionType = 'choice' | 'multi' | 'yesno' | 'rating' | 'text';
type TextQuestion = { prompt: string; type: QuestionType; options: string[] };
type TextDraft = {
  title: string;
  description: string;
  questions: TextQuestion[];
};

const types = new Set<QuestionType>([
  'choice',
  'multi',
  'yesno',
  'rating',
  'text',
]);
const url =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/** No DB access. Only explicit editable survey text is transmitted. */
function validateDraft(value: unknown): TextDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Envía el borrador de la encuesta.');
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.title !== 'string' ||
    typeof raw.description !== 'string' ||
    raw.title.length > 180 ||
    raw.description.length > 1000 ||
    !Array.isArray(raw.questions) ||
    raw.questions.length < 1 ||
    raw.questions.length > 20
  ) {
    throw new BadRequestException(
      'El título, descripción o número de preguntas no es válido.',
    );
  }
  const questions: TextQuestion[] = raw.questions.map(
    (entry: unknown, index: number) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new BadRequestException(`Revisa la pregunta ${index + 1}.`);
      }
      const q = entry as Record<string, unknown>;
      if (
        typeof q.prompt !== 'string' ||
        q.prompt.trim().length < 3 ||
        q.prompt.length > 500 ||
        !types.has(q.type as QuestionType) ||
        !Array.isArray(q.options) ||
        q.options.length > 20 ||
        !q.options.every(
          (o: unknown) =>
            typeof o === 'string' && o.length > 0 && o.length <= 180,
        )
      ) {
        throw new BadRequestException(
          `Revisa el texto y las opciones de la pregunta ${index + 1}.`,
        );
      }
      return {
        prompt: q.prompt,
        type: q.type as QuestionType,
        options: [...q.options] as string[],
      };
    },
  );
  const prepared: TextDraft = {
    title: raw.title,
    description: raw.description,
    questions,
  };
  const content = [
    prepared.title,
    prepared.description,
    ...prepared.questions.flatMap((q) => [q.prompt, ...q.options]),
  ].join(' ');
  if (content.length > 12000)
    throw new BadRequestException('El borrador es demasiado largo.');
  // A simple fail-closed guard for obvious identifiers, not a guarantee of anonymization.
  if (
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(content) ||
    /\b\d[\d ()-]{9,}\d\b/.test(content) ||
    /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]{2}\b/i.test(content)
  ) {
    throw new BadRequestException(
      'Elimina correos, teléfonos y datos de identificación antes de usar la IA.',
    );
  }
  return prepared;
}

function decodeOutput(value: string): unknown {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(cleaned) as unknown;
}

export function validateProofreadResult(
  original: TextDraft,
  candidate: unknown,
): TextDraft {
  const result = validateDraft(candidate);
  if (result.questions.length !== original.questions.length) {
    throw new Error('Gemini cambió el número de preguntas.');
  }
  result.questions.forEach((q, i) => {
    const previous = original.questions[i];
    if (
      q.type !== previous.type ||
      q.options.length !== previous.options.length
    ) {
      throw new Error('Gemini intentó cambiar tipos u opciones.');
    }
    if (
      q.type === 'yesno' &&
      JSON.stringify(q.options) !== JSON.stringify(previous.options)
    ) {
      throw new Error('Gemini intentó modificar una respuesta de Sí/No.');
    }
    if (
      q.type === 'rating' &&
      q.options.some(
        (option, n) =>
          option.match(/^\s*\d+/)?.[0]?.trim() !==
          previous.options[n].match(/^\s*\d+/)?.[0]?.trim(),
      )
    ) {
      throw new Error('Gemini cambió la escala de valoración.');
    }
  });
  return result;
}

/** Proposal only: never saves, changes a published survey, or touches responses. */
export async function proofreadSurveyDraft(
  value: unknown,
): Promise<TextDraft & { mode: 'ai'; note: string }> {
  const draft = validateDraft(value);
  if (
    (process.env.SURVEY_AI_PROVIDER || '').trim().toLowerCase() !== 'gemini' ||
    !process.env.GEMINI_API_KEY?.trim()
  ) {
    throw new ServiceUnavailableException(
      'Gemini no está configurado; conserva tus textos originales.',
    );
  }
  const model =
    process.env.GEMINI_SURVEY_MODEL?.trim() || 'gemini-3.1-flash-lite';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.GEMINI_API_KEY.trim()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 5000,
        messages: [
          {
            role: 'system',
            content:
              'Eres corrector ortográfico de español de México. Corrige acentos, ortografía, puntuación y gramática; mejora claridad solamente si no altera el significado. ' +
              'Conserva estrictamente cantidad y orden de preguntas, tipo, cantidad y sentido de las opciones, números, escalas y preguntas neutrales. ' +
              'No inventes preguntas, información, respuestas ni datos personales. Conserva tal cual los valores de type. ' +
              'Devuelve ÚNICAMENTE un JSON válido sin bloques Markdown, con exactamente estas claves: ' +
              '{"title":"...","description":"...","questions":[{"prompt":"...","type":"choice|multi|yesno|rating|text","options":["..."]}]}. ' +
              'No agregues otras propiedades.',
          },
          { role: 'user', content: JSON.stringify(draft) },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Gemini no pudo corregir el texto. Conserva el borrador original.',
      );
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('Respuesta incompleta');
    const corrected = validateProofreadResult(draft, decodeOutput(text));
    return {
      ...corrected,
      mode: 'ai',
      note: 'Revisa la propuesta y pulsa «Aplicar correcciones» solo si conserva lo que quieres preguntar.',
    };
  } catch {
    // Never leak provider errors or prompts to the client.
    throw new ServiceUnavailableException(
      'No pudimos corregir el texto. No se cambió nada; inténtalo más tarde.',
    );
  }
}

import { normalizeTaskTitle, taskTitleSimilarity } from '../task/task-similarity';

export type CaptureIntent = 'create' | 'cancel' | 'complete' | 'find';

export type CaptureActionScope =
  | 'today'
  | 'tomorrow'
  | 'today_and_tomorrow'
  | 'series'
  | 'unspecified';

export type CaptureActionCandidate = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  spaceId: string | null;
  space: {
    id: string;
    name: string;
    type: string;
  } | null;
  recurrenceId: string | null;
  recurrence?: {
    status: string;
    nextOccurrenceAt: Date;
    endsAt: Date | null;
  } | null;
};

const intentPatterns: Array<{
  intent: Exclude<CaptureIntent, 'create'>;
  pattern: RegExp;
}> = [
  {
    intent: 'cancel',
    pattern:
      /\b(?:cancela|cancelar|cancele|canceles|elimina|eliminar|elimine|elimines|borra|borrar|borre|borres|quita|quitar|quite|quites)\b|\bya\s+no\s+(?:quiero|necesito)\b/,
  },
  {
    intent: 'complete',
    pattern:
      /\b(?:termina|terminar|termine|completa|completar|complete|finaliza|finalizar|ya hice|ya termine|ya complete)\b/,
  },
  {
    intent: 'find',
    pattern:
      /\b(?:busca|buscar|encuentra|encontrar|muestra|mostrar|cual es|cuales son|que tareas?)\b/,
  },
];

export function inferCaptureIntent(message: string) {
  const normalized = normalizeTaskTitle(message);
  const intent =
    intentPatterns.find((candidate) => candidate.pattern.test(normalized))
      ?.intent ?? 'create';

  return {
    intent,
    scope: inferActionScope(normalized),
    query: intent === 'create' ? normalized : cleanActionQuery(normalized),
  };
}

export function rankCaptureActionCandidates(input: {
  query: string;
  candidates: CaptureActionCandidate[];
  requestedDate?: Date | null;
  timezone: string;
}) {
  if (!input.query) {
    return [];
  }

  return input.candidates
    .map((candidate) => {
      let score = taskTitleSimilarity(input.query, candidate.title);
      const normalizedTitle = normalizeTaskTitle(candidate.title);

      if (
        normalizedTitle.includes(input.query) ||
        input.query.includes(normalizedTitle)
      ) {
        score = Math.max(score, 0.9);
      }

      const dateMatches = Boolean(
        input.requestedDate &&
          candidate.dueAt &&
          localDateKey(input.requestedDate, input.timezone) ===
            localDateKey(candidate.dueAt, input.timezone),
      );

      if (input.requestedDate) {
        score += dateMatches ? 0.2 : -0.2;
      }

      return {
        ...candidate,
        score: Math.max(0, Math.min(1, score)),
        dateMatches,
      };
    })
    .filter((candidate) => candidate.score >= 0.34)
    .sort((left, right) => {
      if (left.dateMatches !== right.dateMatches) {
        return left.dateMatches ? -1 : 1;
      }

      return right.score - left.score;
    })
    .slice(0, 5);
}

function inferActionScope(normalized: string): CaptureActionScope {
  if (/\b(?:toda|todas|completa)\s+(?:la\s+)?(?:serie|repeticion)\b/.test(normalized)) {
    return 'series';
  }

  if (/\bhoy\b.*\bmanana\b|\bmanana\b.*\bhoy\b/.test(normalized)) {
    return 'today_and_tomorrow';
  }

  if (/\bmanana\b/.test(normalized)) {
    return 'tomorrow';
  }

  if (/\bhoy\b/.test(normalized)) {
    return 'today';
  }

  return 'unspecified';
}

function cleanActionQuery(value: string) {
  return value
    .replace(
      /\b(?:cancela|cancelar|cancele|canceles|elimina|eliminar|elimine|elimines|borra|borrar|borre|borres|quita|quitar|quite|quites|termina|terminar|termine|completa|completar|complete|finaliza|finalizar|busca|buscar|encuentra|encontrar|muestra|mostrar)\b/g,
      ' ',
    )
    .replace(/\b(?:quiero\s+que|quiero|necesito|ya\s+no)\b/g, ' ')
    .replace(/\b(?:la|las|el|los|una|un)?\s*tareas?\b/g, ' ')
    .replace(/\b(?:de|para)\s+(?:el\s+)?(?:dia\s+de\s+)?(?:hoy|manana)\b/g, ' ')
    .replace(/\b(?:hoy|manana)\b/g, ' ')
    .replace(/\b(?:que\s+)?(?:debo|tengo\s+que|hay\s+que)\b/g, ' ')
    .replace(/\b(?:toda|todas|completa)\s+(?:la\s+)?(?:serie|repeticion)\b/g, ' ')
    .replace(/\ba\s+las?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/g, ' ')
    .replace(
      /\b\d{1,4}\s+min(?:uto)?s?\s+antes(?:\s+de\s+las?\s+\d{1,2})?\b/g,
      ' ',
    )
    .replace(/\b(?:por\s+favor|ya\s+hice|ya\s+termine|ya\s+complete)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:y|de|para)\s+)+/, '');
}

function localDateKey(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

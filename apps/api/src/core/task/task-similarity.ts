import { createHash } from 'node:crypto';

const ignoredWords = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'lo',
  'los',
  'mi',
  'para',
  'por',
  'que',
  'un',
  'una',
  'y',
]);

export function normalizeTaskTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function taskTitleSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeTaskTitle(left);
  const normalizedRight = normalizeTaskTitle(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const leftTokens = meaningfulTokens(normalizedLeft);
  const rightTokens = meaningfulTokens(normalizedRight);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;

  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

export function schedulesMatchExactly(
  left: Date | null | undefined,
  right: Date | null | undefined,
) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return Math.abs(left.getTime() - right.getTime()) <= 5 * 60_000;
}

export function schedulesAreComparable(
  left: Date | null | undefined,
  right: Date | null | undefined,
) {
  if (!left || !right) {
    return true;
  }

  return Math.abs(left.getTime() - right.getTime()) <= 24 * 60 * 60_000;
}

export function buildTaskDedupeKey(input: {
  companyId: string;
  spaceId?: string | null;
  actorUserId: string;
  title: string;
  dueAt?: Date | null;
}) {
  const destination = input.spaceId
    ? `space:${input.spaceId}`
    : `private:${input.actorUserId}`;
  const schedule = input.dueAt
    ? Math.round(input.dueAt.getTime() / 300_000).toString()
    : 'without-date';
  const source = [
    input.companyId,
    destination,
    normalizeTaskTitle(input.title),
    schedule,
  ].join('|');

  return createHash('sha256').update(source).digest('hex');
}

function meaningfulTokens(value: string) {
  return new Set(
    normalizeTaskTitle(value)
      .split(' ')
      .filter((token) => token.length > 1 && !ignoredWords.has(token)),
  );
}

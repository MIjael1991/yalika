export const recurrenceFrequencies = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
] as const;

export type RecurrenceFrequency =
  (typeof recurrenceFrequencies)[number];

export function isRecurrenceFrequency(
  value: string | undefined,
): value is RecurrenceFrequency {
  return recurrenceFrequencies.includes(value as RecurrenceFrequency);
}

export function calculateNextOccurrence(
  occurrenceAt: Date,
  startsAt: Date,
  frequency: RecurrenceFrequency,
  interval: number,
) {
  if (frequency === 'daily' || frequency === 'weekly') {
    const next = new Date(occurrenceAt);
    const days = frequency === 'daily' ? interval : interval * 7;
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  if (frequency === 'monthly') {
    const monthIndex =
      occurrenceAt.getUTCFullYear() * 12 +
      occurrenceAt.getUTCMonth() +
      interval;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const day = Math.min(
      startsAt.getUTCDate(),
      daysInUtcMonth(year, month),
    );

    return buildUtcDate(startsAt, year, month, day);
  }

  const year = occurrenceAt.getUTCFullYear() + interval;
  const month = startsAt.getUTCMonth();
  const day = Math.min(
    startsAt.getUTCDate(),
    daysInUtcMonth(year, month),
  );

  return buildUtcDate(startsAt, year, month, day);
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function buildUtcDate(
  anchor: Date,
  year: number,
  month: number,
  day: number,
) {
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

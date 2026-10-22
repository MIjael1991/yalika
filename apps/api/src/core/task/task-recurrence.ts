export const recurrenceFrequencies = [
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
] as const;

export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number];

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
  if (frequency === 'hourly') {
    return new Date(occurrenceAt.getTime() + interval * 60 * 60 * 1000);
  }

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
    const day = Math.min(startsAt.getUTCDate(), daysInUtcMonth(year, month));

    return buildUtcDate(startsAt, year, month, day);
  }

  const year = occurrenceAt.getUTCFullYear() + interval;
  const month = startsAt.getUTCMonth();
  const day = Math.min(startsAt.getUTCDate(), daysInUtcMonth(year, month));

  return buildUtcDate(startsAt, year, month, day);
}

export function findLatestOccurrenceAtOrBefore(
  firstOccurrenceAt: Date,
  startsAt: Date,
  frequency: RecurrenceFrequency,
  interval: number,
  limit: Date,
) {
  if (firstOccurrenceAt.getTime() > limit.getTime()) {
    return {
      occurrenceAt: firstOccurrenceAt,
      nextOccurrenceAt: calculateNextOccurrence(
        firstOccurrenceAt,
        startsAt,
        frequency,
        interval,
      ),
      skippedOccurrences: 0,
    };
  }

  let estimatedSteps = 0;

  if (frequency === 'hourly') {
    estimatedSteps = Math.max(
      0,
      Math.floor(
        (limit.getTime() - firstOccurrenceAt.getTime()) /
          (interval * 60 * 60 * 1000),
      ),
    );
  } else if (frequency === 'daily' || frequency === 'weekly') {
    const days = frequency === 'daily' ? interval : interval * 7;
    estimatedSteps = Math.max(
      0,
      Math.floor(
        (limit.getTime() - firstOccurrenceAt.getTime()) /
          (days * 24 * 60 * 60 * 1000),
      ),
    );
  } else if (frequency === 'monthly') {
    const monthDifference =
      (limit.getUTCFullYear() - firstOccurrenceAt.getUTCFullYear()) * 12 +
      limit.getUTCMonth() -
      firstOccurrenceAt.getUTCMonth();
    estimatedSteps = Math.max(0, Math.floor(monthDifference / interval));
  } else {
    estimatedSteps = Math.max(
      0,
      Math.floor(
        (limit.getUTCFullYear() - firstOccurrenceAt.getUTCFullYear()) /
          interval,
      ),
    );
  }

  let occurrenceAt = addOccurrences(
    firstOccurrenceAt,
    startsAt,
    frequency,
    interval,
    estimatedSteps,
  );

  while (occurrenceAt.getTime() > limit.getTime() && estimatedSteps > 0) {
    estimatedSteps -= 1;
    occurrenceAt = addOccurrences(
      firstOccurrenceAt,
      startsAt,
      frequency,
      interval,
      estimatedSteps,
    );
  }

  let nextOccurrenceAt = calculateNextOccurrence(
    occurrenceAt,
    startsAt,
    frequency,
    interval,
  );

  while (nextOccurrenceAt.getTime() <= limit.getTime()) {
    occurrenceAt = nextOccurrenceAt;
    estimatedSteps += 1;
    nextOccurrenceAt = calculateNextOccurrence(
      occurrenceAt,
      startsAt,
      frequency,
      interval,
    );
  }

  return {
    occurrenceAt,
    nextOccurrenceAt,
    skippedOccurrences: estimatedSteps,
  };
}

function addOccurrences(
  firstOccurrenceAt: Date,
  startsAt: Date,
  frequency: RecurrenceFrequency,
  interval: number,
  count: number,
) {
  if (count === 0) {
    return new Date(firstOccurrenceAt);
  }

  if (frequency === 'hourly') {
    return new Date(
      firstOccurrenceAt.getTime() + interval * count * 60 * 60 * 1000,
    );
  }

  if (frequency === 'daily' || frequency === 'weekly') {
    const next = new Date(firstOccurrenceAt);
    const days = frequency === 'daily' ? interval : interval * 7;
    next.setUTCDate(next.getUTCDate() + days * count);
    return next;
  }

  if (frequency === 'monthly') {
    const monthIndex =
      firstOccurrenceAt.getUTCFullYear() * 12 +
      firstOccurrenceAt.getUTCMonth() +
      interval * count;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const day = Math.min(startsAt.getUTCDate(), daysInUtcMonth(year, month));
    return buildUtcDate(startsAt, year, month, day);
  }

  const year = firstOccurrenceAt.getUTCFullYear() + interval * count;
  const month = startsAt.getUTCMonth();
  const day = Math.min(startsAt.getUTCDate(), daysInUtcMonth(year, month));
  return buildUtcDate(startsAt, year, month, day);
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function buildUtcDate(anchor: Date, year: number, month: number, day: number) {
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

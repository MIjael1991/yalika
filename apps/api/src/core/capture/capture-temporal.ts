import { normalizeCaptureText } from './capture-classifier';

type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type CaptureTemporalResult = {
  title: string;
  dueAt: string | null;
  recurrenceFrequency: RecurrenceFrequency | null;
  recurrenceInterval: number | null;
  recurrenceEndsAt: string | null;
  reminderMinutesBefore: number | null;
  temporalSummary: string | null;
  needsTemporalConfirmation: boolean;
  canUseTemporalProposal: boolean;
};

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const weekdays: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const months: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export function interpretCaptureTemporal(input: {
  message: string;
  title: string;
  timezone: string;
  now?: Date;
}): CaptureTemporalResult {
  const now = input.now ?? new Date();
  const normalized = normalizeCaptureText(input.message);
  const normalizedDateSignals = normalized.replace(
    /\b(?:de|por)\s+la\s+manana\b/g,
    ' ',
  );
  const localNow = getZonedParts(now, input.timezone);
  const todayAndTomorrow = hasTodayAndTomorrow(normalizedDateSignals);
  const recurrence = todayAndTomorrow
    ? { frequency: 'daily' as const, interval: 1 }
    : inferRecurrence(normalized);
  const time = inferTime(normalized);
  const date = inferDate(
    normalizedDateSignals,
    localNow,
    recurrence.frequency,
  );
  const hasTemporalSignal = Boolean(
    time.explicit || date.explicit || recurrence.frequency,
  );
  let localDue: LocalDateTime | null = null;
  let usedDefaultTime = false;
  let invalidDate = false;
  let explicitTimeAlreadyPassed = false;

  if (hasTemporalSignal) {
    const selectedDate = date.value ?? defaultDate(localNow, recurrence.frequency);
    const selectedTime = time.value ?? { hour: 9, minute: 0 };
    usedDefaultTime = !time.value;
    invalidDate = !isValidLocalDate(selectedDate);

    if (!invalidDate) {
      localDue = {
        ...selectedDate,
        ...selectedTime,
      };

      let dueAt = zonedDateTimeToUtc(localDue, input.timezone);

      explicitTimeAlreadyPassed =
        date.explicit && dueAt.getTime() <= now.getTime();

      if (
        !date.explicit &&
        !recurrence.frequency &&
        dueAt.getTime() <= now.getTime()
      ) {
        localDue = addLocalDays(localDue, 1);
        dueAt = zonedDateTimeToUtc(localDue, input.timezone);
      }
    }
  }

  const dueAt = localDue
    ? zonedDateTimeToUtc(localDue, input.timezone)
    : null;
  const recurrenceEndsAt = todayAndTomorrow
    ? zonedDateTimeToUtc(
        {
          ...addLocalDays(
            {
              year: localNow.year,
              month: localNow.month,
              day: localNow.day,
            },
            1,
          ),
          hour: 23,
          minute: 59,
        },
        input.timezone,
      )
    : null;
  const reminderMinutesBefore = inferReminder(normalized, Boolean(dueAt));
  const temporalSummary = invalidDate
    ? 'La fecha indicada no existe. Corrígela antes de guardar.'
    : dueAt
      ? buildSummary(
          dueAt,
          input.timezone,
          recurrence.frequency,
          recurrence.interval,
          reminderMinutesBefore,
          usedDefaultTime,
          time.assumedPeriod,
          todayAndTomorrow,
          explicitTimeAlreadyPassed,
        )
      : null;

  return {
    title: cleanTemporalTitle(input.title),
    dueAt: dueAt?.toISOString() ?? null,
    recurrenceFrequency: recurrence.frequency,
    recurrenceInterval: recurrence.frequency ? recurrence.interval : null,
    recurrenceEndsAt: recurrenceEndsAt?.toISOString() ?? null,
    reminderMinutesBefore,
    temporalSummary,
    needsTemporalConfirmation:
      usedDefaultTime ||
      invalidDate ||
      time.assumedPeriod ||
      explicitTimeAlreadyPassed,
    canUseTemporalProposal:
      time.assumedPeriod &&
      !usedDefaultTime &&
      !invalidDate &&
      !explicitTimeAlreadyPassed,
  };
}

function inferRecurrence(normalized: string) {
  const intervalMatch = normalized.match(
    /\bcada\s+(\d{1,3})\s+(dias?|semanas?|meses|anos?)\b/,
  );
  const interval = intervalMatch ? Math.max(1, Number(intervalMatch[1])) : 1;
  const unit = intervalMatch?.[2] ?? '';

  if (unit.startsWith('dia') || /\b(?:cada dia|diario|diaria)\b/.test(normalized)) {
    return { frequency: 'daily' as const, interval };
  }

  if (
    unit.startsWith('semana') ||
    /\b(?:cada semana|semanal|cada (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/.test(
      normalized,
    )
  ) {
    return { frequency: 'weekly' as const, interval };
  }

  if (unit.startsWith('mes') || /\b(?:cada mes|mensual)\b/.test(normalized)) {
    return { frequency: 'monthly' as const, interval };
  }

  if (unit.startsWith('ano') || /\b(?:cada ano|anual)\b/.test(normalized)) {
    return { frequency: 'yearly' as const, interval };
  }

  return { frequency: null, interval: 1 };
}

function inferTime(normalized: string) {
  const periodMatch = normalized.match(
    /\ba\s+las?\s+(\d{1,2})(?::(\d{2}))?\s*(?:de\s+la\s+)?(manana|tarde|noche)\b/,
  );
  const amPmMatch = normalized.match(
    /\b(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/,
  );
  const twentyFourHourMatch = normalized.match(
    /\ba\s+las?\s+([01]?\d|2[0-3]):([0-5]\d)\b/,
  );
  const ambiguousHourMatch = normalized.match(
    /\b(?:a\s+las?|de\s+las?)\s+(\d{1,2})(?::(\d{2}))?\b/,
  );
  const match =
    periodMatch ?? amPmMatch ?? twentyFourHourMatch ?? ambiguousHourMatch;

  if (!match) {
    return { explicit: false, value: null, assumedPeriod: false };
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const period = match[3];
  const assumedPeriod = match === ambiguousHourMatch;

  if (assumedPeriod && hour >= 1 && hour <= 7) {
    hour += 12;
  }

  if (period === 'pm' || period === 'tarde' || period === 'noche') {
    if (hour < 12) {
      hour += 12;
    }
  } else if ((period === 'am' || period === 'manana') && hour === 12) {
    hour = 0;
  }

  if (hour > 23 || minute > 59) {
    return { explicit: false, value: null, assumedPeriod: false };
  }

  return {
    explicit: true,
    value: { hour, minute },
    assumedPeriod,
  };
}

function inferDate(
  normalized: string,
  localNow: LocalDateTime,
  recurrenceFrequency: RecurrenceFrequency | null,
) {
  const localDate = {
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
  };

  if (hasTodayAndTomorrow(normalized)) {
    return { explicit: true, value: localDate };
  }

  if (/\bpasado manana\b/.test(normalized)) {
    return { explicit: true, value: addLocalDays(localDate, 2) };
  }

  if (/\bmanana\b/.test(normalized)) {
    return { explicit: true, value: addLocalDays(localDate, 1) };
  }

  if (/\bhoy\b/.test(normalized)) {
    return { explicit: true, value: localDate };
  }

  const namedDate = normalized.match(
    /\b(?:el\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/,
  );

  if (namedDate) {
    const day = Number(namedDate[1]);
    const month = months[namedDate[2]];
    let year = namedDate[3] ? Number(namedDate[3]) : localNow.year;
    let candidate = { year, month, day };

    if (!namedDate[3] && compareLocalDate(candidate, localDate) < 0) {
      year += 1;
      candidate = { year, month, day };
    }

    return { explicit: true, value: candidate };
  }

  const weekdayMatch = normalized.match(
    /\b(?:cada\s+|el\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/,
  );

  if (weekdayMatch) {
    const base = asSyntheticDate(localDate);
    const currentWeekday = base.getUTCDay();
    const requestedWeekday = weekdays[weekdayMatch[1]];
    let daysAhead = (requestedWeekday - currentWeekday + 7) % 7;

    if (daysAhead === 0 && recurrenceFrequency === 'weekly') {
      daysAhead = 7;
    }

    return {
      explicit: true,
      value: addLocalDays(localDate, daysAhead),
    };
  }

  return { explicit: false, value: null };
}

function inferReminder(normalized: string, hasDueAt: boolean) {
  if (!hasDueAt) {
    return null;
  }

  const minuteMatch = normalized.match(
    /\b(\d{1,4})\s+min(?:uto)?s?\s+antes\b/,
  );
  if (minuteMatch) {
    return Math.min(10080, Number(minuteMatch[1]));
  }

  const hourMatch = normalized.match(
    /\b(?:(\d{1,3})|una?)\s+horas?\s+antes\b/,
  );
  if (hourMatch) {
    return Math.min(10080, Number(hourMatch[1] ?? 1) * 60);
  }

  if (/\b(?:recuerdame|avisame|alarma)\b/.test(normalized)) {
    return 0;
  }

  return null;
}

function defaultDate(
  localNow: LocalDateTime,
  recurrenceFrequency: RecurrenceFrequency | null,
) {
  const base = {
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
  };

  if (recurrenceFrequency === 'weekly') {
    return addLocalDays(base, 7);
  }

  if (recurrenceFrequency === 'monthly') {
    return addLocalMonths(base, 1);
  }

  if (recurrenceFrequency === 'yearly') {
    return { ...base, year: base.year + 1 };
  }

  return addLocalDays(base, 1);
}

function cleanTemporalTitle(title: string) {
  const cleaned = title
    .replace(/\b(?:recu[eé]rdame|av[ií]same|pon(?:me)?\s+una?\s+alarma)\b/gi, ' ')
    .replace(
      /\b(?:a\s+las?|de\s+las?)\s+\d{1,2}(?::\d{2})?\s*(?:(?:de\s+la\s+)?(?:mañana|tarde|noche)|am|pm)?\b/gi,
      ' ',
    )
    .replace(/\bpasado\s+mañana\b/gi, ' ')
    .replace(/\b(?:hoy|mañana)\b/gi, ' ')
    .replace(
      /\b(?:cada\s+(?:\d+\s+)?(?:día|dias?|semana|semanas|mes|meses|año|años|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)|diari[oa]|semanal|mensual|anual)\b/gi,
      ' ',
    )
    .replace(
      /\b(?:el\s+)?(?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/gi,
      ' ',
    )
    .replace(
      /\b(?:el\s+)?\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?\b/gi,
      ' ',
    )
    .replace(
      /\b(?:\d+|un|una)\s+(?:min(?:uto)?s?|horas?)\s+antes\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:y|para|que)\s+|\s+(?:y|para|que)$/gi, '')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();

  const result = cleaned.length >= 3 ? cleaned : title.trim();

  return result.charAt(0).toLocaleUpperCase('es-MX') + result.slice(1);
}

function buildSummary(
  dueAt: Date,
  timezone: string,
  frequency: RecurrenceFrequency | null,
  interval: number,
  reminderMinutesBefore: number | null,
  usedDefaultTime: boolean,
  assumedPeriod: boolean,
  todayAndTomorrow: boolean,
  explicitTimeAlreadyPassed: boolean,
) {
  const date = new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(dueAt);
  const parts = [date];

  if (todayAndTomorrow) {
    parts.push('2 ocasiones: hoy y mañana');
  } else if (frequency) {
    const labels: Record<RecurrenceFrequency, string> = {
      daily: interval === 1 ? 'cada día' : `cada ${interval} días`,
      weekly: interval === 1 ? 'cada semana' : `cada ${interval} semanas`,
      monthly: interval === 1 ? 'cada mes' : `cada ${interval} meses`,
      yearly: interval === 1 ? 'cada año' : `cada ${interval} años`,
    };
    parts.push(labels[frequency]);
  }

  if (reminderMinutesBefore !== null) {
    parts.push(
      reminderMinutesBefore === 0
        ? 'aviso a la hora'
        : `aviso ${reminderMinutesBefore} min antes`,
    );
  }

  if (usedDefaultTime) {
    parts.push('9:00 es una hora propuesta; confírmala');
  }

  if (assumedPeriod) {
    parts.push('ORION asumió horario de tarde; confirma antes de guardar');
  }

  if (explicitTimeAlreadyPassed) {
    parts.push('esa hora ya pasó; elige si deseas moverla');
  }

  return parts.join(' · ');
}

function hasTodayAndTomorrow(normalized: string) {
  return /\bhoy\b.*\bmanana\b|\bmanana\b.*\bhoy\b/.test(normalized);
}

function getZonedParts(date: Date, timezone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function zonedDateTimeToUtc(local: LocalDateTime, timezone: string) {
  const intendedUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  let result = new Date(intendedUtc);

  for (let index = 0; index < 3; index += 1) {
    const represented = getZonedParts(result, timezone);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    const correction = intendedUtc - representedUtc;

    if (correction === 0) {
      break;
    }

    result = new Date(result.getTime() + correction);
  }

  return result;
}

function addLocalDays<T extends { year: number; month: number; day: number }>(
  value: T,
  days: number,
): T {
  const synthetic = asSyntheticDate(value);
  synthetic.setUTCDate(synthetic.getUTCDate() + days);
  return {
    ...value,
    year: synthetic.getUTCFullYear(),
    month: synthetic.getUTCMonth() + 1,
    day: synthetic.getUTCDate(),
  };
}

function addLocalMonths(
  value: { year: number; month: number; day: number },
  monthsToAdd: number,
) {
  const monthIndex = value.year * 12 + value.month - 1 + monthsToAdd;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    day: Math.min(value.day, lastDay),
  };
}

function asSyntheticDate(value: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(value.year, value.month - 1, value.day));
}

function compareLocalDate(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number },
) {
  return asSyntheticDate(left).getTime() - asSyntheticDate(right).getTime();
}

function isValidLocalDate(value: {
  year: number;
  month: number;
  day: number;
}) {
  const synthetic = asSyntheticDate(value);
  return (
    synthetic.getUTCFullYear() === value.year &&
    synthetic.getUTCMonth() + 1 === value.month &&
    synthetic.getUTCDate() === value.day
  );
}

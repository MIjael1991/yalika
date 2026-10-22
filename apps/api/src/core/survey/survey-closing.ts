import { BadRequestException } from '@nestjs/common';

type ClosableSurvey = { status: string; closesAt?: Date | null };

/** Una encuesta recibe respuestas solo si está activa y su fecha de cierre no ha llegado. */
export function surveyIsOpen(survey: ClosableSurvey, now = new Date()) {
  return (
    survey.status === 'active' &&
    !(survey.closesAt && survey.closesAt.getTime() <= now.getTime())
  );
}

/** Estado que ve la persona: 'closed' cuando ya pasó la fecha de cierre aunque siga marcada activa. */
export function effectiveSurveyStatus(
  survey: ClosableSurvey,
  now = new Date(),
) {
  return survey.status === 'active' && !surveyIsOpen(survey, now)
    ? 'closed'
    : survey.status;
}

/**
 * Fecha de cierre que se guardará.
 * undefined = no cambia, null o vacío = quitar la fecha, texto = nueva fecha (debe ser futura).
 */
export function resolveClosesAt(
  input: string | null | undefined,
  current: Date | null | undefined,
  now = new Date(),
): Date | null {
  if (input === undefined) return current ?? null;
  if (input === null || input === '') return null;

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('La fecha de cierre no es válida');
  }
  const unchanged = current && current.getTime() === date.getTime();
  if (!unchanged && date.getTime() <= now.getTime()) {
    throw new BadRequestException(
      'La fecha de cierre debe ser posterior a este momento',
    );
  }
  return date;
}

/** Evita abrir una encuesta cuya fecha de cierre ya pasó (se cerraría al instante). */
export function assertCanOpen(
  status: string,
  closesAt: Date | null | undefined,
  now = new Date(),
) {
  if (status === 'active' && closesAt && closesAt.getTime() <= now.getTime()) {
    throw new BadRequestException(
      'La fecha de cierre ya pasó. Edita la encuesta y elige una fecha nueva (o quítala) antes de abrirla otra vez.',
    );
  }
}

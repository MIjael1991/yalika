type CountedAnswer = {
  option: string;
  count: number;
};

type InsightQuestion = {
  prompt: string;
  type: string;
  answers: CountedAnswer[];
  textAnswerCount: number;
};

export function normalizeSurveyDimension(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-MX');
}

export function surveyAnswerKeys(value: unknown) {
  const values = Array.isArray(value) ? value : [value];

  return values.flatMap((item) => {
    if (item === undefined || item === null || item === '') return [];

    const raw = String(item).trim().slice(0, 180);
    return [/^otr[oa]\s*[:—-]/i.test(raw) ? 'Otro' : raw];
  });
}

function percentage(count: number, total: number) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function ratingNumber(option: string) {
  const match = option.trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function buildSurveyInsights(
  responseCount: number,
  questions: InsightQuestion[],
) {
  if (!responseCount) {
    return [
      'Todavía no hay participaciones en este periodo. Comparte la encuesta o cambia los filtros.',
    ];
  }

  const insights: string[] = [];

  for (const question of questions) {
    if (insights.length >= 5) break;

    if (question.type === 'text') {
      if (question.textAnswerCount > 0) {
        insights.push(
          `“${question.prompt}” recibió ${question.textAnswerCount} respuestas escritas para revisar.`,
        );
      }
      continue;
    }

    const answered = question.answers.filter((answer) => answer.count > 0);
    const top = answered.toSorted((a, b) => b.count - a.count)[0];

    if (!top) continue;

    if (question.type === 'rating') {
      const rated = answered.flatMap((answer) => {
        const value = ratingNumber(answer.option);
        return value === null ? [] : [{ value, count: answer.count }];
      });
      const totalRatings = rated.reduce((sum, answer) => sum + answer.count, 0);

      if (totalRatings) {
        const average =
          rated.reduce((sum, answer) => sum + answer.value * answer.count, 0) /
          totalRatings;
        insights.push(
          `La calificación promedio en “${question.prompt}” es ${average.toFixed(1)} con ${totalRatings} respuestas.`,
        );
        continue;
      }
    }

    insights.push(
      `En “${question.prompt}”, la respuesta principal es “${top.option}” con ${percentage(top.count, responseCount)}% (${top.count} personas).`,
    );
  }

  return insights.length
    ? insights
    : [
        'Las participaciones están registradas, pero todavía no hay respuestas resumibles en este periodo.',
      ];
}

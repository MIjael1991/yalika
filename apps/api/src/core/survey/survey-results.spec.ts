import {
  buildSurveyInsights,
  normalizeSurveyDimension,
  surveyAnswerKeys,
} from './survey-results';

describe('survey results helpers', () => {
  it('normalizes locations without accents or surrounding spaces', () => {
    expect(normalizeSurveyDimension('  José María Morelos  ')).toBe(
      'jose maria morelos',
    );
  });

  it('groups custom options under Otro', () => {
    expect(surveyAnswerKeys(['Agua', 'Otro: Kombucha', 'Otra: Té'])).toEqual([
      'Agua',
      'Otro',
      'Otro',
    ]);
  });

  it('builds factual insights from counts', () => {
    expect(
      buildSurveyInsights(10, [
        {
          prompt: '¿Qué prefieres?',
          type: 'choice',
          answers: [
            { option: 'A', count: 7 },
            { option: 'B', count: 3 },
          ],
          textAnswerCount: 0,
        },
      ])[0],
    ).toContain('70%');
  });
});

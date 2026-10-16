import {
  buildSurveySuggestion,
  updateSurveyDraftLocally,
} from './survey-suggestion';

describe('buildSurveySuggestion', () => {
  it('creates neutral questions about a public representative', () => {
    const suggestion = buildSurveySuggestion(
      'Quiero saber si conocen a una senadora y su trabajo',
    );

    expect(suggestion.identityMode).toBe('anonymous');
    expect(suggestion.questions[0].prompt).toContain('Conoces');
    expect(suggestion.questions).toHaveLength(8);
  });

  it('creates community priorities without asking the user to configure types', () => {
    const suggestion = buildSurveySuggestion(
      'Haz una encuesta de 6 preguntas sobre las necesidades de mi colonia',
    );

    expect(suggestion.title).toContain('comunidad');
    expect(suggestion.questions).toHaveLength(6);
    expect(suggestion.questions[0].options.length).toBeGreaterThan(1);
  });

  it('creates the requested beverage survey with complete options', () => {
    const suggestion = buildSurveySuggestion(
      'Dame una encuesta sobre los tipos de bebidas que hay de 6 preguntas, con todas las opciones',
    );

    expect(suggestion.title).toContain('bebidas');
    expect(suggestion.questions).toHaveLength(6);
    expect(
      suggestion.questions.every((question) => question.options.length > 1),
    ).toBe(true);
    expect(suggestion.questions[0].options).toContain('Agua natural');
    expect(suggestion.questions.every((question) => question.required)).toBe(
      true,
    );
  });

  it('understands a question count written as a word', () => {
    const suggestion = buildSurveySuggestion(
      'Prepara seis preguntas sobre bebidas',
    );

    expect(suggestion.questions).toHaveLength(6);
  });

  it('builds an editable fallback for a topic that was never programmed', () => {
    const suggestion = buildSurveySuggestion(
      'Crea 7 preguntas sobre adopción responsable de mascotas',
    );

    expect(suggestion.title.toLowerCase()).toContain('mascotas');
    expect(suggestion.questions).toHaveLength(7);
    expect(suggestion.mode).toBe('local');
  });

  it('changes one draft question without replacing the rest', () => {
    const suggestion = updateSurveyDraftLocally(
      'Cambia la pregunta 2 por: ¿Cuánto pagarías? y agrega opciones de menos de 20, de 20 a 40, de 41 a 60 y más de 60 pesos.',
      {
        title: 'Bebidas',
        description: 'Encuesta existente',
        identityMode: 'anonymous',
        questions: [
          {
            prompt: '¿Qué bebida prefieres?',
            type: 'choice',
            options: ['Agua', 'Café'],
          },
          {
            prompt: 'Pregunta anterior',
            type: 'text',
            options: [],
          },
          {
            prompt: '¿Con qué frecuencia compras?',
            type: 'choice',
            options: ['Diario', 'Semanal'],
          },
        ],
      },
    );

    expect(suggestion?.questions).toHaveLength(3);
    expect(suggestion?.questions[0].prompt).toBe('¿Qué bebida prefieres?');
    expect(suggestion?.questions[1].prompt).toBe('¿Cuánto pagarías?');
    expect(suggestion?.questions[1].options).toEqual([
      'menos de 20',
      'de 20 a 40',
      'de 41 a 60',
      'más de 60 pesos',
    ]);
    expect(suggestion?.questions.every((question) => question.required)).toBe(
      true,
    );
  });

  it('preserves a draft when a local edit is not understood', () => {
    const suggestion = updateSurveyDraftLocally('Mejórala con más claridad', {
      title: 'Encuesta actual',
      questions: [
        { prompt: 'Pregunta uno', type: 'text', options: [] },
        { prompt: 'Pregunta dos', type: 'text', options: [] },
      ],
    });

    expect(suggestion?.title).toBe('Encuesta actual');
    expect(suggestion?.questions.map((question) => question.prompt)).toEqual([
      'Pregunta uno',
      'Pregunta dos',
    ]);
  });
});

it('respects an exact requested question count and type mix', () => {
  const suggestion = buildSurveySuggestion(
    'Haz 6 preguntas sobre servicio: 2 de selección múltiple, 2 sí/no y 2 abiertas',
  );

  expect(suggestion.questions).toHaveLength(6);
  expect(
    suggestion.questions.filter((question) => question.type === 'multi'),
  ).toHaveLength(2);
  expect(
    suggestion.questions.filter((question) => question.type === 'yesno'),
  ).toHaveLength(2);
  expect(
    suggestion.questions.filter((question) => question.type === 'text'),
  ).toHaveLength(2);
  expect(suggestion.questions.every((question) => question.required)).toBe(
    true,
  );
});

it('allows one or two questions when the user explicitly asks for them', () => {
  expect(
    buildSurveySuggestion('Haz 1 pregunta sobre mascotas').questions,
  ).toHaveLength(1);
  expect(
    buildSurveySuggestion('Haz 2 preguntas sobre mascotas').questions,
  ).toHaveLength(2);
});

it('supports the maximum of 20 requested questions', () => {
  const suggestion = buildSurveySuggestion(
    'Haz 20 preguntas sobre las necesidades de la comunidad',
  );

  expect(suggestion.questions).toHaveLength(20);
});

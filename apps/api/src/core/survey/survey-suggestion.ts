export type SurveySuggestionQuestion = {
  prompt: string;
  type: 'choice' | 'multi' | 'yesno' | 'rating' | 'text';
  options: string[];
  required: boolean;
  publicAggregate: boolean;
};

export type SurveySuggestion = {
  title: string;
  description: string;
  identityMode: 'anonymous' | 'phone' | 'email_or_phone';
  questions: SurveySuggestionQuestion[];
  note: string;
  mode: 'ai' | 'local';
};

export type SurveySuggestionDraft = {
  title?: string;
  description?: string;
  identityMode?: string;
  questions?: Array<{
    prompt?: string;
    type?: string;
    options?: string[];
    required?: boolean;
    publicAggregate?: boolean;
  }>;
};

export type SurveyRequestRequirements = {
  count?: number;
  typeCounts: Partial<Record<SurveySuggestionQuestion['type'], number>>;
  error?: string;
};

const surveyNumberWords: Record<string, number> = {
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
};

function requestedNumber(value?: string) {
  if (!value) return 0;
  const normalizedValue = normalized(value);
  const numeric = Number(normalizedValue);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  return surveyNumberWords[normalizedValue] ?? 0;
}

export function parseSurveyRequestRequirements(
  value: string,
): SurveyRequestRequirements {
  const text = normalized(value);
  const numberToken =
    '(?:\\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte)';
  const totalMatch = text.match(
    new RegExp(`\\b(${numberToken})\\s*(?:preguntas?|reactivos?)\\b`),
  );
  const explicitCount = requestedNumber(totalMatch?.[1]);
  let error =
    explicitCount > 20
      ? 'Las encuestas creadas por el asistente admiten hasta 20 preguntas. Reduce la cantidad solicitada.'
      : undefined;

  const aliases: Array<[SurveySuggestionQuestion['type'], string]> = [
    [
      'multi',
      '(?:seleccion multiple|opcion multiple|opciones multiples|multiples)',
    ],
    ['yesno', '(?:si\\s*(?:/|o)\\s*no|si no|cerradas?)'],
    ['rating', '(?:escala|calificacion|valoracion)'],
    ['text', '(?:abiertas?|texto libre|respuesta escrita)'],
    ['choice', '(?:opcion unica|seleccion unica|una opcion)'],
  ];
  const typeCounts: SurveyRequestRequirements['typeCounts'] = {};

  for (const [type, alias] of aliases) {
    const patterns = [
      new RegExp(
        `\\b(${numberToken})\\s*(?:preguntas?\\s*)?(?:de\\s+|tipo\\s+)?${alias}\\b`,
        'g',
      ),
      new RegExp(`\\b${alias}\\s*[:=-]?\\s*(${numberToken})\\b`, 'g'),
    ];

    let count = 0;
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        count += requestedNumber(match[1]);
      }
    }
    if (count > 20 && !error) {
      error = `Solicitaste más de 20 preguntas del tipo ${type}. Reduce esa cantidad.`;
    }
    if (count > 0) typeCounts[type] = Math.min(count, 20);
  }

  const typedTotal = Object.values(typeCounts).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  if (explicitCount > 0 && typedTotal > explicitCount && !error) {
    error = `Pediste ${explicitCount} preguntas en total, pero las cantidades por tipo suman ${typedTotal}. Ajusta una de las cantidades para que sean compatibles.`;
  }
  if (typedTotal > 20 && !error) {
    error =
      'Las cantidades por tipo suman más de 20 preguntas. Reduce la cantidad solicitada.';
  }

  const count = explicitCount || typedTotal || undefined;

  return {
    count: count ? Math.min(Math.max(count, 1), 20) : undefined,
    typeCounts,
    error,
  };
}

export function suggestionMatchesRequest(
  suggestion: Pick<SurveySuggestion, 'questions'>,
  request: string,
) {
  const requirements = parseSurveyRequestRequirements(request);
  if (requirements.error) return false;

  if (
    requirements.count &&
    suggestion.questions.length !== requirements.count
  ) {
    return false;
  }

  for (const [type, expected] of Object.entries(requirements.typeCounts)) {
    const actual = suggestion.questions.filter(
      (question) => question.type === type,
    ).length;
    if (actual !== expected) return false;
  }

  return true;
}

function draftQuestion(
  question: NonNullable<SurveySuggestionDraft['questions']>[number],
): SurveySuggestionQuestion | null {
  const prompt = question.prompt?.trim();
  if (!prompt) return null;

  const requestedType = question.type as SurveySuggestionQuestion['type'];
  const type: SurveySuggestionQuestion['type'] = [
    'choice',
    'multi',
    'yesno',
    'rating',
    'text',
  ].includes(requestedType)
    ? requestedType
    : 'text';
  let options = (question.options ?? [])
    .map((option) => option.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (type === 'yesno') options = ['Sí', 'No'];
  if (type === 'text') options = [];
  if (type === 'rating' && options.length < 2) {
    options = [
      '1 · Muy malo o muy poco',
      '2',
      '3',
      '4',
      '5 · Excelente o mucho',
    ];
  }

  return {
    prompt,
    type,
    options,
    required: true,
    publicAggregate:
      type === 'text' ? false : (question.publicAggregate ?? true),
  };
}

function optionList(value: string) {
  return value
    .replace(/\s+u\s+otra(?:s)?\s*$/i, ', Otra')
    .split(/\s*,\s*|\s+\by\b\s+(?=(?:menos|más|de|entre|otra|otro)\b)/i)
    .map((option) => option.trim().replace(/[.;]+$/g, ''))
    .filter(Boolean)
    .slice(0, 20);
}

export function updateSurveyDraftLocally(
  request: string,
  draft?: SurveySuggestionDraft,
): SurveySuggestion | null {
  const sourceQuestions = draft?.questions ?? [];
  if (!sourceQuestions.length) return null;

  const text = request.trim();
  const normalizedText = normalized(text);
  const editIntent =
    /\b(cambia|cambiar|modifica|modificar|edita|editar|reemplaza|reemplazar|elimina|eliminar|quita|quitar|mueve|mover|sube|baja|agrega|agregar|mejora|mejorar|mejorala|mejoralo|anonima|telefono|obligatoria)\b/.test(
      normalizedText,
    );
  if (!editIntent) return null;

  const questions = sourceQuestions.flatMap((question) => {
    const prepared = draftQuestion(question);
    return prepared ? [prepared] : [];
  });
  if (!questions.length) return null;

  let changed = false;
  let identityMode: SurveySuggestion['identityMode'] = [
    'anonymous',
    'phone',
    'email_or_phone',
  ].includes(String(draft?.identityMode))
    ? (draft?.identityMode as SurveySuggestion['identityMode'])
    : 'anonymous';

  if (/\b(anonima|an[oó]nima|sin nombre|sin identificar)\b/i.test(text)) {
    identityMode = 'anonymous';
    changed = true;
  } else if (/\b(con|pedir|solicitar)\s+(?:el\s+)?tel[eé]fono\b/i.test(text)) {
    identityMode = 'phone';
    changed = true;
  }

  const removeMatch = text.match(
    /\b(?:elimina|eliminar|quita|quitar)\s+(?:la\s+)?pregunta\s+(\d{1,2})\b/i,
  );
  if (removeMatch) {
    const index = Number(removeMatch[1]) - 1;
    if (index >= 0 && index < questions.length && questions.length > 1) {
      questions.splice(index, 1);
      changed = true;
    }
  }

  const changeMatch = text.match(
    /\b(?:cambia|modifica|edita|reemplaza)\s+(?:la\s+)?pregunta\s+(\d{1,2})\s+(?:por|a)\s*:?\s*([\s\S]+?)(?=\s+y\s+(?:agrega|pon|usa)\s+(?:las\s+)?opciones\b|$)/i,
  );
  if (changeMatch) {
    const index = Number(changeMatch[1]) - 1;
    const prompt = changeMatch[2].trim().replace(/[.;]+$/g, '');
    if (index >= 0 && index < questions.length && prompt) {
      questions[index] = { ...questions[index], prompt, required: true };
      changed = true;

      const optionsMatch = text.match(
        /\b(?:agrega|pon|usa)\s+(?:las\s+)?opciones\s*(?:de|:)?\s*([\s\S]+)$/i,
      );
      const options = optionList(optionsMatch?.[1] ?? '');
      if (options.length >= 2) {
        questions[index] = {
          ...questions[index],
          type: 'choice',
          options,
          publicAggregate: true,
        };
      }
    }
  }

  const moveMatch = text.match(
    /\b(?:mueve|mover|pasa|pon)\s+(?:la\s+)?pregunta\s+(\d{1,2})\s+(?:al|hasta\s+el)\s+(inicio|principio|final)\b/i,
  );
  if (moveMatch) {
    const index = Number(moveMatch[1]) - 1;
    if (index >= 0 && index < questions.length) {
      const [moved] = questions.splice(index, 1);
      if (/inicio|principio/i.test(moveMatch[2])) questions.unshift(moved);
      else questions.push(moved);
      changed = true;
    }
  }

  return {
    title: draft?.title?.trim() || 'Encuesta editable',
    description:
      draft?.description?.trim() ||
      'Consulta breve preparada para recopilar respuestas claras.',
    identityMode,
    questions: questions.map((question) => ({ ...question, required: true })),
    note: changed
      ? 'Apliqué el cambio sin borrar las demás preguntas. Revísalo antes de publicar.'
      : 'Conservé tu encuesta sin reemplazarla porque el asistente local no identificó con seguridad el cambio. Puedes editarla manualmente o activar la IA completa.',
    mode: 'local',
  };
}

type QuestionSeed = [
  prompt: string,
  type: SurveySuggestionQuestion['type'],
  options: string[],
];

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function requestedCount(value: string, maximum: number) {
  const requirements = parseSurveyRequestRequirements(value);
  const requested = requirements.count ?? Math.min(8, maximum);
  return Math.min(Math.max(requested, 1), maximum);
}

function genericTopic(value: string) {
  const original = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(
      /(?:[,.;!?]\s*|\s+)(?:dame|hazme|haz|crea|genera|prepara|necesito)\s+(?:una?\s+)?(?:\d{1,2}|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+preguntas?.*$/i,
      '',
    )
    .replace(/(?:[,.;!?]\s*|\s+)dame\s+preguntas?.*$/i, '');
  const withoutCount = original.replace(
    /\s+(?:de|con)\s+(?:\d{1,2}|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(?:preguntas?|reactivos?).*$/i,
    '',
  );
  const match =
    withoutCount.match(
      /(?:encuesta|consulta|preguntas?)\s+(?:sobre|acerca de|de)\s+(.+)$/i,
    ) ?? withoutCount.match(/(?:sobre|acerca de)\s+(.+)$/i);
  const topic = (match?.[1] ?? 'este tema')
    .replace(/\s+(?:con\s+)?todas?\s+las\s+opciones.*$/i, '')
    .replace(/[.?!,;:]+$/g, '')
    .trim()
    .slice(0, 100);

  return !topic ||
    /^(?:que|qué|quiero|necesito|como|cómo)\b/i.test(topic) ||
    topic.split(' ').length > 14
    ? 'este tema'
    : topic;
}

export function buildSurveySuggestion(request: string): SurveySuggestion {
  const text = normalized(request);
  const referent =
    /(senador|senadora|diputad|candidat|president|alcald|gobernador|persona publica|representante|conoces a)/.test(
      text,
    );
  const community =
    /(colonia|comunidad|municipio|vecin|servicios publicos|barrio)/.test(text);
  const staff =
    /(emplead|trabajador|personal|recursos humanos|clima laboral|oficina)/.test(
      text,
    );
  const customer =
    /(cliente|negocio|restaurante|tienda|servicio|satisfaccion|producto)/.test(
      text,
    );
  const education =
    /(escuela|alumno|estudiante|maestro|profesor|clase|padres|segundo grado)/.test(
      text,
    );
  const health = /(salud|paciente|medico|psicolog|consulta|tratamiento)/.test(
    text,
  );
  const partyDrinks =
    /fiesta|reunion|convivio|celebracion/.test(text) &&
    /beb|tom(?:a|an|ar|as)|consum/.test(text);
  const beverages =
    /(bebida|refresco|jugo|agua embotellada|cafe|te |cerveza|coctel)/.test(
      text,
    );

  let title = 'Queremos conocer tu opinión';
  let description =
    'Una consulta breve para conocer opiniones, prioridades y oportunidades de mejora.';
  let identityMode: SurveySuggestion['identityMode'] = 'phone';
  let seeds: QuestionSeed[];

  if (partyDrinks) {
    title = '¿Qué te gusta tomar cuando vas de fiesta?';
    description =
      'Cuéntanos qué bebidas prefieres cuando sales de fiesta. También queremos conocer las opciones de quienes no toman alcohol.';
    identityMode = 'anonymous';
    seeds = [
      [
        'Cuando vas a una fiesta, ¿qué prefieres tomar?',
        'choice',
        [
          'Agua natural o mineral',
          'Refresco o jugo',
          'Cerveza',
          'Vino',
          'Cócteles o bebidas preparadas',
          'Otra',
        ],
      ],
      [
        '¿Qué es lo más importante para ti al elegir una bebida?',
        'choice',
        [
          'Que me guste su sabor',
          'Su precio',
          'Que no tenga alcohol',
          'Que esté disponible',
          'Probar algo nuevo',
          'Otra',
        ],
      ],
      [
        'En una fiesta, ¿con qué frecuencia eliges bebidas sin alcohol?',
        'choice',
        ['Siempre', 'Casi siempre', 'A veces', 'Casi nunca', 'Nunca'],
      ],
      [
        '¿Qué te gusta más al elegir qué tomar?',
        'choice',
        [
          'Pedir mi bebida de siempre',
          'Probar una bebida nueva',
          'Elegir según la ocasión',
          'No tengo una preferencia',
        ],
      ],
      ['¿Qué bebida te gustaría que hubiera en la próxima fiesta?', 'text', []],
      [
        '¿Dónde prefieres conseguir lo que vas a tomar?',
        'choice',
        [
          'Lo llevo de casa',
          'Lo compro en la fiesta',
          'Lo ofrece quien organiza',
          'Depende de la ocasión',
        ],
      ],
      [
        '¿Qué opciones sin alcohol te gustaría encontrar?',
        'multi',
        [
          'Agua natural',
          'Agua mineral',
          'Jugos',
          'Refrescos',
          'Cócteles sin alcohol',
          'Otra',
        ],
      ],
      ['¿Qué podríamos mejorar en las bebidas que se ofrecen?', 'text', []],
    ];
  } else if (beverages) {
    title = 'Preferencias y consumo de bebidas';
    description =
      'Consulta breve para conocer qué bebidas prefieren las personas, cómo las consumen y qué influye en su elección.';
    identityMode = 'anonymous';
    seeds = [
      [
        '¿Qué tipos de bebidas consumes con mayor frecuencia?',
        'multi',
        [
          'Agua natural',
          'Agua mineral',
          'Refrescos',
          'Jugos o néctares',
          'Café',
          'Té o infusiones',
          'Bebidas energéticas',
          'Bebidas deportivas',
          'Bebidas lácteas',
          'Bebidas alcohólicas',
          'Otra',
        ],
      ],
      [
        '¿Cuál bebida prefieres para acompañar tus alimentos?',
        'choice',
        [
          'Agua natural',
          'Agua de sabor',
          'Refresco',
          'Jugo',
          'Café o té',
          'Cerveza u otra bebida alcohólica',
          'Ninguna',
          'Otra',
        ],
      ],
      [
        '¿Con qué frecuencia compras bebidas preparadas o envasadas?',
        'choice',
        [
          'Todos los días',
          'Varias veces por semana',
          'Una vez por semana',
          'Varias veces al mes',
          'Casi nunca',
        ],
      ],
      [
        '¿Qué presentación compras con mayor frecuencia?',
        'choice',
        [
          'Vaso o taza individual',
          'Botella pequeña',
          'Botella grande',
          'Lata',
          'Envase familiar',
          'Preparada al momento',
          'Otra',
        ],
      ],
      [
        '¿Qué influye más cuando eliges una bebida?',
        'multi',
        [
          'Sabor',
          'Precio',
          'Marca',
          'Ingredientes',
          'Cantidad de azúcar',
          'Temperatura',
          'Tamaño',
          'Promoción',
          'Disponibilidad',
          'Otra',
        ],
      ],
      [
        '¿Qué sabores prefieres?',
        'multi',
        [
          'Natural o sin sabor',
          'Cítricos',
          'Frutas tropicales',
          'Frutos rojos',
          'Cola',
          'Café',
          'Chocolate',
          'Hierbas o especias',
          'Otro',
        ],
      ],
      [
        '¿Qué tan satisfecho estás con la variedad de bebidas disponibles?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      [
        '¿Qué bebida te gustaría encontrar y actualmente no está disponible?',
        'text',
        [],
      ],
    ];
  } else if (referent) {
    title = 'Conocimiento y percepción general';
    description =
      'Consulta neutral para conocer qué información recuerda la comunidad y cuáles son sus prioridades.';
    identityMode = 'anonymous';
    seeds = [
      [
        '¿Conoces o has escuchado hablar de esta persona?',
        'yesno',
        ['Sí', 'No'],
      ],
      [
        '¿Has visto alguna actividad o trabajo realizado por esta persona?',
        'choice',
        ['Sí', 'No', 'No estoy seguro'],
      ],
      [
        '¿En qué temas recuerdas haber visto su trabajo o participación?',
        'multi',
        [
          'Servicios públicos',
          'Seguridad',
          'Salud',
          'Educación',
          'Economía y empleo',
          'Comunidad',
          'Otro',
        ],
      ],
      [
        '¿Qué tan clara es la información que has recibido sobre su trabajo?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      [
        '¿Por qué medios has recibido información sobre esta persona?',
        'multi',
        [
          'Redes sociales',
          'WhatsApp',
          'Noticias',
          'Eventos o reuniones',
          'Personas conocidas',
          'Otro',
        ],
      ],
      [
        '¿Qué tema debería atender o conocer mejor?',
        'choice',
        [
          'Seguridad',
          'Servicios públicos',
          'Salud',
          'Educación',
          'Empleo',
          'Movilidad',
          'Otro',
        ],
      ],
      ['¿Qué necesidad de tu comunidad te gustaría que conociera?', 'text', []],
      [
        '¿Deseas agregar un comentario sobre su trabajo o participación?',
        'text',
        [],
      ],
    ];
  } else if (community) {
    title = 'Necesidades de nuestra comunidad';
    description =
      'Consulta breve para identificar las necesidades y propuestas más importantes de la colonia.';
    seeds = [
      [
        '¿Cuál es la necesidad que debería atenderse primero en tu zona?',
        'choice',
        ['Seguridad', 'Agua', 'Alumbrado', 'Calles', 'Limpieza', 'Otra'],
      ],
      [
        '¿Cómo calificas los servicios públicos de tu zona?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      [
        '¿Qué problema afecta con mayor frecuencia a tu comunidad?',
        'choice',
        [
          'Seguridad',
          'Servicios',
          'Movilidad',
          'Empleo',
          'Espacios públicos',
          'Otro',
        ],
      ],
      [
        '¿Qué servicio necesita una mejora más urgente?',
        'choice',
        ['Agua', 'Alumbrado', 'Calles', 'Recolección', 'Transporte', 'Otro'],
      ],
      [
        '¿Qué tan segura consideras tu zona?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      [
        '¿Qué acción tendría mayor impacto para mejorar tu comunidad?',
        'text',
        [],
      ],
      [
        '¿Participarías en actividades para mejorar tu colonia?',
        'yesno',
        ['Sí', 'No'],
      ],
      ['¿Qué otra propuesta o necesidad deseas compartir?', 'text', []],
    ];
  } else if (staff) {
    title = 'Experiencia y necesidades del personal';
    description =
      'Consulta confidencial para detectar necesidades y oportunidades de mejora en el trabajo.';
    identityMode = 'anonymous';
    seeds = [
      [
        '¿Cómo calificas tu experiencia general en el trabajo?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      [
        '¿Cuentas con las herramientas necesarias para realizar tu trabajo?',
        'yesno',
        ['Sí', 'No'],
      ],
      [
        '¿Cómo calificas la comunicación dentro de tu área?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      [
        '¿Recibes instrucciones claras para realizar tus actividades?',
        'yesno',
        ['Sí', 'No'],
      ],
      [
        '¿Qué aspecto debería mejorar primero?',
        'choice',
        [
          'Comunicación',
          'Herramientas',
          'Carga de trabajo',
          'Capacitación',
          'Organización',
          'Otro',
        ],
      ],
      [
        '¿Consideras que tus opiniones son tomadas en cuenta?',
        'yesno',
        ['Sí', 'No'],
      ],
      ['¿Qué capacitación te sería más útil?', 'text', []],
      ['¿Qué cambiarías para mejorar tu trabajo diario?', 'text', []],
    ];
  } else if (education) {
    title = 'Experiencia educativa';
    description =
      'Consulta breve para conocer avances, dificultades y mejoras posibles en la experiencia escolar.';
    seeds = [
      [
        '¿Cómo calificas tu experiencia general en la escuela?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      [
        '¿Las explicaciones en clase te resultan claras?',
        'yesno',
        ['Sí', 'No'],
      ],
      [
        '¿En qué área necesitas más apoyo?',
        'choice',
        [
          'Lectura',
          'Matemáticas',
          'Ciencias',
          'Tecnología',
          'Convivencia',
          'Otra',
        ],
      ],
      [
        '¿Qué actividad te ayuda más a aprender?',
        'multi',
        [
          'Ejemplos',
          'Prácticas',
          'Videos',
          'Trabajo en equipo',
          'Juegos',
          'Otra',
        ],
      ],
      ['¿Cuentas con los materiales necesarios?', 'yesno', ['Sí', 'No']],
      [
        '¿Cómo calificas la comunicación con la escuela?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      ['¿Qué debería mejorar primero?', 'text', []],
      ['¿Deseas compartir otra propuesta?', 'text', []],
    ];
  } else if (health) {
    title = 'Experiencia de atención';
    description =
      'Consulta confidencial sobre la atención recibida y las oportunidades de mejora.';
    identityMode = 'anonymous';
    seeds = [
      [
        '¿Cómo calificas la atención recibida?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      ['¿La información proporcionada fue clara?', 'yesno', ['Sí', 'No']],
      ['¿Sentiste que escucharon tus necesidades?', 'yesno', ['Sí', 'No']],
      [
        '¿Cómo calificas el tiempo de espera?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      [
        '¿Qué aspecto debería mejorar primero?',
        'choice',
        [
          'Información',
          'Tiempo de espera',
          'Trato',
          'Instalaciones',
          'Seguimiento',
          'Otro',
        ],
      ],
      ['¿Recomendarías el servicio?', 'yesno', ['Sí', 'No']],
      ['¿Qué fue lo más útil de la atención?', 'text', []],
      ['¿Deseas agregar una sugerencia?', 'text', []],
    ];
  } else if (customer) {
    title = 'Encuesta de satisfacción';
    description =
      'Consulta breve para conocer qué valoran los clientes y qué podemos mejorar.';
    seeds = [
      [
        '¿Cómo calificas tu experiencia general?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      [
        '¿Cómo calificas la atención recibida?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      ['¿Encontraste lo que necesitabas?', 'yesno', ['Sí', 'No']],
      [
        '¿Cómo calificas la relación calidad-precio?',
        'rating',
        ['1', '2', '3', '4', '5'],
      ],
      ['¿Qué fue lo que más te gustó?', 'text', []],
      ['¿Qué deberíamos mejorar primero?', 'text', []],
      ['¿Volverías a utilizar nuestro servicio?', 'yesno', ['Sí', 'No']],
      ['¿Qué producto o servicio te gustaría que agregáramos?', 'text', []],
    ];
  } else {
    const topic = genericTopic(request);
    title = `Encuesta sobre ${topic}`.slice(0, 180);
    description = `Consulta breve para conocer experiencias, necesidades y propuestas relacionadas con ${topic}.`;
    identityMode = 'anonymous';
    seeds = [
      [
        '¿Qué tan familiar te resulta este tema?',
        'choice',
        [
          'Lo conozco o utilizo frecuentemente',
          'Lo conozco o utilizo algunas veces',
          'Lo conozco poco',
          'No lo conocía',
          'Otra',
        ],
      ],
      [
        '¿Con qué frecuencia forma parte de tu día a día?',
        'choice',
        [
          'Todos los días',
          'Varias veces por semana',
          'Una vez por semana',
          'Algunas veces al mes',
          'Casi nunca',
          'Nunca',
        ],
      ],
      [
        `¿Cómo calificas tu experiencia general con ${topic}?`,
        'rating',
        [
          '1 · Muy mala',
          '2 · Mala',
          '3 · Regular',
          '4 · Buena',
          '5 · Excelente',
        ],
      ],
      [
        `¿Qué aspectos de ${topic} son más importantes para ti?`,
        'multi',
        [
          'Calidad',
          'Facilidad',
          'Precio o costo',
          'Disponibilidad',
          'Información clara',
          'Atención o apoyo',
          'Otro',
        ],
      ],
      [
        '¿Qué dificultades has encontrado?',
        'multi',
        [
          'Falta de información',
          'Es difícil de usar o realizar',
          'Costo elevado',
          'Poca disponibilidad',
          'Mala atención',
          'Ninguna',
          'Otra',
        ],
      ],
      [
        `¿La información que recibes sobre ${topic} es clara?`,
        'choice',
        [
          'Sí, completamente',
          'En su mayoría',
          'Poco',
          'Nada',
          'No he recibido información',
        ],
      ],
      [`¿Qué beneficio esperas principalmente de ${topic}?`, 'text', []],
      [`¿Qué debería mejorarse primero en ${topic}?`, 'text', []],
      [
        `¿Recomendarías ${topic} a otra persona?`,
        'choice',
        ['Sí', 'Tal vez', 'No', 'No aplica'],
      ],
      [
        `¿Qué opción o alternativa relacionada con ${topic} prefieres?`,
        'text',
        [],
      ],
      [`¿Qué hace falta actualmente en ${topic}?`, 'text', []],
      ['¿Deseas agregar otra opinión o propuesta?', 'text', []],
    ];
  }

  const requested = parseSurveyRequestRequirements(request);
  const desiredCount = requested.count ?? Math.min(8, seeds.length);

  if (desiredCount > seeds.length) {
    const topic = genericTopic(request);
    const extraSeeds: QuestionSeed[] = [
      [
        `¿Qué tan importante es para ti mejorar lo relacionado con ${topic}?`,
        'rating',
        ['1 · Nada importante', '2', '3', '4', '5 · Muy importante'],
      ],
      [
        `¿Has tenido una experiencia reciente relacionada con ${topic}?`,
        'yesno',
        ['Sí', 'No'],
      ],
      [
        `¿Qué factor influye más en tu experiencia con ${topic}?`,
        'choice',
        ['Calidad', 'Facilidad', 'Costo', 'Información', 'Atención', 'Otra'],
      ],
      [
        `¿Qué factores deberían priorizarse en ${topic}?`,
        'multi',
        ['Calidad', 'Acceso', 'Información', 'Atención', 'Seguimiento', 'Otro'],
      ],
      [`¿Qué cambio concreto propondrías para ${topic}?`, 'text', []],
      [
        `¿La información disponible sobre ${topic} es suficiente?`,
        'yesno',
        ['Sí', 'No'],
      ],
      [
        `¿Cómo evaluarías la facilidad de acceso o uso relacionada con ${topic}?`,
        'rating',
        ['1 · Muy difícil', '2', '3', '4', '5 · Muy fácil'],
      ],
      [`¿Qué otra necesidad sobre ${topic} no hemos mencionado?`, 'text', []],
      [
        `¿Qué tan urgente consideras atender mejoras relacionadas con ${topic}?`,
        'rating',
        ['1 · Nada urgente', '2', '3', '4', '5 · Muy urgente'],
      ],
      [
        `¿Conoces dónde pedir apoyo o información sobre ${topic}?`,
        'yesno',
        ['Sí', 'No'],
      ],
      [
        `¿Por qué medio prefieres recibir información sobre ${topic}?`,
        'choice',
        [
          'WhatsApp',
          'Correo',
          'Sitio web',
          'Redes sociales',
          'Atención presencial',
          'Otro',
        ],
      ],
      [`¿Hay algo más que debamos considerar sobre ${topic}?`, 'text', []],
    ];

    for (const extra of extraSeeds) {
      if (seeds.length >= desiredCount || seeds.length >= 20) break;
      seeds.push(extra);
    }
  }

  const requirements = requested;
  const count = requestedCount(request, seeds.length);
  const selectedSeeds: QuestionSeed[] = [];
  const remaining = [...seeds];

  const takeType = (
    requestedType: SurveySuggestionQuestion['type'],
    amount: number,
  ) => {
    for (
      let index = 0;
      index < amount && selectedSeeds.length < count;
      index += 1
    ) {
      const matchingIndex = remaining.findIndex(
        ([, type]) => type === requestedType,
      );
      const seedIndex = matchingIndex >= 0 ? matchingIndex : 0;
      const seed = remaining.splice(seedIndex, 1)[0];
      if (!seed) break;

      const [prompt, , originalOptions] = seed;
      let options = originalOptions;
      if (requestedType === 'yesno') options = ['Sí', 'No'];
      if (requestedType === 'text') options = [];
      if (requestedType === 'rating') {
        options = [
          '1 · Muy malo o muy poco',
          '2',
          '3',
          '4',
          '5 · Excelente o mucho',
        ];
      }
      if (['choice', 'multi'].includes(requestedType) && options.length < 2) {
        options = ['Sí', 'No', 'No estoy seguro', 'Otra'];
      }

      selectedSeeds.push([prompt, requestedType, options]);
    }
  };

  for (const [type, amount] of Object.entries(requirements.typeCounts)) {
    if (amount) {
      takeType(type as SurveySuggestionQuestion['type'], amount);
    }
  }

  while (selectedSeeds.length < count && remaining.length) {
    selectedSeeds.push(remaining.shift() as QuestionSeed);
  }

  const questions = selectedSeeds.map(([prompt, type, options]) => ({
    prompt,
    type,
    options,
    required: true,
    publicAggregate: type !== 'text',
  }));

  return {
    title,
    description,
    identityMode,
    questions,
    note: 'Preparé una propuesta editable. Revísala antes de publicar para conservar solamente lo que realmente necesitas.',
    mode: 'local',
  };
}

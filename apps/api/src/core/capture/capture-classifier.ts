export type CaptureSpace = {
  id: string;
  name: string;
  type: string;
  timezone?: string;
};

export type CaptureHistoryItem = {
  title: string;
  category: string | null;
  spaceId: string | null;
};

export type CaptureConfidence = 'high' | 'medium' | 'low';

export type CaptureClassification = {
  title: string;
  category: string;
  requestedSpaceType: string | null;
  confidence: CaptureConfidence;
  confidenceScore: number;
  reasons: string[];
  sensitive: boolean;
  privacyWarning: string | null;
  destinationWarning: string | null;
  needsSpaceConfirmation: boolean;
  suggestedSpace: CaptureSpace;
  alternatives: Array<
    CaptureSpace & {
      score: number;
    }
  >;
};

type Candidate = {
  space: CaptureSpace;
  score: number;
  reasons: Set<string>;
};

const stopWords = new Set([
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

const spaceTypeNames: Record<string, string> = {
  personal: 'tu vida personal',
  family: 'familia',
  business: 'negocio',
  school: 'escuela',
};

const spaceSignals: Record<string, string[]> = {
  family: [
    'familia',
    'casa',
    'hogar',
    'despensa',
    'esposo',
    'esposa',
    'nuestro',
    'nuestra',
  ],
  business: [
    'negocio',
    'tienda',
    'local',
    'cliente',
    'proveedor',
    'inventario',
    'stock',
    'venta',
    'pedido',
    'factura',
    'empleado',
    'abarrotes',
    'servidor',
    'terminal',
    'sistema',
  ],
  school: [
    'escuela',
    'clase',
    'alumno',
    'alumna',
    'maestro',
    'maestra',
    'profesor',
    'profesora',
    'examen',
    'colegiatura',
    'padres de familia',
    'tarea escolar',
  ],
  personal: [
    'personal',
    'doctor',
    'medico',
    'dentista',
    'terapia',
    'salud',
    'coche',
    'vehiculo',
    'gimnasio',
    'amigo',
    'cumpleanos',
  ],
};

const explicitTypeSignals: Record<string, string[]> = {
  family: [
    'en familia',
    'para la familia',
    'de la familia',
    'para la casa',
    'en la casa',
  ],
  business: [
    'en el negocio',
    'para el negocio',
    'del negocio',
    'en la tienda',
    'para la tienda',
    'en el local',
    'para el local',
  ],
  school: [
    'en la escuela',
    'para la escuela',
    'de la escuela',
    'para la clase',
    'en la clase',
  ],
  personal: ['en personal', 'solo para mi', 'para mi espacio personal'],
};

const sensitiveSignals = [
  'alumno',
  'alumna',
  'banco',
  'contrasena',
  'deuda',
  'diagnostico',
  'doctor',
  'medicina',
  'medico',
  'menor',
  'nina',
  'nino',
  'padre de familia',
  'pago',
  'salud',
  'terapia',
];

const categorySignals: Array<{
  category: string;
  keywords: string[];
}> = [
  {
    category: 'payment',
    keywords: [
      'pagar',
      'pago',
      'recibo',
      'luz',
      'agua',
      'renta',
      'colegiatura',
    ],
  },
  {
    category: 'purchase',
    keywords: [
      'comprar',
      'compra',
      'pedido',
      'proveedor',
      'surtir',
      'despensa',
      'inventario',
    ],
  },
  {
    category: 'school',
    keywords: [
      'alumno',
      'alumna',
      'clase',
      'escuela',
      'examen',
      'maestro',
      'profesor',
      'tarea escolar',
    ],
  },
  {
    category: 'vehicle',
    keywords: [
      'coche',
      'vehiculo',
      'llantas',
      'mantenimiento',
      'taller',
    ],
  },
  {
    category: 'health',
    keywords: [
      'doctor',
      'medico',
      'dentista',
      'medicina',
      'salud',
      'terapia',
    ],
  },
  {
    category: 'business',
    keywords: ['cliente', 'empleado', 'negocio', 'stock', 'venta'],
  },
  {
    category: 'family',
    keywords: ['casa', 'esposa', 'esposo', 'familia', 'hogar'],
  },
];

export function normalizeCaptureText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(text: string, phrase: string) {
  const normalizedPhrase = normalizeCaptureText(phrase);
  return ` ${text} `.includes(` ${normalizedPhrase} `);
}

function meaningfulTokens(value: string) {
  return new Set(
    normalizeCaptureText(value)
      .split(' ')
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}

function similarity(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function inferCategory(
  normalizedMessage: string,
  requestedSpaceType: string | null,
) {
  if (requestedSpaceType === 'business') {
    return 'business';
  }

  for (const rule of categorySignals) {
    if (
      rule.keywords.some((keyword) =>
        containsPhrase(normalizedMessage, keyword),
      )
    ) {
      return rule.category;
    }
  }

  return 'personal';
}

function buildTaskTitle(message: string) {
  const withoutRouting = message
    .trim()
    .replace(
      /^(?:pon(?:lo|la)?|guarda(?:lo|la)?|agrega(?:lo|la)?)\s+en\s+[^:]{2,50}:\s*/i,
      '',
    )
    .replace(
      /^(?:recu[eé]rdame|recordarme|anota|agrega una tarea|tengo que|necesito)\s+/i,
      '',
    )
    .trim();
  const title = withoutRouting || message.trim();
  const shortened = title.slice(0, 150).trim();

  return shortened.charAt(0).toLocaleUpperCase('es-MX') + shortened.slice(1);
}

function addScore(candidate: Candidate, score: number, reason: string) {
  candidate.score += score;
  candidate.reasons.add(reason);
}

export function classifyCapture(input: {
  message: string;
  spaces: CaptureSpace[];
  activeSpaceId?: string;
  history?: CaptureHistoryItem[];
}): CaptureClassification {
  const message = input.message.trim();

  if (!message) {
    throw new Error('Escribe algo para que ORION pueda organizarlo');
  }

  if (input.spaces.length === 0) {
    throw new Error('Crea un espacio antes de organizar una tarea');
  }

  const normalizedMessage = normalizeCaptureText(message);
  const requestedSpaceType =
    Object.entries(explicitTypeSignals).find(([, signals]) =>
      signals.some((signal) => containsPhrase(normalizedMessage, signal)),
    )?.[0] ?? null;
  const messageTokens = meaningfulTokens(message);
  const activeSpace = input.spaces.find(
    (space) => space.id === input.activeSpaceId,
  );
  const candidates = input.spaces.map<Candidate>((space) => ({
    space,
    score: 0,
    reasons: new Set<string>(),
  }));
  let explicitDestination = false;

  for (const candidate of candidates) {
    const normalizedName = normalizeCaptureText(candidate.space.name);
    const explicitNamePatterns = [
      `en ${normalizedName}`,
      `para ${normalizedName}`,
      `ponlo en ${normalizedName}`,
      `ponla en ${normalizedName}`,
      `guarda en ${normalizedName}`,
    ];

    if (
      normalizedName.length >= 3 &&
      explicitNamePatterns.some((pattern) =>
        containsPhrase(normalizedMessage, pattern),
      )
    ) {
      addScore(
        candidate,
        100,
        `Indicaste directamente el espacio ${candidate.space.name}`,
      );
      explicitDestination = true;
    }

    const explicitSignals = explicitTypeSignals[candidate.space.type] ?? [];

    if (
      explicitSignals.some((signal) =>
        containsPhrase(normalizedMessage, signal),
      )
    ) {
      addScore(
        candidate,
        70,
        `El mensaje parece corresponder a ${
          spaceTypeNames[candidate.space.type] ?? candidate.space.type
        }`,
      );
      explicitDestination = true;
    }

    const matchedSignals = (spaceSignals[candidate.space.type] ?? []).filter(
      (signal) => containsPhrase(normalizedMessage, signal),
    );

    if (matchedSignals.length > 0) {
      addScore(
        candidate,
        Math.min(matchedSignals.length * 18, 45),
        `Detectamos ${matchedSignals.slice(0, 2).join(' y ')}`,
      );
    }

    if (candidate.space.id === activeSpace?.id) {
      addScore(candidate, 6, `Estabas usando ${candidate.space.name}`);
    }
  }

  const historyScores = new Map<string, number>();

  for (const task of input.history ?? []) {
    if (!task.spaceId) {
      continue;
    }

    const taskSimilarity = similarity(
      messageTokens,
      meaningfulTokens(task.title),
    );

    if (taskSimilarity < 0.34) {
      continue;
    }

    historyScores.set(
      task.spaceId,
      Math.min(
        45,
        (historyScores.get(task.spaceId) ?? 0) +
          Math.round(taskSimilarity * 18),
      ),
    );
  }

  for (const candidate of candidates) {
    if (
      requestedSpaceType &&
      candidate.space.type !== requestedSpaceType
    ) {
      continue;
    }

    const historyScore = historyScores.get(candidate.space.id) ?? 0;

    if (historyScore > 0) {
      addScore(
        candidate,
        historyScore,
        'Se parece a tareas que colocaste aquí anteriormente',
      );
    }
  }

  const hasSignal = candidates.some((candidate) => candidate.score > 6);
  const missingRequestedSpace = Boolean(
    requestedSpaceType &&
      !candidates.some(
        (candidate) => candidate.space.type === requestedSpaceType,
      ),
  );

  if (!hasSignal) {
    const privateCandidate =
      candidates.find(
        (candidate) =>
          candidate.space.type === 'personal' &&
          candidate.space.id === activeSpace?.id,
      ) ?? candidates.find((candidate) => candidate.space.type === 'personal');

    if (privateCandidate) {
      addScore(
        privateCandidate,
        missingRequestedSpace ? 12 : 8,
        missingRequestedSpace
          ? `Aún no existe un espacio de ${
              spaceTypeNames[requestedSpaceType ?? ''] ?? requestedSpaceType
            }; ORION propone mantenerla privada`
          : 'Ante la duda, ORION propone mantenerla privada',
      );
    }
  }

  const ranked = [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (left.space.id === activeSpace?.id) {
      return -1;
    }

    if (right.space.id === activeSpace?.id) {
      return 1;
    }

    return left.space.name.localeCompare(right.space.name, 'es-MX');
  });
  const winner = ranked[0];
  const runnerUpScore = ranked[1]?.score ?? 0;
  const gap = winner.score - runnerUpScore;
  const confidence: CaptureConfidence =
    explicitDestination && gap >= 20
      ? 'high'
      : winner.score >= 36 && gap >= 12
        ? 'high'
        : winner.score >= 18 && gap >= 6
          ? 'medium'
          : 'low';
  const sensitive = sensitiveSignals.some((signal) =>
    containsPhrase(normalizedMessage, signal),
  );
  const privacyWarning =
    sensitive && winner.space.type !== 'personal'
      ? 'Esta tarea puede contener información sensible. Confirma quién podrá verla antes de guardarla.'
      : null;
  const destinationWarning = missingRequestedSpace
    ? `Detecté que esta tarea pertenece a ${
        spaceTypeNames[requestedSpaceType ?? ''] ?? requestedSpaceType
      }, pero todavía no tienes un espacio de ese tipo. Si la guardas aquí seguirá privada.`
    : null;

  return {
    title: buildTaskTitle(message),
    category: inferCategory(normalizedMessage, requestedSpaceType),
    requestedSpaceType,
    confidence,
    confidenceScore: Math.min(100, Math.max(0, winner.score)),
    reasons: [...winner.reasons].slice(0, 3),
    sensitive,
    privacyWarning,
    destinationWarning,
    needsSpaceConfirmation:
      confidence !== 'high' ||
      Boolean(privacyWarning) ||
      Boolean(destinationWarning),
    suggestedSpace: winner.space,
    alternatives: ranked.slice(0, 4).map((candidate) => ({
      ...candidate.space,
      score: Math.min(100, Math.max(0, candidate.score)),
    })),
  };
}

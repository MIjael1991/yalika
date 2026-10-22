export type PresenteStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'WITHDRAWN';

export type PresenteProvider = {
  id: string;
  displayName: string;
  bio: string | null;
  trades: string[];
  zoneLabel: string | null;
  municipalityCode: string | null;
  municipalityName: string | null;
  radiusKm: number;
  availability: Availability | null;
  curpMasked: string | null;
  status: PresenteStatus;
  reviewNote: string | null;
  consentGiven: boolean;
  documents: string[];
  missing: string[];
  presence: 'PRESENT' | 'ABSENT';
  lastSeenAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  isBusiness: boolean;
  businessName: string | null;
  delivers: boolean;
  teaches: boolean;
  /** Da factura (CFDI). */
  invoices: boolean;
  /** Lo que descuenta Yalika por trabajo terminado. */
  commissionPct: number;
  /** Su código: para recargar y para recomendar a otros. */
  referralCode: string;
  /** Llegó recomendado por alguien. */
  referred: boolean;
  /** Se dio de baja (su registro se guarda para volver). */
  withdrawnAt: string | null;
  /** Cédulas profesionales mandadas (ingeniería, contaduría, leyes...). */
  credentials: ProCredential[];
  /** Revalidar identidad cada cierto tiempo con una selfie nueva. */
  identityCheck: { state: 'OK' | 'DUE' | 'OVERDUE' | 'PENDING'; dueAt: string; blockAt: string } | null;
};

export type ProCredential = {
  trade: string;
  licenseNumber: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  /** Comprobante de la SEP: falta, en revisión o visible para los clientes. */
  sepProof: 'MISSING' | 'PENDING' | 'VERIFIED';
};

/** Consulta de cédulas de la SEP (por nombre o número). */
export const SEP_LOOKUP_URL = 'https://cedulaprofesional.sep.gob.mx/';
/** Constancia de Situación Profesional: gratis, en PDF con código QR. */
export const SEP_CERTIFICATE_URL = 'https://www.gob.mx/cedulaprofesional';
const SEP_PROOF_MAX_BYTES = 3_000_000;

/** Comprobante de la SEP: el PDF tal cual (máximo 3 MB) o la captura como foto. */
export async function sepProofToDataUrl(file: File) {
  if (file.type === 'application/pdf') {
    if (file.size > SEP_PROOF_MAX_BYTES) throw new Error('El PDF pesa más de 3 MB.');
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('No se pudo leer el PDF.'));
      reader.readAsDataURL(file);
    });
  }
  if (!file.type.startsWith('image/')) throw new Error('Sube el PDF de la SEP o una foto de la consulta.');
  return photoToDataUrl(file);
}

export type HistoryItem = {
  at: string;
  action: string;
  label: string;
  changed: string[];
  trade: string | null;
  note: string | null;
  byYalika: boolean;
};

/** Cuántos verificados hay por servicio cerca (y cuántos están Presentes ahora). */
export type TradeActivity = Record<string, { verified: number; present: number }>;

export type PendingCredential = {
  id: string;
  providerId: string;
  displayName: string;
  providerStatus: string;
  trade: string;
  licenseNumber: string;
  submittedAt: string;
  /** CREDENTIAL: cédula completa; SEP_PROOF: solo su comprobante nuevo. */
  kind: 'CREDENTIAL' | 'SEP_PROOF';
  sepProofMime: string | null;
  lookupUrl: string;
  certificateUrl: string;
};

export type PendingRecheck = {
  providerId: string;
  displayName: string;
  trades: string[];
  sentAt: string;
  lastCheckedAt: string | null;
};

/** Nombres de los datos que cambian, para el historial. */
const changedLabels: Record<string, string> = {
  displayName: 'nombre',
  bio: 'descripción',
  zoneLabel: 'colonia',
  municipalityCode: 'municipio',
  radiusKm: 'distancia',
  isBusiness: 'negocio',
  businessName: 'nombre del negocio',
  delivers: 'entrega a domicilio',
  teaches: 'clases',
  trades: 'lo que sabes hacer',
  availability: 'días y horario',
};
export const changedLabel = (field: string) => changedLabels[field] ?? field;

/** ¿Hay gente con esto cerca? 'live' = alguien Presente ahora; 'some' = verificados; 'none'. */
export function tradeLevel(activity: TradeActivity | null, key: string) {
  const row = activity?.[key];
  if (!row?.verified) return 'none' as const;
  return row.present ? ('live' as const) : ('some' as const);
}

/** Reglas del programa para quien se registra. */
export type PresenteProgram = {
  /** Comisión normal. */
  commissionPct: number;
  /** Comisión de fundador mientras le dura el regalo. */
  promoCommissionPct: number;
  minPriceMxn: number;
  welcome: { creditMxn: number; limit: number; left: number };
  referralFreeMaxMxn: number;
};

export type PresentePending = {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  trades: string[];
  zoneLabel: string | null;
  municipalityName: string | null;
  availability: Availability | null;
  curp: string | null;
  age: number | null;
  documents: string[];
  submittedAt: string | null;
};

export type PresenteProfileInput = {
  displayName: string;
  trades: string[];
  municipalityCode: string;
  zoneLabel?: string;
  bio?: string;
  radiusKm?: number;
  availableDays: number[];
  allDay: boolean;
  fromTime?: string;
  toTime?: string;
  curp?: string;
  referralCode?: string;
  isBusiness?: boolean;
  businessName?: string;
  delivers?: boolean;
  teaches?: boolean;
  invoices?: boolean;
};

/**
 * 'cedula': cédula verificada en Salud (médicos, enfermería, veterinaria).
 * 'titulo': título o cédula y selfie con ella en mano, revisados por Yalika.
 * 'pronto': todavía no se puede elegir.
 */
export type TradeRequirement = 'cedula' | 'titulo' | 'pronto';

/** Secciones del inicio: cada tipo de servicio va en su lugar y no se revuelven. */
export type TradeGroup = 'profesional' | 'casa' | 'carro' | 'tecnologia' | 'personal' | 'otros';

export const tradeGroups: readonly {
  key: TradeGroup;
  label: string;
  hint: string;
  icon: string;
}[] = [
  { key: 'profesional', label: 'Profesionales', hint: 'Médicos, enfermería, veterinaria, ingeniería, contaduría, arquitectura y más, con cédula verificada.', icon: 'profesionales' },
  { key: 'casa', label: 'Para tu casa', hint: 'Cerrajero, plomería, electricidad, arreglos, agua y mandados.', icon: 'hogar' },
  { key: 'carro', label: 'Tu carro', hint: 'Vulcanizadora, grúa, batería, mecánico.', icon: 'carro' },
  { key: 'tecnologia', label: 'Tecnología', hint: 'Celulares, computadoras, sistemas y páginas web.', icon: 'tecnologia' },
  { key: 'otros', label: 'Otra cosa', hint: '¿No está en la lista? Pídelo con tus palabras.', icon: 'otros' },
  { key: 'personal', label: 'Para ti y tu familia', hint: 'Cuidados, belleza, clases, comida hecha en casa y fiestas.', icon: 'cuidados' },
];

export type TradeCategory = {
  key: string;
  group: TradeGroup;
  label: string;
  hint: string;
  trades: readonly (readonly [string, string, TradeRequirement?])[];
};

// Mismas claves y orden que PRESENTE_TRADES del API (lo revisa una prueba).
export const tradeCategories: readonly TradeCategory[] = [
  {
    key: 'salud',
    group: 'profesional',
    label: 'Salud',
    hint: 'Médicos, enfermería, veterinaria, psicología y más',
    trades: [
      ['MEDICO', 'Médico a domicilio', 'cedula'],
      ['ENFERMERIA', 'Enfermería', 'cedula'],
      ['VETERINARIO', 'Veterinario a domicilio', 'cedula'],
      ['PSICOLOGIA', 'Psicología', 'titulo'],
      ['NUTRICION', 'Nutrición', 'titulo'],
      ['FISIOTERAPIA', 'Fisioterapia y rehabilitación', 'titulo'],
      ['TRASLADO_AMBULANCIA', 'Traslado en ambulancia (no urgente)', 'pronto'],
    ],
  },
  {
    key: 'profesionales',
    group: 'profesional',
    label: 'Ingeniería, leyes y cuentas',
    hint: 'Ingenieros, arquitectos, abogados y contadores',
    trades: [
      ['ABOGADO', 'Abogado', 'titulo'],
      ['CONTADOR', 'Contador', 'titulo'],
      ['ARQUITECTURA', 'Arquitectura', 'titulo'],
      ['INGENIERIA_CIVIL', 'Ingeniería civil', 'titulo'],
      ['INGENIERIA_ELECTRICA', 'Ingeniería eléctrica', 'titulo'],
      ['INGENIERIA_INDUSTRIAL', 'Ingeniería industrial', 'titulo'],
      ['INGENIERIA_MECANICA', 'Ingeniería mecánica', 'titulo'],
    ],
  },
  {
    key: 'hogar',
    group: 'casa',
    label: 'Arreglos en casa',
    hint: 'Cerrajero, plomería, electricidad, albañilería',
    trades: [
      ['CERRAJERIA', 'Cerrajería'],
      ['PLOMERIA', 'Plomería'],
      ['ELECTRICIDAD', 'Electricidad'],
      ['DESTAPE_DRENAJE', 'Destape de drenaje'],
      ['ALBANILERIA', 'Albañilería: arreglos y resanes'],
      ['PINTURA', 'Pintura'],
      ['HERRERIA', 'Herrería'],
      ['CARPINTERIA', 'Carpintería'],
      ['VIDRIOS_ALUMINIO', 'Vidrios y aluminio'],
      ['TAPICERIA', 'Tapicería'],
      ['IMPERMEABILIZACION', 'Impermeabilización'],
      ['REFRIGERACION', 'Refrigeración y aire'],
      ['LINEA_BLANCA', 'Reparación de lavadoras y refris'],
      ['CAMARAS_SEGURIDAD', 'Cámaras de seguridad y alarmas'],
      ['FUMIGACION', 'Fumigación'],
      ['JARDINERIA', 'Jardinería'],
      ['LIMPIEZA', 'Limpieza'],
    ],
  },
  {
    key: 'mandados',
    group: 'casa',
    label: 'Agua, fletes y mandados',
    hint: 'Pipa de agua, mudanzas, mandados, ayudante',
    trades: [
      ['PIPA_AGUA', 'Pipa de agua'],
      ['FLETES', 'Fletes y mudanzas'],
      ['MANDADOS', 'Mandados y compras'],
      ['AYUDANTE', 'Ayudante general'],
    ],
  },
  {
    key: 'carro',
    group: 'carro',
    label: 'Tu carro',
    hint: 'Vulcanizadora, grúa, batería, mecánico',
    trades: [
      ['LLANTAS', 'Llantas y vulcanizadora'],
      ['GRUA', 'Grúa'],
      ['BATERIA_AUTO', 'Batería y paso de corriente'],
      ['MECANICA', 'Mecánica'],
      ['ELECTRICO_AUTO', 'Eléctrico automotriz'],
      ['LAVADO_AUTO', 'Lavado de carro a domicilio'],
    ],
  },
  {
    key: 'tecnologia',
    group: 'tecnologia',
    label: 'Tecnología y sistemas',
    hint: 'Celulares, computadoras, programación, diseño',
    trades: [
      ['CELULARES', 'Reparación de celulares'],
      ['COMPUTADORAS', 'Computadoras e impresoras'],
      ['TV_INTERNET', 'Instalación de TV e internet'],
      ['PROGRAMACION', 'Programación de sistemas y páginas web'],
      ['DISENO_GRAFICO', 'Diseño gráfico y publicidad'],
    ],
  },
  {
    key: 'cuidados',
    group: 'personal',
    label: 'Cuidados y mascotas',
    hint: 'Adultos mayores, paseo y baño de mascotas',
    trades: [
      ['CUIDADO_ADULTOS', 'Cuidado de adultos mayores'],
      ['PASEO_PERROS', 'Paseo de perros'],
      ['ESTETICA_CANINA', 'Baño y estética de mascotas'],
    ],
  },
  {
    key: 'belleza',
    group: 'personal',
    label: 'Belleza a domicilio',
    hint: 'Estilista, barbero, uñas, maquillaje',
    trades: [
      ['ESTILISTA', 'Estilista a domicilio'],
      ['BARBERO', 'Barbero a domicilio'],
      ['UNAS', 'Uñas a domicilio'],
      ['MAQUILLAJE', 'Maquillaje y peinado para eventos'],
    ],
  },
  {
    key: 'clases',
    group: 'personal',
    label: 'Clases y enseñanza',
    hint: 'Tareas, música, idiomas, computación, manejo',
    trades: [
      ['CLASES', 'Regularización y tareas'],
      ['CLASES_MUSICA', 'Clases de música'],
      ['CLASES_IDIOMAS', 'Clases de idiomas'],
      ['CLASES_COMPUTACION', 'Computación y programación'],
      ['CLASES_COCINA', 'Cocina y repostería'],
      ['CLASES_DEPORTE', 'Deporte y entrenamiento'],
      ['CLASES_ARTE', 'Dibujo, baile y manualidades'],
      ['CLASES_MANEJO', 'Clases de manejo'],
      ['CLASES_OFICIO', 'Aprender un oficio'],
    ],
  },
  {
    key: 'comida',
    group: 'personal',
    label: 'Comida y hecho a mano',
    hint: 'Pan, pasteles, comida casera, costura',
    trades: [
      ['PAN', 'Pan, pasteles y postres por encargo'],
      ['COMIDA_CASERA', 'Comida casera por encargo'],
      ['BANQUETES', 'Banquetes y taquizas'],
      ['COSTURA', 'Costura y arreglos de ropa'],
      ['ARTESANIAS', 'Artesanías y regalos hechos a mano'],
    ],
  },
  {
    key: 'eventos',
    group: 'personal',
    label: 'Fiestas y eventos',
    hint: 'Meseros, fotografía, música, decoración',
    trades: [
      ['MESEROS', 'Meseros'],
      ['FOTOGRAFIA', 'Fotografía y video'],
      ['MUSICA', 'Música para eventos'],
      ['DECORACION_EVENTOS', 'Decoración de fiestas'],
    ],
  },
  {
    key: 'otros',
    group: 'otros',
    label: 'Otra cosa',
    hint: '¿No está en la lista? Escríbelo con tus palabras',
    trades: [['OTRO', 'Otra cosa (descríbela)']],
  },
];

const allTrades = tradeCategories.flatMap((c) => c.trades);
export const tradeKeys = allTrades.map(([key]) => key);
/** Aún no disponible (pide cédula o permiso que todavía no verificamos). */
export const isPendingTrade = (key: string) =>
  allTrades.some(([k, , req]) => k === key && req === 'pronto');
/** Pide título o cédula con selfie, revisados por Yalika. */
export const needsTitle = (key: string) =>
  allTrades.some(([k, , req]) => k === key && req === 'titulo');
/** Pide cédula profesional verificada en Salud. */
export const needsLicense = (key: string) =>
  allTrades.some(([k, , req]) => k === key && req === 'cedula');

export const tradeLabel = (key: string) =>
  allTrades.find(([k]) => k === key)?.[1] ?? key;

/** Sin límite práctico: puede ofrecer todo lo que sabe hacer. */
export const MAX_TRADES = tradeKeys.length;

/** Otras palabras con las que la gente busca cada oficio (sin acentos, en minúsculas). */
const tradeKeywords: Record<string, string> = {
  CERRAJERIA: 'cerrajero llave chapa puerta abrir',
  LLANTAS: 'llanta ponchada vulcanizadora talachero refaccion',
  GRUA: 'arrastre remolque choque',
  BATERIA_AUTO: 'bateria corriente pasar carro no arranca',
  MECANICA: 'mecanico carro auto moto afinacion frenos',
  PLOMERIA: 'plomero fuga agua tuberia llave bano tinaco boiler',
  ELECTRICIDAD: 'electricista luz apagon contacto corto foco',
  DESTAPE_DRENAJE: 'drenaje tapado cano wc',
  ALBANILERIA: 'albanil resane arreglo piso loseta cuarteadura',
  PINTURA: 'pintor pintar casa fachada',
  HERRERIA: 'herrero soldadura reja porton protecciones',
  CARPINTERIA: 'carpintero mueble madera closet puerta',
  VIDRIOS_ALUMINIO: 'vidrio vidriero ventana cancel aluminio espejo cristal',
  TAPICERIA: 'tapicero sala sillon sofa tapizar asientos',
  IMPERMEABILIZACION: 'impermeabilizar goteras techo azotea',
  REFRIGERACION: 'aire acondicionado minisplit clima',
  LINEA_BLANCA: 'lavadora refrigerador refri estufa secadora',
  CAMARAS_SEGURIDAD: 'camaras seguridad alarma cctv videovigilancia sensor',
  FUMIGACION: 'plaga cucarachas chinches ratones termitas',
  JARDINERIA: 'jardinero pasto poda arboles',
  LIMPIEZA: 'aseo limpiar casa planchar trabajadora domestica',
  PIPA_AGUA: 'pipero agua tinaco cisterna',
  FLETES: 'mudanza camioneta cargar llevar',
  MANDADOS: 'compras encargo mandadero',
  AYUDANTE: 'chalan ayuda cargar',
  CELULARES: 'celular pantalla telefono',
  COMPUTADORAS: 'computadora laptop impresora virus',
  TV_INTERNET: 'tele television antena wifi modem',
  PROGRAMACION:
    'programacion programador sistemas sistema software desarrollo desarrollador pagina web app aplicacion base datos',
  DISENO_GRAFICO: 'diseno disenador logo publicidad lona volante tarjetas imprenta redes sociales',
  CUIDADO_ADULTOS: 'cuidador abuelito enfermo acompanante',
  PASEO_PERROS: 'perro pasear mascota',
  ESTETICA_CANINA: 'bano perro corte mascota',
  ESTILISTA: 'corte cabello tinte peinado',
  BARBERO: 'corte barba cabello',
  UNAS: 'manicure pedicure acrilicas',
  MAQUILLAJE: 'maquillista xv boda peinado',
  CLASES: 'maestro maestra tareas primaria secundaria matematicas regularizacion asesoria',
  CLASES_MUSICA: 'guitarra piano canto violin bateria teclado musica maestro de musica',
  CLASES_IDIOMAS: 'ingles frances idioma',
  CLASES_COMPUTACION: 'computacion excel word celular internet aprender programacion programar',
  CLASES_COCINA: 'cocina reposteria pasteles hornear',
  CLASES_DEPORTE: 'entrenador futbol box natacion gimnasio yoga',
  CLASES_ARTE: 'dibujo pintura baile danza manualidades',
  CLASES_MANEJO: 'manejo manejar conducir carro auto licencia',
  CLASES_OFICIO: 'aprender oficio taller curso aprendiz',
  PAN: 'pan panadero panadera panaderia pastel pasteles postre postres galletas bolillo reposteria repostero conchas',
  COMIDA_CASERA: 'comida guisados tamales pozole enchiladas encargo',
  BANQUETES: 'banquete taquiza carnitas fiesta comida para eventos',
  COSTURA: 'costurera modista dobladillo ropa coser',
  ARTESANIAS: 'artesania regalo manualidad tejido',
  MESEROS: 'mesero fiesta servicio',
  FOTOGRAFIA: 'fotografo video boda xv',
  MUSICA: 'banda mariachi dj musicos grupo',
  DECORACION_EVENTOS: 'globos decoracion fiesta mesa de dulces',
  MEDICO: 'doctor doctora medico medica consulta enfermo salud',
  PSICOLOGIA: 'psicologo psicologa terapia ansiedad depresion emocional salud',
  NUTRICION: 'nutriologo nutriologa nutricionista dieta alimentacion salud',
  FISIOTERAPIA: 'fisioterapeuta rehabilitacion terapia fisica lesion salud',
  TRASLADO_AMBULANCIA: 'ambulancia traslado',
  ABOGADO: 'abogada licenciado derecho legal demanda juicio divorcio testamento asesoria juridica',
  CONTADOR: 'contadora contaduria contabilidad impuestos sat declaracion facturas',
  ARQUITECTURA: 'arquitecto arquitecta planos proyecto remodelacion',
  INGENIERIA_CIVIL: 'ingeniero ingeniera ingenieria civil estructura estructural construccion',
  INGENIERIA_ELECTRICA: 'ingeniero ingeniera ingenieria electrica electrico subestacion transformador',
  INGENIERIA_INDUSTRIAL: 'ingeniero ingeniera ingenieria industrial procesos maquinaria fabrica',
  INGENIERIA_MECANICA: 'ingeniero ingeniera ingenieria mecanica maquinas motores',
  ELECTRICO_AUTO: 'electrico automotriz carro auto alternador marcha luces',
  LAVADO_AUTO: 'lavado lavar carro auto detallado',
  ENFERMERIA: 'enfermera enfermero inyeccion curacion suero salud',
  VETERINARIO: 'veterinaria veterinario mascota perro gato vacuna',
  OTRO: 'otro otra cosa',
};

const STOP_WORDS = new Set(['para', 'que', 'con', 'una', 'uno', 'los', 'las', 'del', 'mis', 'por']);

/** Quita acentos y mayúsculas para comparar lo que la persona escribe. */
export const plainText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Raíz de una palabra para relacionar formas parecidas:
 * "ingenieros", "ingeniera" e "ingeniería" → "ingenier"; "panadero" y "panadería" → "panader".
 */
export function wordRoot(word: string) {
  let w = plainText(word);
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ies')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('s')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ia')) return w.slice(0, -2);
  if (w.length > 4 && /[aeo]$/.test(w)) return w.slice(0, -1);
  return w;
}

/**
 * Busca oficios por nombre o por palabras relacionadas: "ingenieros" da todas las
 * ingenierías y "ingeniero industrial" solo la industrial; "panadero" da pan y postres.
 * Devuelve [clave, nombre, requisito] como en tradeCategories.
 */
export function searchTrades(query: string, { hidePending = false } = {}) {
  const words = plainText(query)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  if (!words.length) return [];
  const hits = allTrades
    .filter(([key, , req]) => key !== 'OTRO' && !(hidePending && req === 'pronto'))
    .map((trade) => {
      const tokens = plainText(`${trade[1]} ${tradeKeywords[trade[0]] ?? ''}`)
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      const roots = new Set(tokens.map(wordRoot));
      return {
        trade,
        // Palabra igual o de la misma raíz pesa más que solo el inicio ("plomer").
        exact: words.filter((word) => tokens.includes(word) || roots.has(wordRoot(word))).length,
        prefix: words.filter((word) => tokens.some((t) => t.startsWith(word))).length,
      };
    });
  // Lo que más coincide: si escribe "ingeniero industrial", solo la industrial.
  const best = Math.max(0, ...hits.map((hit) => hit.exact));
  return hits
    .filter((hit) => (best > 0 ? hit.exact === best : hit.prefix > 0))
    .sort((a, b) => b.prefix - a.prefix)
    .map((hit) => hit.trade);
}

// ---------- Días y horario ----------
export type Availability = {
  days: number[];
  allDay: boolean;
  from: string | null;
  to: string | null;
};

export const dayOptions = [
  [1, 'Lun', 'lunes'],
  [2, 'Mar', 'martes'],
  [3, 'Mié', 'miércoles'],
  [4, 'Jue', 'jueves'],
  [5, 'Vie', 'viernes'],
  [6, 'Sáb', 'sábado'],
  [7, 'Dom', 'domingo'],
] as const;

/** "Lunes a viernes, 8:00 a 20:00", "Todos los días, 24 horas", "Lun, Mié y Vie, 9:00 a 14:00". */
export function availabilityLabel(a: Availability | null | undefined) {
  if (!a || !a.days.length) return 'Sin horario';
  const days = [...a.days].sort((x, y) => x - y);
  const name = (d: number) => dayOptions.find(([n]) => n === d)?.[2] ?? '';
  const short = (d: number) => dayOptions.find(([n]) => n === d)?.[1] ?? '';
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  let dayText: string;
  if (days.length === 7) dayText = 'Todos los días';
  else if (consecutive && days.length >= 3) {
    const first = name(days[0]);
    dayText = `${first[0].toUpperCase()}${first.slice(1)} a ${name(days[days.length - 1])}`;
  } else if (days.length === 1) {
    const only = name(days[0]);
    dayText = `${only[0].toUpperCase()}${only.slice(1)}`;
  } else {
    const shorts = days.map(short);
    dayText = `${shorts.slice(0, -1).join(', ')} y ${shorts[shorts.length - 1]}`;
  }
  const clock = (t: string) => t.replace(/^0(\d)/, '$1');
  const hours = a.allDay || !a.from || !a.to ? '24 horas' : `${clock(a.from)} a ${clock(a.to)}`;
  return `${dayText}, ${hours}`;
}

export const documentOptions = [
  ['INE_FRONT', 'INE de frente', 'environment'],
  ['INE_BACK', 'INE por detrás', 'environment'],
  ['SELFIE', 'Tu cara (selfie)', 'user'],
] as const;

const missingLabels: Record<string, string> = {
  NAME: 'Tu nombre',
  TRADES: 'Al menos un oficio',
  MUNICIPALITY: 'Tu municipio',
  SCHEDULE: 'Tus días y horario',
  CURP: 'Tu CURP',
  CONSENT: 'El permiso para usar tu foto',
  INE_FRONT: 'Foto de tu INE de frente',
  INE_BACK: 'Foto de tu INE por detrás',
  SELFIE: 'Tu selfie',
};
export const missingLabel = (code: string) => missingLabels[code] ?? code;

const statusLabels: Record<string, string> = {
  DRAFT: 'Registro sin terminar',
  PENDING_REVIEW: 'En revisión',
  VERIFIED: 'Verificado',
  REJECTED: 'Hay que corregir algo',
  SUSPENDED: 'Suspendido',
  WITHDRAWN: 'Dado de baja (tu registro está guardado)',
};
export const statusLabel = (status: string) => statusLabels[status] ?? 'Sin estado';

// ---------- CURP (misma regla que el API; aquí solo para avisar antes de enviar) ----------
const CURP_PATTERN =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;
const CHECK_ALPHABET = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function normalizeCurp(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

/** Texto de ayuda si la CURP no se ve bien; cadena vacía si parece correcta. */
export function curpHint(raw: string) {
  const curp = normalizeCurp(raw);
  if (!curp) return '';
  if (curp.length !== 18) return `La CURP tiene 18 caracteres; llevas ${curp.length}.`;
  if (!CURP_PATTERN.test(curp)) return 'Revisa la CURP: algo no tiene el formato correcto.';
  let sum = 0;
  for (let i = 0; i < 17; i += 1) sum += CHECK_ALPHABET.indexOf(curp[i]) * (18 - i);
  const digit = (10 - (sum % 10)) % 10;
  if (digit !== Number(curp[17])) return 'Revisa la CURP: el último número no coincide.';
  return '';
}

// ---------- Fotos ----------
const MAX_SIDE = 1600;
const MAX_BYTES = 1_500_000;

/** Reduce la foto en el teléfono antes de mandarla (JPG, lado mayor 1600 px). */
export async function photoToDataUrl(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este teléfono no pudo preparar la foto.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.72, 0.6]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if ((dataUrl.length * 3) / 4 <= MAX_BYTES) return dataUrl;
  }
  throw new Error('La foto quedó muy pesada. Tómala de nuevo un poco más lejos.');
}

// ---------- Municipio, rango y pedidos ----------
export type Municipality = {
  code: string;
  name: string;
  stateName: string;
  lat: number;
  lng: number;
};

// Mismos valores que RADIUS_OPTIONS del API.
export const radiusOptions = [5, 10, 20, 30, 50, 100] as const;

// Mismas claves que REQUEST_URGENCIES del API.
export const urgencyOptions = [
  ['NOW', 'Ahora mismo'],
  ['TODAY', 'Hoy'],
  ['THIS_WEEK', 'Esta semana'],
] as const;
export const urgencyLabel = (key: string) =>
  urgencyOptions.find(([k]) => k === key)?.[1] ?? key;

const requestStatusLabels: Record<string, string> = {
  OPEN: 'Esperando presupuestos',
  ASSIGNED: 'Trabajador elegido',
  EN_ROUTE: 'En camino',
  ARRIVED: 'Ya llegó',
  IN_PROGRESS: 'Trabajando',
  COMPLETED: 'Terminado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Vencido',
};
export const requestStatusLabel = (status: string) =>
  requestStatusLabels[status] ?? 'Sin estado';

/** "10 min", "1 h 5 min" o "unos momentos" hasta esa hora. */
export function minutesLeftLabel(value: string | Date, now = new Date()) {
  const minutes = Math.round((new Date(value).getTime() - now.getTime()) / 60_000);
  if (minutes <= 1) return 'unos momentos';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Pedidos que siguen "vivos": se muestran en la burbuja de cómo va. */
export function isTrackable(r: Pick<HelpRequestSummary, 'status' | 'clientConfirmedAt'>) {
  return (
    ['OPEN', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(r.status) ||
    (r.status === 'COMPLETED' && !r.clientConfirmedAt)
  );
}

/** Cómo va un pedido, en pocas palabras: título y detalle (para la burbuja y Mis pedidos). */
export function trackingText(r: HelpRequestSummary, now = new Date()) {
  const who = r.providerName ?? 'Tu trabajador';
  switch (r.status) {
    case 'OPEN':
      return r.quotesCount
        ? { title: plural(r.quotesCount, 'presupuesto', 'presupuestos'), detail: 'Entra y elige el que te convenga' }
        : { title: 'Esperando presupuestos', detail: 'Te avisamos en cuanto llegue uno' };
    case 'ASSIGNED':
      return r.arriveBy
        ? { title: `Llega aprox. en ${minutesLeftLabel(r.arriveBy, now)}`, detail: `${who} se prepara para salir` }
        : { title: `Elegiste a ${who}`, detail: 'Te avisamos cuando salga' };
    case 'EN_ROUTE':
      return {
        title: !r.arriveBy
          ? 'Va en camino'
          : new Date(r.arriveBy).getTime() - now.getTime() <= 60_000
            ? 'Está por llegar'
            : `Llega aprox. en ${minutesLeftLabel(r.arriveBy, now)}`,
        detail: `${who} va en camino`,
      };
    case 'ARRIVED':
      return { title: 'Ya llegó', detail: `Dale tu PIN a ${who} en la puerta` };
    case 'IN_PROGRESS':
      return {
        title: 'Trabajando',
        detail: r.endAt ? `Termina aprox. a las ${clockLabel(r.endAt)}` : `${who} está trabajando`,
      };
    case 'COMPLETED':
      return { title: '¿Quedó bien?', detail: 'Confirma o avísanos si hubo un problema' };
    default:
      return { title: requestStatusLabel(r.status), detail: '' };
  }
}

export type Rating = { average: number | null; count: number };

export type ProviderCard = {
  id: string;
  displayName: string;
  isBusiness: boolean;
  businessName: string | null;
  bio: string | null;
  trades: string[];
  municipalityName: string | null;
  availability: Availability | null;
  verified: boolean;
  rating: Rating;
  /** Si está terminando otro trabajo, hora aproximada en que queda libre. */
  busyUntil: string | null;
  isFavorite: boolean;
};

export type CareLink = 'HEALTH' | 'VET' | null;

export type FavoriteProvider = {
  id: string;
  displayName: string;
  bio: string | null;
  trades: string[];
  municipalityName: string | null;
  availability: Availability | null;
  rating: Rating;
  presentNow: boolean;
  busyUntil: string | null;
  takingRequests: boolean;
};

export type HelpQuote = {
  id: string;
  amountMxn: number;
  /** IVA cuando el cliente pidió factura (0 si no). */
  ivaMxn: number;
  etaMinutes: number;
  durationMinutes: number | null;
  note: string | null;
  /** Cita: otra hora que propone en vez de la que pediste. */
  proposedFor: string | null;
  provider: ProviderCard;
};

export type HelpJob = {
  provider: ProviderCard;
  amountMxn: number;
  etaMinutes: number;
  durationMinutes: number | null;
  /** Precio real al terminar. */
  finalAmountMxn: number | null;
  clientConfirmedAt: string | null;
  autoConfirmed: boolean;
  problemAt: string | null;
  /** Si el cliente no contesta antes de esta hora, se da por terminado. */
  confirmBy: string | null;
  enRouteAt: string | null;
  etaAt: string | null;
  delayNote: string | null;
  delayCount: number;
  /** Cuánto le falta según su GPS (línea recta, sin tráfico). */
  gps: { km: number; minutes: number } | null;
  /** IVA cuando el cliente pidió factura (0 si no). */
  ivaMxn: number;
  arrivedAt: string | null;
  startedAt: string | null;
  estimatedMinutes: number | null;
  finishedAt: string | null;
  pin: string | null;
  lastLocation: { lat: number; lng: number; at: string } | null;
  /** Adeudo de una cancelación anterior que se paga junto con este trabajo. */
  debtMxn: number;
  /** Cuánto costaría cancelar ahora. */
  cancelFee: CancelFee;
};

export type CancelFee = {
  amountMxn: number;
  advancedKm: number;
  why: 'NOT_LEFT' | 'GRACE' | 'LATE' | 'ON_THE_WAY' | 'ARRIVED';
};

/** Reglas de la cuota al cancelar (las mismas del API), para avisarlas antes. */
export const CANCEL_RULES = {
  perKmMxn: 15,
  minMxn: 40,
  maxPct: 25,
  maxMxn: 250,
  freeMinutes: 2,
  lateFreeMinutes: 20,
};

export function cancelFeeCap(priceMxn: number) {
  const { minMxn, maxMxn, maxPct } = CANCEL_RULES;
  return Math.max(minMxn, Math.min(maxMxn, Math.round((priceMxn * maxPct) / 100)));
}

/** El aviso que se acepta al elegir: cuánto cuesta cancelar con este precio. */
export function cancelRuleText(priceMxn: number) {
  const r = CANCEL_RULES;
  return (
    `Cancelar es gratis antes de que salga, en los primeros ${r.freeMinutes} minutos o si llega más de ${r.lateFreeMinutes} minutos tarde. ` +
    `Si ya va en camino: $${r.perKmMxn} por km que avanzó (mínimo $${r.minMxn}, máximo ${formatMxn(cancelFeeCap(priceMxn))}).`
  );
}

/** La pregunta antes de cancelar, con la cantidad exacta. */
export function cancelQuestion(feeMxn: number, why: CancelFee['why'] | null, who = 'tu trabajador') {
  if (feeMxn > 0) {
    return (
      `Si cancelas ahora pagas ${formatMxn(feeMxn)} a ${who} por ${why === 'ARRIVED' ? 'ir hasta tu puerta' : 'su traslado'}. ` +
      'Se suma a tu siguiente pedido, o se lo pagas directo. ¿Cancelar?'
    );
  }
  if (why === 'LATE') return `Va más de ${CANCEL_RULES.lateFreeMinutes} minutos tarde: cancelar es gratis. ¿Cancelar?`;
  return 'Cancelar ahora es gratis. ¿Cancelar este pedido?';
}

// ---------- Factura ----------

export const IVA_PCT = 16;
/** Avisos de retraso que puede dar el trabajador en camino (igual que el API). */
export const MAX_DELAY_NOTICES = 2;
export const ivaFor = (amountMxn: number) => Math.round(amountMxn * IVA_PCT) / 100;

export type FiscalData = {
  rfc: string;
  name: string;
  regime: string;
  zip: string;
  use: string;
  email: string | null;
};

/** Regímenes fiscales más comunes (los mismos que acepta el API). */
export const FISCAL_REGIMES: readonly (readonly [string, string])[] = [
  ['612', 'Personas Físicas con Actividades Empresariales y Profesionales'],
  ['626', 'Régimen Simplificado de Confianza (RESICO)'],
  ['605', 'Sueldos y Salarios'],
  ['606', 'Arrendamiento'],
  ['616', 'Sin obligaciones fiscales'],
  ['621', 'Incorporación Fiscal'],
  ['625', 'Plataformas Tecnológicas'],
  ['601', 'General de Ley Personas Morales (empresa)'],
  ['603', 'Personas Morales con Fines no Lucrativos'],
];

export const CFDI_USES: readonly (readonly [string, string])[] = [
  ['G03', 'Gastos en general'],
  ['D01', 'Honorarios médicos, dentales y hospitalarios'],
  ['G01', 'Adquisición de mercancías'],
  ['S01', 'Sin efectos fiscales'],
];

export const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

export type WorkInvoices = {
  pending: {
    requestId: string;
    trades: string[];
    description: string;
    finishedAt: string | null;
    /** Antes de esta fecha; después el cliente puede calificar «No entregó factura». */
    dueAt: string | null;
    amountMxn: number;
    ivaMxn: number;
    totalMxn: number;
    client: FiscalData | null;
  }[];
  sent: { requestId: string; uuid: string | null; receiverRfc: string; totalMxn: number | null; sentAt: string }[];
};

/** Km en línea recta entre dos puntos y minutos aproximados en ciudad (30 km/h, sin tráfico). */
export function gpsEta(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { km: Math.round(km * 10) / 10, minutes: Math.max(1, Math.round((km / 30) * 60)) };
}

/** Llamada de voz por Tequio (por internet, sin mostrar números). */
export type TequioCall = {
  id: string;
  requestId: string;
  status: 'RINGING' | 'ACCEPTED' | 'ENDED' | 'MISSED' | 'DECLINED';
  direction: 'IN' | 'OUT';
  otherName: string;
  offerSdp: string | null;
  answerSdp: string | null;
  /** Quién está grabando la llamada (a los dos se les muestra). */
  recordingBy: 'ME' | 'OTHER' | null;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

/** Sábana de seguridad de un trabajo: los dos la ven 30 días; luego queda sellada. */
export type SafetyRecord = {
  requestId: string;
  sealed: boolean;
  generatedAt: string;
  availableUntil: string | null;
  userDays: number;
  keepDays: number;
  trades: string[];
  description: string;
  place: { municipality: string | null; label: string | null; hint: string | null };
  status: string;
  client: { name: string };
  worker: { providerId: string; name: string | null; person: string; verified: boolean } | null;
  price: { quotedMxn: number; finalMxn: number | null } | null;
  timeline: { at: string; label: string }[];
  messages: { at: string; from: string; system: boolean; body: string }[];
  calls: { at: string; from: string; to: string; outcome: string; minutes: number }[];
  recordings: { id: string; at: string; by: string; seconds: number }[];
};

export type CallConfig = {
  iceServers: RTCIceServer[];
  ringSeconds: number;
  maxMinutes: number;
};

/** Lo que debo por cancelaciones (se suma a mi siguiente pedido). */
export type MyDebts = {
  totalMxn: number;
  items: { id: string; amountMxn: number; workerName: string; createdAt: string; inRequestId: string | null }[];
};

/** Lo que me deben clientes que cancelaron cuando iba en camino. */
export type OwedToMe = {
  totalMxn: number;
  items: { id: string; amountMxn: number; clientName: string; createdAt: string; inNextRequest: boolean }[];
};

export type HelpRequest = {
  id: string;
  trades: string[];
  careLink: CareLink;
  direct: boolean;
  target: { id: string; displayName: string } | null;
  scheduledFor: string | null;
  followUpOfId: string | null;
  description: string;
  municipalityCode: string;
  municipalityName: string | null;
  addressHint: string | null;
  lat: number | null;
  lng: number | null;
  urgency: string;
  status: string;
  hasPhoto: boolean;
  photoCount: number;
  needsInvoice: boolean;
  invoice: { uuid: string | null; sentAt: string; totalMxn: number | null } | null;
  /** Con factura pedida: desde cuándo puede calificar aunque no llegue. */
  reviewOpensAt: string | null;
  /** Hasta cuándo puede ver y descargar su registro de seguridad (null: trabajo en curso). */
  recordUntil: string | null;
  placeLabel: string | null;
  placeId: string | null;
  createdAt: string;
  expiresAt: string;
  chosenQuoteId: string | null;
  cancelledBy: string | null;
  cancelFeeMxn: number | null;
  quotes: HelpQuote[];
  job: HelpJob | null;
  reviewed: boolean;
  nearbyPresent?: number;
};

export type HelpRequestSummary = {
  id: string;
  trades: string[];
  status: string;
  direct: boolean;
  scheduledFor: string | null;
  quotesCount: number;
  placeLabel: string | null;
  createdAt: string;
  /** Quién va (el elegido). */
  providerName: string | null;
  /** Hora aproximada de llegada. */
  arriveBy: string | null;
  arrivedAt: string | null;
  /** Hora aproximada en que termina el trabajo. */
  endAt: string | null;
  finishedAt: string | null;
  clientConfirmedAt: string | null;
  /** Cuánto pagaría si cancela ahora (0 = gratis). */
  cancelFeeNowMxn: number;
};

export type HelpRequestInput = {
  trades: string[];
  description: string;
  /** Lugar guardado: de ahí salen el punto, el municipio y la dirección. */
  placeId?: string;
  municipalityCode?: string;
  addressHint?: string;
  lat?: number;
  lng?: number;
  urgency: string;
  photoDataUrls?: string[];
  providerId?: string;
  scheduledFor?: string;
  followUpOfId?: string;
  /** Necesita factura: el precio lleva IVA aparte. */
  needsInvoice?: boolean;
};

/** Lugar guardado: Casa, Casa de mamá, Oficina... */
export type Place = {
  id: string;
  label: string;
  street: string;
  number: string | null;
  neighborhood: string | null;
  address: string;
  municipalityCode: string;
  municipalityName: string | null;
  lat: number;
  lng: number;
  reference: string | null;
  hasPhoto: boolean;
};

export type PlaceInput = {
  label: string;
  street: string;
  number?: string;
  neighborhood?: string;
  municipalityCode: string;
  lat: number;
  lng: number;
  reference?: string;
};

/** Nombres rápidos para un lugar. */
export const PLACE_LABELS = ['Casa', 'Casa de mamá', 'Oficina'] as const;
export const MAX_REQUEST_PHOTOS = 5;

export type ClientProfile = {
  displayName: string;
  homeLat: number | null;
  homeLng: number | null;
  homeReference: string | null;
  hasHousePhoto: boolean;
  rating: Rating;
};

export type NearbyRequest = {
  id: string;
  trades: string[];
  careLink: CareLink;
  direct: boolean;
  scheduledFor: string | null;
  description: string;
  municipalityName: string | null;
  distanceKm: number;
  urgency: string;
  hasPhoto: boolean;
  photoCount: number;
  needsInvoice: boolean;
  clientRating: Rating;
  createdAt: string;
  expiresAt: string;
  myQuote: {
    amountMxn: number;
    etaMinutes: number;
    durationMinutes: number | null;
    note: string | null;
    proposedFor: string | null;
  } | null;
};

export type NearbyResult = {
  present: boolean;
  suspendedUntil: string | null;
  busyUntil: string | null;
  requests: NearbyRequest[];
  /** Cuántos piden lo que sabes hacer cerca (aunque estés Ausente) y qué oficios. */
  waiting: { count: number; trades: string[] };
};

export type PresenteJob = {
  requestId: string;
  status: string;
  trades: string[];
  careLink: CareLink;
  scheduledFor: string | null;
  description: string;
  municipalityName: string | null;
  addressHint: string | null;
  lat: number | null;
  lng: number | null;
  clientName: string;
  clientRating: Rating;
  placeLabel: string | null;
  hasHousePhoto: boolean;
  hasPhoto: boolean;
  photoCount: number;
  amountMxn: number;
  etaMinutes: number;
  durationMinutes: number | null;
  finalAmountMxn: number | null;
  /** Adeudo de una cancelación anterior del cliente que cobra junto con este trabajo. */
  collectDebtMxn: number;
  needsInvoice: boolean;
  delayCount: number;
  cancelFeeMxn: number | null;
  clientConfirmedAt: string | null;
  problemAt: string | null;
  etaAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  estimatedMinutes: number | null;
  finishedAt: string | null;
  cancelledBy: string | null;
  reviewed: boolean;
  chosenAt: string;
};

export type FollowUpMeta = {
  scheduledFor: string;
  providerId: string;
  trades: string[];
  requestId: string;
};

type ChatBase = {
  id: string;
  body: string;
  from: 'ME' | 'OTHER' | 'SYSTEM';
  createdAt: string;
};

export type ChatMessage = ChatBase &
  (
    | { kind: 'FOLLOW_UP'; meta: FollowUpMeta | null }
    | { kind: 'RECORDING'; meta: { event: 'START' | 'SAVED'; recordingId?: string } | null }
    | { kind: 'TEXT' | 'TIP' | 'CALL'; meta: unknown }
  );

export type SearchResult = {
  id: string;
  displayName: string;
  businessName: string | null;
  isBusiness: boolean;
  delivers: boolean;
  teaches: boolean;
  bio: string | null;
  trades: string[];
  municipalityName: string | null;
  distanceKm: number;
  present: boolean;
  availableNow: boolean;
  availability: Availability | null;
  rating: Rating;
};

export type ProblemJob = {
  requestId: string;
  trades: string[];
  description: string;
  clientName: string;
  providerName: string;
  amountMxn: number | null;
  problemNote: string | null;
  problemAt: string;
  finishedAt: string | null;
};

/** Nombre para mostrar: el del negocio, o el de la persona. */
export const providerName = (p: {
  displayName: string;
  isBusiness?: boolean;
  businessName?: string | null;
}) => (p.isBusiness && p.businessName ? p.businessName : p.displayName);

/** Si es negocio, quién atiende: "Atiende Juan Pérez". */
export const providerPerson = (p: {
  displayName: string;
  isBusiness?: boolean;
  businessName?: string | null;
}) => (p.isBusiness && p.businessName ? `Atiende ${p.displayName}` : null);

/** Duración del presupuesto: "2 h", "3 días". */
export const durationLabel = (q: { durationMinutes: number | null }) =>
  q.durationMinutes ? etaLabel(q.durationMinutes) : null;

/** Servicios exprés: precio mínimo y trabajo del mismo día (igual que el API). */
export const MIN_PRICE_MXN = 300;
export const MAX_JOB_MINUTES = 12 * 60;

/** Cuánto descuenta Yalika de un precio y cuánto le queda al trabajador (en pesos con centavos). */
export function commissionFor(priceMxn: number, pct: number) {
  const commission = Math.round(priceMxn * pct) / 100;
  return { commission, net: priceMxn - commission };
}

/** Precios de ejemplo para el tabulador. */
export const COMMISSION_TABLE_PRICES = [300, 400, 500, 700, 1_000, 1_500, 2_000, 3_000];

export type PhotoInfo = { id: string; kind: string; caption: string | null };

export type ProviderProfile = {
  id: string;
  displayName: string;
  businessName: string | null;
  isBusiness: boolean;
  delivers: boolean;
  teaches: boolean;
  bio: string | null;
  trades: string[];
  municipalityName: string | null;
  availability: Availability | null;
  /** Cédula verificada en Salud (solo médicos, enfermería y veterinarios). */
  license: {
    profession: string;
    number: string;
    specialty: string | null;
    lookupUrl: string;
  } | null;
  /** Cédulas revisadas por Yalika (ingeniería, contaduría, leyes...). */
  credentials: { trade: string; number: string; lookupUrl: string; sepProof: boolean }[];
  /** Su página publicada en Yalika. */
  site: { name: string; slug: string } | null;
  rating: Rating;
  completedJobs: number;
  memberSince: string | null;
  reviews: { stars: number; comment: string | null; invoiceMissing: boolean; createdAt: string }[];
  photos: PhotoInfo[];
};

/** Oficios por pedido (igual que el API). */
export const MAX_TRADES_PER_REQUEST = 3;

export const photoKindOptions = [
  ['WORK', 'Trabajo que hice'],
  ['BUSINESS', 'Mi negocio o taller'],
  ['COURSE', 'Curso o diploma'],
] as const;
export const photoKindLabel = (key: string) =>
  photoKindOptions.find(([k]) => k === key)?.[1] ?? key;

/** Etapas que ve la gente, en orden. */
export const jobSteps = [
  ['ASSIGNED', 'Elegido'],
  ['EN_ROUTE', 'En camino'],
  ['ARRIVED', 'Llegó'],
  ['IN_PROGRESS', 'Trabajando'],
  ['COMPLETED', 'Terminado'],
] as const;

/** "martes 20 de octubre, 10:00" en hora de México. */
export function dateTimeLabel(value: string | Date | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });
}

const MX_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Mexico_City',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Misma regla que el API: ¿atiende en esa fecha y hora? (turnos de noche incluidos). */
export function isWithinAvailability(a: Availability | null | undefined, date: Date) {
  if (!a || !a.days.length || Number.isNaN(date.getTime())) return false;
  const parts = Object.fromEntries(MX_TIME.formatToParts(date).map((p) => [p.type, p.value]));
  const day = WEEKDAY[parts.weekday] ?? 1;
  const time = `${parts.hour}:${parts.minute}`;
  if (a.allDay || !a.from || !a.to) return a.days.includes(day);
  if (a.from < a.to) return a.days.includes(day) && time >= a.from && time < a.to;
  const previous = day === 1 ? 7 : day - 1;
  return (a.days.includes(day) && time >= a.from) || (a.days.includes(previous) && time < a.to);
}

/** Valor para un campo de fecha y hora (hora local del teléfono). */
export function toDateTimeInput(value: string | Date) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Enlaces a Salud o Veterinaria para trabajos de salud (cada módulo revisa sus permisos). */
export const careLinks = {
  HEALTH: {
    client: { href: '/salud/qr', label: 'Mostrar mi QR de Salud al médico' },
    worker: { href: '/salud/profesional', label: 'Abrir Salud (profesional)' },
  },
  VET: {
    client: { href: '/veterinaria', label: 'Ver las fichas de mis mascotas' },
    worker: { href: '/veterinaria/pro', label: 'Abrir panel veterinario' },
  },
} as const;

export function ratingLabel(rating: Rating | null | undefined) {
  if (!rating || !rating.count || rating.average === null) return 'Nuevo, sin calificaciones';
  return `${rating.average.toFixed(1)} ★ (${rating.count})`;
}

/** "10:35" en hora de México. */
export function clockLabel(value: string | Date | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });
}

/** "1 presupuesto", "3 presupuestos". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "muy cerca" o "a unos 12 km". */
/** "hace 5 min", "hace 2 h": cuánto hace que se pidió. */
export function timeAgo(value: string | Date, now = new Date()) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

export const distanceLabel = (km: number) => (km <= 1 ? 'muy cerca' : `a unos ${km} km`);

/** Ligas para abrir la ruta en Google Maps o Waze. */
export function mapsLinks(lat: number, lng: number) {
  const point = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${point}`,
    waze: `https://waze.com/ul?ll=${point}&navigate=yes`,
  };
}

/** Municipio cuya cabecera está más cerca del punto (sugerencia; la persona puede cambiarlo). */
export function nearestMunicipality<T extends { lat: number; lng: number }>(
  list: readonly T[],
  point: { lat: number; lng: number },
) {
  let best: T | null = null;
  let bestD = Infinity;
  for (const m of list) {
    const d = (m.lat - point.lat) ** 2 + ((m.lng - point.lng) * Math.cos((point.lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

export function formatMxn(amount: number) {
  return amount.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
}

/** "25 min", "2 h", "1 h 30 min", "2 días". */
export function etaLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return `${days} ${days === 1 ? 'día' : 'días'}`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---------- Saldo del trabajador ----------
export type WalletEntry = {
  id: string;
  kind:
    | 'WELCOME'
    | 'TOPUP'
    | 'COMMISSION'
    | 'CARRY'
    | 'FREE_SERVICE'
    | 'FREE_USED'
    | 'CANCEL_FEE'
    | 'DEBT_COLLECTED';
  label: string;
  amountMxn: number;
  note: string | null;
  reference: string | null;
  requestId: string | null;
  createdAt: string;
};

export type PresenteWallet = {
  balanceMxn: number;
  canQuote: boolean;
  low: boolean;
  /** La comisión que le toca hoy (10 % de fundador mientras le dura el regalo, luego 5 %). */
  commissionPct: number;
  promo: { giftLeftMxn: number; nextPct: number } | null;
  minPriceMxn: number;
  code: string;
  referral: { freeServices: number; maxFreeMxn: number };
  minTopupMxn: number;
  account: { clabe: string; bank: string | null; name: string } | null;
  /** Recarga con Mercado Pago (tarjeta, OXXO o transferencia); null si no está activa. */
  online: { amounts: number[] } | null;
  entries: WalletEntry[];
};

export type OperatorWallet = {
  providerId: string;
  displayName: string;
  code: string;
  balanceMxn: number;
  entries: WalletEntry[];
};

/** Saldo con centavos y signo: "$93.00", "−$12.50". */
export function formatBalance(amount: number) {
  const text = Math.abs(amount).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
  return amount < 0 ? `−${text}` : text;
}

// ---------- API ----------
export class PresenteApiError extends Error {
  status: number;
  missing: string[];
  constructor(message: string, status: number, missing: string[] = []) {
    super(message);
    this.name = 'PresenteApiError';
    this.status = status;
    this.missing = missing;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/yalika/presente${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new PresenteApiError('No hay conexión con Yalika. Revisa tu internet.', 0);
  }
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
    missing?: unknown;
  } | null;
  if (!response.ok) {
    const raw = body?.message;
    const message = Array.isArray(raw) ? raw.join('. ') : raw;
    const missing = Array.isArray(body?.missing)
      ? body.missing.filter((m): m is string => typeof m === 'string')
      : [];
    if (response.status >= 500) {
      throw new PresenteApiError(
        'Algo falló de nuestro lado. Intenta de nuevo en un momento.',
        response.status,
      );
    }
    throw new PresenteApiError(message || `Error ${response.status}`, response.status, missing);
  }
  return body as T;
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const enc = encodeURIComponent;

export const presenteApi = {
  me: () => request<PresenteProvider | null>('/me'),
  saveProfile: (data: PresenteProfileInput) =>
    request<PresenteProvider>('/me', { method: 'PUT', body: JSON.stringify(data) }),
  setConsent: (accepted: boolean) => request<PresenteProvider>('/me/consent', post({ accepted })),
  uploadDocument: (kind: string, dataUrl: string) =>
    request<PresenteProvider>('/me/documents', post({ kind, dataUrl })),
  submit: () => request<PresenteProvider>('/me/submit', post({})),
  setPresence: (present: boolean) => request<PresenteProvider>('/me/presence', post({ present })),
  /** Darse de baja guardando el registro. */
  withdraw: () => request<PresenteProvider>('/me/withdraw', post({})),
  credentials: () => request<ProCredential[]>('/me/credentials'),
  sendCredential: (data: {
    trade: string;
    licenseNumber: string;
    titlePhoto: string;
    selfiePhoto: string;
    sepProof: string;
  }) => request<ProCredential[]>('/me/credentials', post(data)),
  sendSepProof: (trade: string, file: string) =>
    request<ProCredential[]>(`/me/credentials/${enc(trade)}/sep-proof`, post({ file })),
  providerSepProof: (providerId: string, trade: string) =>
    request<{ mime: string; dataUrl: string; licenseNumber: string; lookupUrl: string }>(
      `/providers/${enc(providerId)}/credentials/${enc(trade)}/sep-proof`,
    ),
  removeCredential: (trade: string) =>
    request<ProCredential[]>(`/me/credentials/${enc(trade)}`, { method: 'DELETE' }),
  sendRecheck: (dataUrl: string) => request<PresenteProvider>('/me/recheck', post({ dataUrl })),
  history: () => request<HistoryItem[]>('/me/history'),
  activity: (municipalityCode?: string) =>
    request<TradeActivity>(
      `/activity${municipalityCode ? `?municipalityCode=${enc(municipalityCode)}` : ''}`,
    ),
  pendingCredentials: () => request<PendingCredential[]>('/operator/credentials'),
  credentialPhoto: (id: string, which: 'title' | 'selfie' | 'sep') =>
    request<{ dataUrl: string }>(`/operator/credentials/${enc(id)}/photos/${which}`),
  decideCredential: (id: string, approve: boolean, note?: string) =>
    request<{ id: string; status: string }>(
      `/operator/credentials/${enc(id)}/decision`,
      post({ approve, note }),
    ),
  pendingRechecks: () => request<PendingRecheck[]>('/operator/rechecks'),
  decideRecheck: (providerId: string, approve: boolean, note?: string) =>
    request<{ id: string; approved: boolean }>(
      `/operator/providers/${enc(providerId)}/recheck`,
      post({ approve, note }),
    ),
  /** Volver a ofrecer servicios. */
  comeBack: () => request<PresenteProvider>('/me/return', post({})),
  /** Borrar los datos de trabajador para siempre. */
  deleteForever: () => request<{ deleted: boolean }>('/me', { method: 'DELETE' }),
  pending: () => request<PresentePending[]>('/operator/pending'),
  document: (providerId: string, kind: string) =>
    request<{ kind: string; dataUrl: string }>(
      `/operator/providers/${encodeURIComponent(providerId)}/documents/${encodeURIComponent(kind)}`,
    ),
  municipalities: () => request<Municipality[]>('/municipalities'),
  // Quien pide ayuda
  client: () => request<ClientProfile | null>('/client/me'),
  saveClient: (data: {
    displayName: string;
    homeLat?: number;
    homeLng?: number;
    homeReference?: string;
  }) => request<ClientProfile>('/client/me', { method: 'PUT', body: JSON.stringify(data) }),
  setHousePhoto: (dataUrl: string) =>
    request<ClientProfile>('/client/me/house-photo', post({ dataUrl })),
  places: () => request<Place[]>('/client/places'),
  addPlace: (data: PlaceInput) => request<Place>('/client/places', post(data)),
  updatePlace: (id: string, data: PlaceInput) =>
    request<Place>(`/client/places/${enc(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  removePlace: (id: string) =>
    request<{ deleted: boolean }>(`/client/places/${enc(id)}`, { method: 'DELETE' }),
  setPlacePhoto: (id: string, dataUrl: string) =>
    request<Place>(`/client/places/${enc(id)}/photo`, post({ dataUrl })),
  placePhoto: (id: string) => request<{ dataUrl: string }>(`/client/places/${enc(id)}/photo`),
  createRequest: (data: HelpRequestInput) => request<HelpRequest>('/requests', post(data)),
  myRequests: () => request<HelpRequestSummary[]>('/requests'),
  helpRequest: (id: string) => request<HelpRequest>(`/requests/${enc(id)}`),
  addRequestPhoto: (id: string, dataUrl: string) =>
    request<{ photoCount: number }>(`/requests/${enc(id)}/photos`, post({ dataUrl })),
  requestPhoto: (id: string, n = 0) =>
    request<{ dataUrl: string }>(`/requests/${enc(id)}/photo${n ? `?n=${n}` : ''}`),
  housePhoto: (id: string) => request<{ dataUrl: string }>(`/requests/${enc(id)}/house-photo`),
  cancelRequest: (id: string, reason?: string) =>
    request<HelpRequest>(`/requests/${enc(id)}/cancel`, post({ reason })),
  chooseQuote: (id: string, quoteId: string) =>
    request<HelpRequest>(`/requests/${enc(id)}/choose`, post({ quoteId })),
  myDebts: () => request<MyDebts>('/client/debts'),
  fiscal: () => request<FiscalData & { complete: boolean }>('/client/fiscal'),
  saveFiscal: (data: FiscalData) =>
    request<FiscalData & { complete: boolean }>('/client/fiscal', { method: 'PUT', body: JSON.stringify(data) }),
  invoiceFile: (id: string, which: 'pdf' | 'xml') =>
    request<{ dataUrl: string; fileName: string }>(`/requests/${enc(id)}/invoice/${which}`),
  workInvoices: () => request<WorkInvoices>('/work/invoices'),
  uploadInvoice: (id: string, pdf: string, xml: string) =>
    request<WorkInvoices>(`/work/invoices/${enc(id)}`, post({ pdf, xml })),
  callConfig: () => request<CallConfig>('/calls/config'),
  startCall: (requestId: string, sdp: string) =>
    request<TequioCall>(`/requests/${enc(requestId)}/calls`, post({ sdp })),
  currentCall: (requestId: string) => request<TequioCall | null>(`/requests/${enc(requestId)}/calls/current`),
  getCall: (id: string) => request<TequioCall>(`/calls/${enc(id)}`),
  answerCall: (id: string, sdp: string) => request<TequioCall>(`/calls/${enc(id)}/answer`, post({ sdp })),
  endCall: (id: string) => request<TequioCall>(`/calls/${enc(id)}/end`, post({})),
  startRecording: (id: string) => request<TequioCall>(`/calls/${enc(id)}/recording/start`, post({})),
  saveRecording: (id: string, audio: string, seconds: number) =>
    request<{ id: string; seconds: number }>(`/calls/${enc(id)}/recording`, post({ audio, seconds })),
  callRecording: (requestId: string, recordingId: string) =>
    request<{ mime: string; seconds: number; dataUrl: string }>(
      `/requests/${enc(requestId)}/recordings/${enc(recordingId)}`,
    ),
  safetyRecord: (requestId: string) => request<SafetyRecord>(`/requests/${enc(requestId)}/safety-record`),
  authorityRecord: (requestId: string, authorityRef: string) =>
    request<SafetyRecord>(`/operator/requests/${enc(requestId)}/safety-record`, post({ authorityRef })),
  authorityRecording: (requestId: string, recordingId: string, authorityRef: string) =>
    request<{ mime: string; seconds: number; dataUrl: string }>(
      `/operator/requests/${enc(requestId)}/recordings/${enc(recordingId)}`,
      post({ authorityRef }),
    ),
  pushKey: () => request<{ publicKey: string }>('/push/key'),
  pushSubscribe: (data: { endpoint: string; p256dh: string; auth: string }) =>
    request<{ enabled: boolean }>('/push/subscribe', post(data)),
  pushUnsubscribe: (endpoint: string) =>
    request<{ enabled: boolean }>('/push/unsubscribe', post({ endpoint })),
  owedToMe: () => request<OwedToMe>('/me/debts'),
  debtPaid: (id: string) => request<OwedToMe>(`/me/debts/${enc(id)}/paid`, post({})),
  messages: (id: string) => request<ChatMessage[]>(`/requests/${enc(id)}/messages`),
  sendMessage: (id: string, body: string) =>
    request<ChatMessage[]>(`/requests/${enc(id)}/messages`, post({ body })),
  review: (id: string, stars: number, comment?: string) =>
    request<{ reviewed: boolean }>(`/requests/${enc(id)}/review`, post({ stars, comment })),
  providerProfile: (id: string) => request<ProviderProfile>(`/providers/${enc(id)}`),
  providerPhoto: (id: string, photoId: string) =>
    request<{ dataUrl: string }>(`/providers/${enc(id)}/photos/${enc(photoId)}`),
  favorites: () => request<FavoriteProvider[]>('/client/favorites'),
  addFavorite: (providerId: string) =>
    request<FavoriteProvider[]>('/client/favorites', post({ providerId })),
  removeFavorite: (providerId: string) =>
    request<FavoriteProvider[]>(`/client/favorites/${enc(providerId)}`, { method: 'DELETE' }),
  openToAll: (id: string) => request<HelpRequest>(`/requests/${enc(id)}/open-to-all`, post({})),
  // Trabajador
  proposeFollowUp: (id: string, scheduledFor: string, note?: string) =>
    request<ChatMessage[]>(`/work/jobs/${enc(id)}/follow-up`, post({ scheduledFor, note })),
  mySites: () =>
    request<{ selectedId: string | null; sites: { id: string; name: string; slug: string }[] }>(
      '/me/sites',
    ),
  setSite: (siteId: string | null) =>
    request<{ selectedId: string | null; sites: { id: string; name: string; slug: string }[] }>(
      '/me/site',
      { method: 'PUT', body: JSON.stringify({ siteId }) },
    ),
  myPhotos: () => request<(PhotoInfo & { providerId: string })[]>('/me/photos'),
  addPhoto: (kind: string, dataUrl: string, caption?: string) =>
    request<(PhotoInfo & { providerId: string })[]>('/me/photos', post({ kind, dataUrl, caption })),
  deletePhoto: (photoId: string) =>
    request<(PhotoInfo & { providerId: string })[]>(`/me/photos/${enc(photoId)}`, {
      method: 'DELETE',
    }),
  wallet: () => request<PresenteWallet>('/me/wallet'),
  startOnlineTopup: (amountMxn: number) =>
    request<{ id: string; url: string }>(
      '/me/wallet/mercadopago',
      post({ amountMxn, origin: window.location.origin }),
    ),
  checkOnlineTopup: (id: string) =>
    request<{ id: string; amountMxn: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' }>(
      `/me/wallet/mercadopago/${enc(id)}/check`,
      post({}),
    ),
  program: () => request<PresenteProgram>('/program'),
  walletLookup: (code: string) => request<OperatorWallet>(`/operator/wallet/${enc(code)}`),
  walletTopup: (data: { code: string; amountMxn: number; reference: string }) =>
    request<OperatorWallet>('/operator/wallet/topup', post(data)),
  nearby: () => request<NearbyResult>('/work/nearby'),
  sendQuote: (
    requestId: string,
    quote: {
      amountMxn: number;
      etaMinutes: number;
      durationMinutes: number;
      note?: string;
      proposedFor?: string;
    },
  ) => request<NearbyResult>(`/work/requests/${enc(requestId)}/quote`, post(quote)),
  providerSlots: (providerId: string) =>
    request<{ availability: Availability | null; slots: string[] }>(`/providers/${enc(providerId)}/slots`),
  jobs: () => request<PresenteJob[]>('/work/jobs'),
  enRoute: (id: string, etaMinutes: number, note?: string) =>
    request<PresenteJob[]>(`/work/jobs/${enc(id)}/en-route`, post({ etaMinutes, note })),
  shareLocation: (id: string, lat: number, lng: number) =>
    request<{ saved: boolean }>(`/work/jobs/${enc(id)}/location`, post({ lat, lng })),
  arrive: (id: string, pin: string, position?: { lat: number; lng: number }) =>
    request<PresenteJob[]>(`/work/jobs/${enc(id)}/arrive`, post({ pin, ...position })),
  startJob: (id: string, estimatedMinutes: number) =>
    request<PresenteJob[]>(`/work/jobs/${enc(id)}/start`, post({ estimatedMinutes })),
  finishJob: (id: string, final: { finalAmountMxn?: number } = {}) =>
    request<PresenteJob[]>(`/work/jobs/${enc(id)}/finish`, post(final)),
  confirmDone: (id: string) => request<HelpRequest>(`/requests/${enc(id)}/confirm`, post({})),
  reportProblem: (id: string, note: string) =>
    request<HelpRequest>(`/requests/${enc(id)}/problem`, post({ note })),
  search: (trade: string, municipalityCode: string) =>
    request<SearchResult[]>(
      `/search?trade=${enc(trade)}&municipalityCode=${enc(municipalityCode)}`,
    ),
  problems: () => request<ProblemJob[]>('/operator/problems'),
  closeProblem: (id: string, charge: boolean, note: string) =>
    request<ProblemJob[]>(`/operator/requests/${enc(id)}/close`, post({ charge, note })),
  cancelJob: (id: string, reason?: string) =>
    request<{ strikes: number; suspendedUntil: string | null }>(
      `/work/jobs/${enc(id)}/cancel`,
      post({ reason }),
    ),
  decide: (providerId: string, approve: boolean, note?: string) =>
    request<{ id: string; status: string }>(
      `/operator/providers/${encodeURIComponent(providerId)}/decision`,
      post({ approve, note }),
    ),
};

export const PRESENTE_FEATURE_ENV = 'YALIKA_PRESENTE_ENABLED';
/** Clave de 32 bytes (hex o base64) para cifrar la CURP y las fotos de verificación. */
export const PRESENTE_KEY_ENV = 'YALIKA_PRESENTE_KEY';
export const PRESENTE_MODULE = 'presente';

/**
 * Oficios por clave. El orden y las categorías para pantalla viven en la web
 * (lib/yalika-presente.ts); una prueba revisa que las claves coincidan.
 */
export const PRESENTE_TRADES = [
  // Profesionales de la salud (cédula verificada en Salud o por el operador)
  'MEDICO',
  'ENFERMERIA',
  'VETERINARIO',
  'PSICOLOGIA',
  'NUTRICION',
  'FISIOTERAPIA',
  'TRASLADO_AMBULANCIA',
  // Profesionales con cédula (título o cédula y selfie con ella, revisados por el operador)
  'ABOGADO',
  'CONTADOR',
  'ARQUITECTURA',
  'INGENIERIA_CIVIL',
  'INGENIERIA_ELECTRICA',
  'INGENIERIA_INDUSTRIAL',
  'INGENIERIA_MECANICA',
  // Para tu casa
  'CERRAJERIA',
  'PLOMERIA',
  'ELECTRICIDAD',
  'DESTAPE_DRENAJE',
  'ALBANILERIA',
  'PINTURA',
  'HERRERIA',
  'CARPINTERIA',
  'VIDRIOS_ALUMINIO',
  'TAPICERIA',
  'IMPERMEABILIZACION',
  'REFRIGERACION',
  'LINEA_BLANCA',
  'CAMARAS_SEGURIDAD',
  'FUMIGACION',
  'JARDINERIA',
  'LIMPIEZA',
  // Agua, fletes y mandados
  'PIPA_AGUA',
  'FLETES',
  'MANDADOS',
  'AYUDANTE',
  // Tu carro
  'LLANTAS',
  'GRUA',
  'BATERIA_AUTO',
  'MECANICA',
  'ELECTRICO_AUTO',
  'LAVADO_AUTO',
  // Tecnología y sistemas
  'CELULARES',
  'COMPUTADORAS',
  'TV_INTERNET',
  'PROGRAMACION',
  'DISENO_GRAFICO',
  // Cuidados y mascotas
  'CUIDADO_ADULTOS',
  'PASEO_PERROS',
  'ESTETICA_CANINA',
  // Belleza
  'ESTILISTA',
  'BARBERO',
  'UNAS',
  'MAQUILLAJE',
  // Clases y enseñanza
  'CLASES',
  'CLASES_MUSICA',
  'CLASES_IDIOMAS',
  'CLASES_COMPUTACION',
  'CLASES_COCINA',
  'CLASES_DEPORTE',
  'CLASES_ARTE',
  'CLASES_MANEJO',
  'CLASES_OFICIO',
  // Comida y hecho a mano
  'PAN',
  'COMIDA_CASERA',
  'BANQUETES',
  'COSTURA',
  'ARTESANIAS',
  // Fiestas y eventos
  'MESEROS',
  'FOTOGRAFIA',
  'MUSICA',
  'DECORACION_EVENTOS',
  // Cualquier otra cosa (se explica en la descripción)
  'OTRO',
] as const;

/**
 * Salud: piden cédula profesional verificada en el módulo de Salud (Soy profesional)
 * y que la profesión registrada corresponda.
 */
export const CLINICAL_TRADES: readonly string[] = [
  'MEDICO',
  'ENFERMERIA',
  'VETERINARIO',
];

/** Piden permiso que aún no verificamos: todavía no se pueden ofrecer ni pedir. */
export const PENDING_TRADES: readonly string[] = ['TRASLADO_AMBULANCIA'];

/**
 * Profesiones con cédula que revisa el operador: se sube foto del título o la cédula y una
 * selfie con ella en mano. Al aprobarse, la profesión se agrega a lo que ofrece.
 */
export const TITLE_TRADES: readonly string[] = [
  'PSICOLOGIA',
  'NUTRICION',
  'FISIOTERAPIA',
  'ABOGADO',
  'CONTADOR',
  'ARQUITECTURA',
  'INGENIERIA_CIVIL',
  'INGENIERIA_ELECTRICA',
  'INGENIERIA_INDUSTRIAL',
  'INGENIERIA_MECANICA',
];

/**
 * Todo profesionista con cédula puede mandarla desde Tequio: número, foto de la cédula y selfie
 * con ella en mano; el operador la confirma en el Registro Nacional de Profesionistas (SEP).
 * Los de salud también pueden venir ya verificados desde Salud.
 */
export const CREDENTIAL_TRADES: readonly string[] = [
  ...TITLE_TRADES,
  ...CLINICAL_TRADES,
];

/** Cada cuánto se pide una selfie nueva para comprobar que sigue siendo la misma persona. */
export const RECHECK_DAYS = 90;
/** Días de gracia después de vencer: luego ya no puede ponerse Presente hasta mandarla. */
export const RECHECK_GRACE_DAYS = 7;

/**
 * Servicios exprés: cada visita lleva su presupuesto, desde $300, y se hace el mismo día
 * (hasta 12 horas de trabajo). La comisión de Yalika se descuenta del precio final.
 */
export const MIN_PRICE_MXN = 300;
export const MAX_PRICE_MXN = 200_000;
export const MAX_JOB_MINUTES = 12 * 60;

/** Al terminar, el cliente confirma que quedó bien; si no contesta en este tiempo, se da por terminado. */
export const CONFIRM_HOURS = 48;

/** Consulta pública de cédulas profesionales (SEP). */
export const SEP_LICENSE_LOOKUP_URL = 'https://cedulaprofesional.sep.gob.mx/';
/** Constancia de Situación Profesional: gratis, en PDF con código QR para comprobar que es real. */
export const SEP_CERTIFICATE_URL = 'https://www.gob.mx/cedulaprofesional';
/** Comprobante de la SEP (PDF o captura): máximo 3 MB. */
export const SEP_PROOF_MAX_BYTES = 3_000_000;

/** Sin límite práctico: puede ofrecer todo lo que sabe hacer. */
export const MAX_TRADES = PRESENTE_TRADES.length;

/** Solo se puede cambiar el perfil o subir fotos mientras no está en revisión ni aprobado. */
export const PRESENTE_EDITABLE_STATUSES = ['DRAFT', 'REJECTED'] as const;

export const PRESENTE_DOCUMENT_KINDS = [
  'INE_FRONT',
  'INE_BACK',
  'SELFIE',
] as const;

/** Selfie nueva para revalidar identidad (la revisa el operador junto a la guardada). */
export const RECHECK_DOCUMENT_KIND = 'SELFIE_RECHECK';

export const PRESENTE_CONSENT_VERSION = 'presente-biometria-v2';

/** Si el trabajador no da señales en este tiempo, pasa solo a Ausente. */
export const PRESENCE_TIMEOUT_MS = 30 * 60 * 1000;

export const MIN_IMAGE_BYTES = 10_000;
export const MAX_IMAGE_BYTES = 1_600_000;

/** Rangos de km que puede elegir el trabajador. */
export const RADIUS_OPTIONS = [5, 10, 20, 30, 50, 100] as const;

/** Qué tan pronto se necesita; también fija cuánto dura abierto el pedido. */
export const REQUEST_URGENCIES = ['NOW', 'TODAY', 'THIS_WEEK'] as const;
export const REQUEST_TTL_HOURS: Record<string, number> = {
  NOW: 6,
  TODAY: 24,
  THIS_WEEK: 7 * 24,
};

/** Pedidos abiertos al mismo tiempo por persona. */
export const MAX_OPEN_REQUESTS = 3;

/** Fotos del problema por pedido. */
export const MAX_REQUEST_PHOTOS = 5;

/** Lugares guardados por persona (Casa, Casa de mamá, Oficina...). */
export const MAX_PLACES = 10;

/** Oficios por pedido (por ejemplo plomería y electricidad en una sola visita). */
export const MAX_TRADES_PER_REQUEST = 3;

/** Etapas del trabajo una vez elegido el trabajador. */
export const JOB_STATUSES = [
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
] as const;

/** Cancelar es gratis antes de que el trabajador salga y hasta estos minutos después de elegirlo. */
export const FREE_CANCEL_MINUTES = 2;
/**
 * Cuota cuando el cliente cancela con el trabajador en camino: por km avanzado hacia la casa
 * (en línea recta, para que dar vueltas no cobre más), con un mínimo y un tope: el 25% del
 * precio acordado y nunca más de $250. Si el trabajador ya llegó, se cobra el tope.
 */
export const CANCEL_FEE_PER_KM_MXN = 15;
export const CANCEL_FEE_MIN_MXN = 40;
export const CANCEL_FEE_MAX_PCT = 25;
export const CANCEL_FEE_MAX_MXN = 250;
/** Si el trabajador va más de estos minutos tarde de lo que dijo, cancelar es gratis. */
export const LATE_FREE_MINUTES = 20;
/**
 * Avisos de retraso ("hay tráfico") que puede dar mientras va en camino: cada uno mueve la hora
 * de llegada y le avisa al cliente, así no se le cuenta como tarde. Más de esto, ya no.
 */
export const MAX_DELAY_NOTICES = 2;
/** Velocidad promedio en ciudad para estimar cuánto le falta según su GPS (sin tráfico). */
export const CITY_SPEED_KMH = 30;
/** El asistente le vuelve a recordar al cliente su adeudo cada estos días. */
export const DEBT_REMIND_DAYS = 3;

/** Faltas del trabajador: más de este número en 30 días = baja temporal de 30 días. */
export const STRIKE_LIMIT = 5;
export const STRIKE_WINDOW_DAYS = 30;
export const SUSPENSION_DAYS = 30;

/** Llegada: el trabajador debe estar a esta distancia o menos del punto (el GPS no es exacto). */
export const ARRIVAL_MAX_METERS = 300;
export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MINUTES = 10;

export const PHOTO_KINDS = ['WORK', 'BUSINESS', 'COURSE'] as const;
export const MAX_PROVIDER_PHOTOS = 9;

/**
 * Saldo del trabajador (estilo recarga). Al cerrar cada trabajo se descuenta la comisión del
 * precio final; sin saldo no se puede cotizar.
 * - Fundadores (los primeros 500 aprobados): reciben $100 de regalo y pagan el 10 % mientras
 *   les dura ese regalo; cuando ya pagaron $100 de comisiones, pasan al 7 %.
 * - Los demás: 7 % desde el primer trabajo.
 */
export const COMMISSION_PCT_ENV = 'PRESENTE_COMMISSION_PCT';
export const DEFAULT_COMMISSION_PCT = 7;
export const PROMO_COMMISSION_PCT_ENV = 'PRESENTE_PROMO_COMMISSION_PCT';
export const DEFAULT_PROMO_COMMISSION_PCT = 10;
/** Regalo de bienvenida para los primeros trabajadores aprobados (fundadores). */
export const WELCOME_CREDIT_ENV = 'PRESENTE_WELCOME_CREDIT_MXN';
export const DEFAULT_WELCOME_CREDIT_MXN = 100;
/** Cuántos fundadores reciben el regalo (500; para abrir más: PRESENTE_WELCOME_LIMIT=600). */
export const WELCOME_LIMIT_ENV = 'PRESENTE_WELCOME_LIMIT';
export const DEFAULT_WELCOME_LIMIT = 500;
/**
 * Recomendar: cuando el recomendado ya está aprobado y hace su primera recarga, quien lo
 * recomendó gana un servicio sin comisión (hasta $50). Se acumulan. No cuenta recomendar a quien
 * ya había estado registrado ni a quien recibió el regalo de fundador.
 */
export const REFERRAL_FREE_MAX_MXN = 50;
export const MIN_TOPUP_MXN = 100;
export const MAX_TOPUP_MXN = 5_000;
/** Debajo de esto se le avisa que recargue pronto. */
export const LOW_BALANCE_MXN = 30;
/** Datos para que el trabajador transfiera su recarga (cuenta de Yalika). */
export const TOPUP_BANK_ENV = 'PRESENTE_TOPUP_BANK';
export const TOPUP_CLABE_ENV = 'PRESENTE_TOPUP_CLABE';
export const TOPUP_NAME_ENV = 'PRESENTE_TOPUP_NAME';

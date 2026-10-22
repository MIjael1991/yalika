'use client';

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import QRCode from 'qrcode';
import { heroArt } from '../s/[slug]/template-art';
import { PRESETS, suggestedSeason } from '../s/[slug]/template-presets';

export type SiteRecord = {
  id: string;
  name: string;
  slug: string;
  template: string;
  status: string;
  primaryColor: string | null;
  accentColor: string | null;
  backgroundType: string;
  backgroundValue: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroButtonText: string | null;
  heroButtonUrl: string | null;
  announcementText: string | null;
  whatsappPhone: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  extraLinkLabel: string | null;
  extraLinkUrl: string | null;
};

type ProductImage = {
  id: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
};

export type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  trackInventory: boolean;
  featured: boolean;
  status: string;
  category?: {
    id: string;
    name: string;
  } | null;
  images: ProductImage[];
  variants: Array<{
    id: string;
    name: string;
    sku: string | null;
    price: number | null;
    stock: number;
    status: string;
  }>;
};

type ProductVariantDraft = {
  name: string;
  stock: string;
};

type ProductOptionMode =
  | 'none'
  | 'clothing'
  | 'sizes'
  | 'custom';

type PromotionScope =
  | 'all'
  | 'selected_products';

export type PromotionRecord = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  discountValue: number | null;
  specialPrice: number | null;
  minimumPurchase: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  imageUrl: string | null;
  featured: boolean;
  status: string;
  startsAt: string;
  endsAt: string;
  scope?: string;
  products?: Array<{
    productId: string;
    product?: {
      id: string;
      name: string;
    };
  }>;
};

export type LoyaltyProgramRecord = {
  id: string;
  name: string;
  description: string | null;
  requiredVisits: number;
  rewardType: string;
  rewardDescription: string;
  rewardValidDays: number;
  status: string;
  startsAt: string;
  endsAt: string;
};

export type ScratchCampaignRecord = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  validDays: number;
  loyaltyProgramId: string;
  prizes: Array<{
    id: string;
    name: string;
    description: string | null;
    probabilityBasisPoints: number;
    stock: number | null;
    remaining: number | null;
    status: string;
  }>;
  _count: {
    attempts: number;
  };
};

type ScratchPrizeDraft = {
  name: string;
  probability: string;
  stock: string;
};

type ScratchAssistantDraft = {
  campaignName: string;
  validDays: number;
  prize: ScratchPrizeDraft;
  explanation: string;
  usedDefaultChance: boolean;
};

const spokenNumbers: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
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
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  cien: 100,
};

const spokenNumberPattern =
  '(?:\\d{1,3}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|cien)';

function normalizeAssistantText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function readSpokenNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return spokenNumbers[value];
}

function prepareScratchAssistantDraft(
  command: string,
  storeName: string,
): ScratchAssistantDraft | null {
  const lower = normalizeAssistantText(command);
  const isScratchRequest =
    lower.includes('raspadito') ||
    lower.includes('raspa y gana') ||
    (lower.includes('premio') &&
      (lower.includes('oportunidad') ||
        lower.includes('posibilidad')));

  if (!isScratchRequest) {
    return null;
  }

  const discountMatch =
    lower.match(
      /descuentos?(?:\s+(?:del?|de))?\s+(\d{1,3})\s*%/,
    ) ??
    lower.match(
      /(\d{1,3})\s*%\s+(?:de\s+)?descuento/,
    );
  const discount = discountMatch
    ? Number(discountMatch[1])
    : undefined;
  const stockMatch = lower.match(
    new RegExp(
      `\\b(${spokenNumberPattern})\\s+(?:premios?|descuentos?|regalos?|productos?|servicios?)\\b`,
    ),
  );
  const stock = readSpokenNumber(stockMatch?.[1]);
  const chanceMatch =
    lower.match(
      new RegExp(
        `(?:oportunidad|posibilidad|probabilidad)(?:\\s+de)?\\s+(${spokenNumberPattern})\\s*(?:%|por ciento)`,
      ),
    ) ??
    lower.match(
      new RegExp(
        `(${spokenNumberPattern})\\s*(?:%|por ciento)\\s+(?:de\\s+)?(?:oportunidad|posibilidad|probabilidad)`,
      ),
    );
  const requestedChance = readSpokenNumber(
    chanceMatch?.[1],
  );
  const validChance =
    requestedChance &&
    requestedChance >= 1 &&
    requestedChance <= 100
      ? requestedChance
      : 10;
  const explicitDays = lower.match(
    new RegExp(
      `(${spokenNumberPattern})\\s+dias?`,
    ),
  );
  const requestedDays = readSpokenNumber(
    explicitDays?.[1],
  );
  const validDays = requestedDays
    ? Math.min(Math.max(requestedDays, 1), 365)
    : lower.includes('esta semana') ||
        lower.includes('una semana')
      ? 7
      : lower.includes('este mes') ||
          lower.includes('un mes')
        ? 30
        : lower.includes('hoy')
          ? 1
          : 15;
  const prizeName = discount
    ? `${discount}% de descuento`
    : lower.includes('producto gratis')
      ? 'Producto gratis'
      : lower.includes('servicio gratis')
        ? 'Servicio gratis'
        : lower.includes('regalo')
          ? 'Regalo sorpresa'
          : 'Premio sorpresa';
  const safeStock =
    stock && stock >= 1
      ? Math.min(stock, 100000)
      : undefined;
  const campaignName = storeName.trim()
    ? `Raspadito de ${storeName.trim()}`
    : 'Raspadito sorpresa';

  return {
    campaignName,
    validDays,
    prize: {
      name: prizeName,
      probability: String(validChance),
      stock: safeStock ? String(safeStock) : '',
    },
    explanation: `${validChance} de cada 100 intentos pueden ganar ${prizeName.toLowerCase()}${safeStock ? `, hasta terminar los ${safeStock} premios` : ''}. El ganador tendrá ${validDays} ${validDays === 1 ? 'día' : 'días'} para usarlo.`,
    usedDefaultChance: requestedChance === undefined,
  };
}

type SiteForm = {
  name: string;
  slug: string;
  template: string;
  primaryColor: string;
  accentColor: string;
  backgroundType: string;
  backgroundValue: string;
  logoUrl: string;
  heroImageUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  heroButtonText: string;
  heroButtonUrl: string;
  announcementText: string;
  whatsappPhone: string;
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  extraLinkLabel: string;
  extraLinkUrl: string;
};

type StudioSection =
  | 'design'
  | 'products'
  | 'social'
  | 'promotions'
  | 'club';

type VoiceResultEvent = {
  results: ArrayLike<{
    0: {
      transcript: string;
    };
  }>;
};

type VoiceRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: VoiceResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

type VoiceRecognitionConstructor =
  new () => VoiceRecognition;

const templates = [
  {
    id: 'yaleka_cherry_nails',
    name: 'Cherry · Servicios',
    description: 'Página elegante de servicios, galería y contacto; sin POS público.',
    preview: 'from-pink-100 via-rose-200 to-fuchsia-300',
    accent: '#7b2148',
    background: '#fff8fa',
  },
  {
    id: 'yaleka_luna_boutique',
    name: 'Luna Boutique',
    description: 'Editorial claro para moda y WhatsApp.',
    preview: 'from-[#fff8f2] via-[#ead8c9] to-[#bb8365]',
    accent: '#a86645',
    background: '#f7f0ea',
  },
  {
    id: 'yaleka_prisma_papeleria',
    name: 'Prisma Papelería',
    description: 'Colorido y limpio para escolar, oficina y creatividad.',
    preview: 'from-sky-100 via-blue-300 to-yellow-200',
    accent: '#ffd80a',
    background: '#f7fbff',
  },
  {
    id: 'boutique_elegant',
    name: 'Boutique elegante',
    description:
      'Oscuro, fino y centrado en fotografías grandes.',
    preview:
      'from-stone-950 via-stone-900 to-amber-950',
    accent: '#d6b46a',
    background: '#0c0a09',
  },
  {
    id: 'social_vibrant',
    name: 'Moderno social',
    description:
      'Colorido, juvenil y pensado para promociones.',
    preview:
      'from-fuchsia-600 via-violet-600 to-orange-400',
    accent: '#facc15',
    background: '#581c87',
  },
  {
    id: 'minimal_catalog',
    name: 'Catálogo minimalista',
    description:
      'Claro, rápido y fácil para encontrar productos.',
    preview:
      'from-white via-slate-100 to-slate-300',
    accent: '#111827',
    background: '#f8fafc',
  },
  {
    id: 'artisan_warm',
    name: 'Local artesanal',
    description:
      'Cálido, cercano y con personalidad de negocio local.',
    preview:
      'from-orange-950 via-amber-900 to-rose-900',
    accent: '#fbbf24',
    background: '#451a03',
  },
  {
    id: 'punk_rock',
    name: 'Punk / Rock',
    description:
      'Contraste fuerte, actitud y energía para marcas alternativas.',
    preview:
      'from-black via-zinc-900 to-red-950',
    accent: '#ef4444',
    background: '#09090b',
  },
  {
    id: 'dark_neon',
    name: 'Dark neón',
    description:
      'Oscuro, moderno y brillante para experiencias nocturnas.',
    preview:
      'from-slate-950 via-violet-950 to-cyan-950',
    accent: '#22d3ee',
    background: '#020617',
  },
  {
    id: 'vacation_bright',
    name: 'Vacaciones',
    description:
      'Fresco, luminoso y alegre para temporadas y promociones.',
    preview:
      'from-sky-500 via-cyan-400 to-amber-300',
    accent: '#fbbf24',
    background: '#0369a1',
  },
  ...PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.label,
    description: preset.eyebrow,
    preview: 'from-slate-100 to-slate-300',
    accent: preset.c.accent,
    background: preset.c.bg,
  })),
];

const mainTemplateIds = new Set([
  'boutique_elegant',
  'social_vibrant',
  'minimal_catalog',
  'artisan_warm',
]);

const colorPalettes = [
  {
    name: 'Elegante',
    primary: '#160f14',
    accent: '#f5b8cf',
  },
  {
    name: 'Rock',
    primary: '#09090b',
    accent: '#ef4444',
  },
  {
    name: 'Dark neón',
    primary: '#020617',
    accent: '#22d3ee',
  },
  {
    name: 'Vacaciones',
    primary: '#0369a1',
    accent: '#fbbf24',
  },
  {
    name: 'Natural',
    primary: '#451a03',
    accent: '#fbbf24',
  },
];

const styleIdeas = [
  {
    id: 'punk',
    name: 'Punk / Rock',
    description: 'Negro, rojo y mucha actitud sin cambiar tu contenido.',
    template: 'punk_rock',
    primary: '#09090b',
    accent: '#ef4444',
    preview: 'from-black via-zinc-900 to-red-950',
    announcement: 'Nueva colección con actitud · Conoce nuestras piezas destacadas',
    months: [] as number[],
    keywords: ['punk', 'rock', 'alternativo'],
  },
  {
    id: 'dark',
    name: 'Dark neón',
    description: 'Oscuro y moderno con detalles brillantes.',
    template: 'dark_neon',
    primary: '#020617',
    accent: '#22d3ee',
    preview: 'from-slate-950 via-violet-950 to-cyan-950',
    announcement: 'Descubre la experiencia especial de esta temporada',
    months: [] as number[],
    keywords: ['dark', 'neon', 'nocturno'],
  },
  {
    id: 'vacation',
    name: 'Vacaciones',
    description: 'Colores frescos y alegres para temporadas de descanso.',
    template: 'vacation_bright',
    primary: '#0369a1',
    accent: '#fbbf24',
    preview: 'from-sky-500 via-cyan-400 to-amber-300',
    announcement: 'Temporada de vacaciones · Descubre nuestras novedades',
    months: [5, 6, 7],
    keywords: ['vacaciones', 'verano', 'playa'],
  },
  {
    id: 'christmas',
    name: 'Navidad',
    description: 'Elegante, cálido y preparado para regalos navideños.',
    template: 'boutique_elegant',
    primary: '#220b12',
    accent: '#f3d58b',
    preview: 'from-red-950 via-emerald-950 to-amber-200',
    announcement: 'Temporada navideña · Encuentra el regalo perfecto',
    months: [10, 11],
    keywords: ['navidad', 'navideno', 'navidena', 'diciembre'],
  },
  {
    id: 'halloween',
    name: 'Halloween',
    description: 'Oscuro, divertido y con detalles naranjas de temporada.',
    template: 'dark_neon',
    primary: '#12071b',
    accent: '#fb923c',
    preview: 'from-black via-purple-950 to-orange-600',
    announcement: 'Especial de Halloween · Sorpresas por tiempo limitado',
    months: [9],
    keywords: ['halloween', 'noche de brujas', 'terror'],
  },
  {
    id: 'patriotic',
    name: 'Mes Patrio',
    description: 'Una propuesta mexicana sobria, festiva y profesional.',
    template: 'artisan_warm',
    primary: '#064e3b',
    accent: '#f4d06f',
    preview: 'from-emerald-900 via-white to-red-800',
    announcement: 'Celebremos México · Conoce nuestras promociones especiales',
    months: [8],
    keywords: ['mes patrio', 'mexicano', 'mexicana', 'independencia'],
  },
  {
    id: 'autumn',
    name: 'Otoño',
    description: 'Tonos cálidos para novedades, moda y servicios.',
    template: 'artisan_warm',
    primary: '#431407',
    accent: '#f59e0b',
    preview: 'from-orange-950 via-amber-800 to-rose-900',
    announcement: 'Llegó el otoño · Descubre nuestras novedades',
    months: [9, 10],
    keywords: ['otono', 'otonial'],
  },
];

const pageExamples = [
  {
    id: 'luna-nails',
    kind: 'Uñas · lujo',
    name: 'Luna Nail Atelier',
    template: 'boutique_elegant',
    primaryColor: '#160f14',
    accentColor: '#f5b8cf',
    preview:
      'from-[#160f14] via-[#4b2638] to-[#b76e79]',
    title: 'Manos que hablan por ti',
    subtitle:
      'Diseños personalizados, gel, manicure y detalles que convierten tu cita en un momento especial.',
    button: 'Reservar mi cita',
    promotionTitle:
      'Primera cita: 15% de descuento',
    promotionDescription:
      'Muestra esta promoción al reservar tu primera aplicación.',
    promotionValue: '15',
  },
  {
    id: 'pop-nails',
    kind: 'Uñas · juvenil',
    name: 'Cherry Pop Nails',
    template: 'social_vibrant',
    primaryColor: '#681a72',
    accentColor: '#ffe45e',
    preview:
      'from-fuchsia-600 via-violet-600 to-orange-400',
    title: 'Color, brillo y mucha actitud',
    subtitle:
      'Inspírate con nuestros sets, elige tu diseño y agenda fácilmente desde tu celular.',
    button: 'Quiero este diseño',
    promotionTitle:
      'Martes de amigas: 20% de descuento',
    promotionDescription:
      'Vengan dos amigas y reciban 20% en diseños seleccionados.',
    promotionValue: '20',
  },
  {
    id: 'aura-boutique',
    kind: 'Boutique · editorial',
    name: 'Aura Boutique',
    template: 'minimal_catalog',
    primaryColor: '#f7f3ee',
    accentColor: '#252525',
    preview:
      'from-[#fffaf5] via-[#eadfd5] to-[#c8b5a5]',
    title: 'Piezas elegidas para tu estilo',
    subtitle:
      'Novedades, combinaciones y prendas especiales en un catálogo limpio y fácil de comprar.',
    button: 'Ver nueva colección',
    promotionTitle:
      'Nueva colección: 10% de bienvenida',
    promotionDescription:
      'Regístrate en nuestro Club QR y disfruta tu descuento de bienvenida.',
    promotionValue: '10',
  },
  {
    id: 'alma-boutique',
    kind: 'Boutique · cálida',
    name: 'Alma Local Boutique',
    template: 'artisan_warm',
    primaryColor: '#431f18',
    accentColor: '#f4c878',
    preview:
      'from-[#431f18] via-[#8b4936] to-[#d39162]',
    title: 'Detalles con historia, estilo con alma',
    subtitle:
      'Ropa y accesorios seleccionados con cariño para acompañarte todos los días.',
    button: 'Descubrir favoritos',
    promotionTitle:
      'Fin de semana: 15% en accesorios',
    promotionDescription:
      'Promoción válida en accesorios seleccionados hasta agotar existencias.',
    promotionValue: '15',
  },
  {
    id: 'voltaje-rock',
    kind: 'Moda · punk rock',
    name: 'Voltaje Store',
    template: 'punk_rock',
    primaryColor: '#09090b',
    accentColor: '#ef4444',
    preview:
      'from-black via-zinc-900 to-red-950',
    title: 'Viste fuerte. Vive auténtico.',
    subtitle:
      'Prendas, accesorios y piezas con actitud para crear tu propio estilo.',
    button: 'Ver colección',
    promotionTitle:
      'Noche de estreno: 15% de descuento',
    promotionDescription:
      'Promoción especial en prendas seleccionadas hasta agotar existencias.',
    promotionValue: '15',
  },
  {
    id: 'neon-studio',
    kind: 'Estudio · dark',
    name: 'Neon Dark Studio',
    template: 'dark_neon',
    primaryColor: '#020617',
    accentColor: '#22d3ee',
    preview:
      'from-slate-950 via-violet-950 to-cyan-950',
    title: 'Ideas que brillan en la oscuridad',
    subtitle:
      'Una experiencia visual moderna para servicios, eventos y marcas creativas.',
    button: 'Conocer servicios',
    promotionTitle:
      'Experiencia especial: 10% de descuento',
    promotionDescription:
      'Reserva durante esta semana y recibe el beneficio publicado.',
    promotionValue: '10',
  },
  {
    id: 'verano-vivo',
    kind: 'Temporada · vacaciones',
    name: 'Verano Vivo',
    template: 'vacation_bright',
    primaryColor: '#0369a1',
    accentColor: '#fbbf24',
    preview:
      'from-sky-500 via-cyan-400 to-amber-300',
    title: 'Tu temporada comienza aquí',
    subtitle:
      'Novedades frescas, colores alegres y promociones para disfrutar las vacaciones.',
    button: 'Descubrir temporada',
    promotionTitle:
      'Vacaciones: 20% en seleccionados',
    promotionDescription:
      'Beneficio de temporada válido hasta agotar existencias.',
    promotionValue: '20',
  },
];

function siteToForm(
  site?: SiteRecord | null,
): SiteForm {
  return {
    name: site?.name ?? '',
    slug: site?.slug ?? '',
    template:
      site?.template ?? 'boutique_elegant',
    primaryColor:
      site?.primaryColor ?? '#0c0a09',
    accentColor:
      site?.accentColor ?? '#d6b46a',
    backgroundType:
      site?.backgroundType ?? 'color',
    backgroundValue:
      site?.backgroundValue ?? '#0c0a09',
    logoUrl: site?.logoUrl ?? '',
    heroImageUrl: site?.heroImageUrl ?? '',
    heroTitle: site?.heroTitle ?? '',
    heroSubtitle: site?.heroSubtitle ?? '',
    heroButtonText:
      site?.heroButtonText ?? 'Ver catálogo',
    heroButtonUrl:
      site?.heroButtonUrl ?? '#catalog',
    announcementText:
      site?.announcementText ?? '',
    whatsappPhone:
      site?.whatsappPhone ?? '',
    facebookUrl: site?.facebookUrl ?? '',
    instagramUrl: site?.instagramUrl ?? '',
    tiktokUrl: site?.tiktokUrl ?? '',
    extraLinkLabel:
      site?.extraLinkLabel ?? '',
    extraLinkUrl: site?.extraLinkUrl ?? '',
  };
}

function toSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function localDateTime(
  date: Date,
) {
  const offset =
    date.getTimezoneOffset() * 60_000;

  return new Date(
    date.getTime() - offset,
  )
    .toISOString()
    .slice(0, 16);
}

function getErrorMessage(
  error: unknown,
) {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación';
}

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(
    `/api/yalika/${path}`,
    {
      ...init,
      headers: {
        ...(init?.body instanceof FormData
          ? {}
          : {
              'Content-Type':
                'application/json',
            }),
        ...init?.headers,
      },
    },
  );

  if (!response.ok) {
    const data = (await response
      .json()
      .catch(() => null)) as {
        message?: string | string[];
      } | null;
    const message = data?.message;

    throw new Error(
      Array.isArray(message)
        ? message.join('. ')
        : message ??
            'Yalika no pudo completar la operación',
    );
  }

  return (await response.json()) as T;
}

async function uploadImage(file: File) {
  const body = new FormData();
  body.append('file', file);

  return apiRequest<{
    url: string;
  }>('media/image', {
    method: 'POST',
    body,
  });
}

function VoiceButton({
  target,
  listening,
  onListen,
}: {
  target: string;
  listening: string;
  onListen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onListen}
      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${
        listening === target
          ? 'border-red-300 bg-red-400/10 text-red-200'
          : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20'
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          listening === target
            ? 'animate-pulse bg-red-400'
            : 'bg-cyan-400'
        }`}
      />
      {listening === target
        ? 'Escuchando…'
        : 'Dictar'}
    </button>
  );
}

export function SiteBuilderWorkspace({
  initialCompanyId,
  initialSite,
  initialProducts,
  initialPromotions,
  initialLoyaltyPrograms,
  initialScratchCampaign,
  initialAuthorizedUserId,
}: {
  initialCompanyId: string;
  initialSite: SiteRecord | null;
  initialProducts: CatalogProduct[];
  initialPromotions: PromotionRecord[];
  initialLoyaltyPrograms: LoyaltyProgramRecord[];
  initialScratchCampaign: ScratchCampaignRecord | null;
  initialAuthorizedUserId: string;
}) {
  const [companyId, setCompanyId] =
    useState(initialCompanyId);
  const [companyDraft, setCompanyDraft] =
    useState(initialCompanyId);
  const [site, setSite] =
    useState(initialSite);
  const [siteForm, setSiteForm] =
    useState(() => siteToForm(initialSite));
  const [products, setProducts] =
    useState(
      initialProducts.filter(
        (product) =>
          product.status === 'active',
      ),
    );
  const promotionCategories = useMemo(() => {
    const categories = new Map<
      string,
      { id: string; name: string; productIds: string[] }
    >();

    for (const product of products) {
      if (!product.category) {
        continue;
      }

      const current = categories.get(product.category.id);

      if (current) {
        current.productIds.push(product.id);
      } else {
        categories.set(product.category.id, {
          id: product.category.id,
          name: product.category.name,
          productIds: [product.id],
        });
      }
    }

    return Array.from(categories.values()).sort((left, right) =>
      left.name.localeCompare(right.name, 'es'),
    );
  }, [products]);
  const [promotions, setPromotions] =
    useState(initialPromotions);
  const [loyaltyPrograms, setLoyaltyPrograms] =
    useState(initialLoyaltyPrograms);
  const [scratchCampaign, setScratchCampaign] =
    useState(initialScratchCampaign);
  const [logoFile, setLogoFile] =
    useState<File>();
  const [heroFile, setHeroFile] =
    useState<File>();
  const [savingSite, setSavingSite] =
    useState(false);
  const [siteMessage, setSiteMessage] =
    useState('');
  const [siteError, setSiteError] =
    useState('');
  const [listening, setListening] =
    useState('');
  const [showAssistant, setShowAssistant] =
    useState(false);
  const [assistantText, setAssistantText] =
    useState('');
  const [assistantMessage, setAssistantMessage] =
    useState('');
  const [assistantScratchPreview, setAssistantScratchPreview] =
    useState<ScratchAssistantDraft>();
  const [activeStudioSection, setActiveStudioSection] =
    useState<StudioSection>('design');
  const [showAllStyleIdeas, setShowAllStyleIdeas] =
    useState(false);
  const [showProductForm, setShowProductForm] =
    useState(false);
  const [productName, setProductName] =
    useState('');
  const [productPrice, setProductPrice] =
    useState('');
  const [productStock, setProductStock] =
    useState('1');
  const [productOptionMode, setProductOptionMode] =
    useState<ProductOptionMode>('none');
  const [productVariants, setProductVariants] = useState<
    ProductVariantDraft[]
  >([]);
  const [productSku, setProductSku] =
    useState('');
  const [productFile, setProductFile] =
    useState<File>();
  const [savingProduct, setSavingProduct] =
    useState(false);
  const [productError, setProductError] =
    useState('');
  const [editingProduct, setEditingProduct] =
    useState<CatalogProduct>();
  const [editProductName, setEditProductName] =
    useState('');
  const [editProductDescription, setEditProductDescription] =
    useState('');
  const [editProductPrice, setEditProductPrice] =
    useState('');
  const [editProductStock, setEditProductStock] =
    useState('');
  const [editProductSku, setEditProductSku] =
    useState('');
  const [savingProductEdit, setSavingProductEdit] =
    useState(false);
  const [photoProduct, setPhotoProduct] =
    useState<CatalogProduct>();
  const [savingProductPhotos, setSavingProductPhotos] =
    useState(false);
  const [photoError, setPhotoError] =
    useState('');
  const [photoMessage, setPhotoMessage] =
    useState('');
  const [variantProduct, setVariantProduct] =
    useState<CatalogProduct>();
  const [variantStocks, setVariantStocks] = useState<
    Record<string, string>
  >({});
  const [variantNames, setVariantNames] = useState<
    Record<string, string>
  >({});
  const [variantPrices, setVariantPrices] = useState<
    Record<string, string>
  >({});
  const [newVariantName, setNewVariantName] =
    useState('');
  const [newVariantStock, setNewVariantStock] =
    useState('0');
  const [newVariantPrice, setNewVariantPrice] =
    useState('');
  const [savingVariant, setSavingVariant] =
    useState(false);
  const [variantError, setVariantError] =
    useState('');
  const [variantMessage, setVariantMessage] =
    useState('');
  const [promotionTitle, setPromotionTitle] =
    useState('');
  const [promotionDescription, setPromotionDescription] =
    useState('');
  const [promotionType, setPromotionType] =
    useState('percentage');
  const [promotionValue, setPromotionValue] =
    useState('10');
  const [promotionMinimumPurchase, setPromotionMinimumPurchase] =
    useState('');
  const [promotionBuyQuantity, setPromotionBuyQuantity] =
    useState('2');
  const [promotionGetQuantity, setPromotionGetQuantity] =
    useState('1');
  const [promotionScope, setPromotionScope] =
    useState<PromotionScope>('all');
  const [promotionProductIds, setPromotionProductIds] =
    useState<string[]>([]);
  const [changingPromotionId, setChangingPromotionId] =
    useState('');
  const [promotionStartsAt, setPromotionStartsAt] =
    useState(() => localDateTime(new Date()));
  const [promotionEndsAt, setPromotionEndsAt] =
    useState(() =>
      localDateTime(
        new Date(
          Date.now() + 7 * 86_400_000,
        ),
      ),
    );
  const [promotionFile, setPromotionFile] =
    useState<File>();
  const [savingPromotion, setSavingPromotion] =
    useState(false);
  const [promotionError, setPromotionError] =
    useState('');
  const [promotionMessage, setPromotionMessage] =
    useState('');
  const [selectedExample, setSelectedExample] =
    useState('');
  const [loyaltyName, setLoyaltyName] =
    useState('Club de visitas');
  const [requiredVisits, setRequiredVisits] =
    useState('5');
  const [rewardDescription, setRewardDescription] =
    useState('Un servicio o producto gratis');
  const [savingLoyalty, setSavingLoyalty] =
    useState(false);
  const [loyaltyMessage, setLoyaltyMessage] =
    useState('');
  const [loyaltyError, setLoyaltyError] =
    useState('');
  const [scratchName, setScratchName] =
    useState('Raspadito sorpresa');
  const [scratchValidDays, setScratchValidDays] =
    useState('15');
  const [scratchPrizes, setScratchPrizes] = useState<
    ScratchPrizeDraft[]
  >([
    {
      name: '10% de descuento',
      probability: '20',
      stock: '20',
    },
    {
      name: 'Producto gratis',
      probability: '5',
      stock: '5',
    },
  ]);
  const [savingScratch, setSavingScratch] =
    useState(false);
  const [scratchMessage, setScratchMessage] =
    useState('');
  const [scratchError, setScratchError] =
    useState('');
  const [redeemCode, setRedeemCode] =
    useState('');
  const [redeemingScratch, setRedeemingScratch] =
    useState(false);
  const [redeemMessage, setRedeemMessage] =
    useState('');
  const [redeemError, setRedeemError] =
    useState('');
  const [qrCode, setQrCode] = useState({
    slug: '',
    dataUrl: '',
  });

  const activeTemplate = useMemo(
    () =>
      templates.find(
        (template) =>
          template.id === siteForm.template,
      ) ?? templates[0],
    [siteForm.template],
  );
  const seasonalStyleIdea = useMemo(() => {
    const currentMonth = new Date().getMonth();

    return (
      styleIdeas.find((idea) =>
        idea.months.includes(currentMonth),
      ) ?? styleIdeas[0]
    );
  }, []);
  const activeLoyaltyProgram = useMemo(
    () =>
      loyaltyPrograms.find(
        (program) => program.status === 'active',
      ) ?? null,
    [loyaltyPrograms],
  );
  const qrDataUrl =
    site?.slug &&
    activeLoyaltyProgram &&
    qrCode.slug === site.slug
      ? qrCode.dataUrl
      : '';

  useEffect(() => {
    const selectSectionFromHash = () => {
      const section = window.location.hash.slice(1) as StudioSection;

      if (['design', 'products', 'social', 'promotions', 'club'].includes(section)) {
        setActiveStudioSection(section);
      }
    };

    selectSectionFromHash();
    window.addEventListener('hashchange', selectSectionFromHash);

    return () => window.removeEventListener('hashchange', selectSectionFromHash);
  }, []);

  useEffect(() => {
    if (
      !site?.slug ||
      site.status !== 'published' ||
      !activeLoyaltyProgram
    ) {
      return;
    }

    const clubUrl = `${window.location.origin}/r/${site.slug}`;
    let cancelled = false;

    void QRCode.toDataURL(clubUrl, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#07111f',
        light: '#ffffff',
      },
    }).then((dataUrl) => {
      if (!cancelled) {
        setQrCode({
          slug: site.slug,
          dataUrl,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [site?.slug, site?.status, activeLoyaltyProgram]);

  function updateSiteForm(
    key: keyof SiteForm,
    value: string,
  ) {
    setSiteForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function startDictation(
    target: string,
    onText: (text: string) => void,
  ) {
    const speechWindow =
      window as typeof window & {
        SpeechRecognition?: VoiceRecognitionConstructor;
        webkitSpeechRecognition?: VoiceRecognitionConstructor;
      };
    const Recognition =
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setSiteError(
        'Este navegador no permite dictado. Puedes escribir normalmente.',
      );
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'es-MX';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const text =
        event.results[0]?.[0]?.transcript?.trim();

      if (text) {
        onText(text);
      }
    };
    recognition.onerror = () => {
      setSiteError(
        'No pude escuchar con claridad. Inténtalo otra vez.',
      );
    };
    recognition.onend = () => {
      setListening('');
    };
    setListening(target);
    recognition.start();
  }

  async function connectCompany(
    event: FormEvent,
  ) {
    event.preventDefault();
    const nextCompanyId =
      companyDraft.trim();

    if (!nextCompanyId) {
      return;
    }

    setSiteError('');

    try {
      const [
        nextProducts,
        nextPromotions,
        nextLoyaltyPrograms,
        nextScratchCampaign,
      ] =
        await Promise.all([
          apiRequest<CatalogProduct[]>(
            `catalog/product/company/${nextCompanyId}`,
          ),
          apiRequest<PromotionRecord[]>(
            `promotion/company/${nextCompanyId}`,
          ),
          apiRequest<LoyaltyProgramRecord[]>(
            `loyalty-program/company/${nextCompanyId}`,
          ),
          apiRequest<ScratchCampaignRecord | null>(
            `scratch/company/${nextCompanyId}`,
          ).catch(() => null),
        ]);
      let nextSite: SiteRecord | null = null;

      try {
        nextSite = await apiRequest<SiteRecord>(
          `site/company/${nextCompanyId}`,
        );
      } catch {
        nextSite = null;
      }

      setCompanyId(nextCompanyId);
      setProducts(
        nextProducts.filter(
          (product) =>
            product.status === 'active',
        ),
      );
      setPromotions(nextPromotions);
      setLoyaltyPrograms(
        nextLoyaltyPrograms,
      );
      setScratchCampaign(nextScratchCampaign);
      setSite(nextSite);
      setSiteForm(siteToForm(nextSite));
    } catch (error) {
      setSiteError(
        getErrorMessage(error),
      );
    }
  }

  function selectTemplate(templateId: string) {
    const selected = templates.find(
      (template) =>
        template.id === templateId,
    );

    if (!selected) {
      return;
    }

    setSiteForm((current) => ({
      ...current,
      template: selected.id,
      primaryColor: selected.background,
      accentColor: selected.accent,
      backgroundValue: selected.background,
    }));
  }

  function applyStyleIdea(
    idea: (typeof styleIdeas)[number],
  ) {
    setSiteForm((current) => ({
      ...current,
      template: idea.template,
      primaryColor: idea.primary,
      accentColor: idea.accent,
      backgroundType: 'color',
      backgroundValue: idea.primary,
      announcementText:
        current.announcementText ||
        idea.announcement,
    }));
    setSelectedExample('');
    setSiteMessage(
      `Yalika preparó el estilo ${idea.name}. Revísalo antes de guardar o publicar.`,
    );
    setSiteError('');
  }

  function applyPageExample(
    example: (typeof pageExamples)[number],
  ) {
    setSelectedExample(example.id);
    setSiteForm((current) => ({
      ...current,
      name: example.name,
      slug: toSlug(example.name),
      template: example.template,
      primaryColor: example.primaryColor,
      accentColor: example.accentColor,
      backgroundType: 'color',
      backgroundValue: example.primaryColor,
      heroTitle: example.title,
      heroSubtitle: example.subtitle,
      heroButtonText: example.button,
      heroButtonUrl: '#catalog',
    }));
    setPromotionTitle(example.promotionTitle);
    setPromotionDescription(
      example.promotionDescription,
    );
    setPromotionType('percentage');
    setPromotionValue(example.promotionValue);
    setSiteMessage(
      'Ejemplo preparado. Puedes cambiar cualquier texto, color o fotografía antes de publicar.',
    );
    setSiteError('');
  }

  function applyAssistantCommand() {
    const command = assistantText.trim();
    const lower = normalizeAssistantText(command);

    if (!command) {
      setAssistantMessage(
        'Dime qué quieres preparar.',
      );
      return;
    }

    const preparedScratch =
      prepareScratchAssistantDraft(
        command,
        siteForm.name,
      );

    if (preparedScratch) {
      setScratchName(
        preparedScratch.campaignName,
      );
      setScratchValidDays(
        String(preparedScratch.validDays),
      );
      setScratchPrizes([
        preparedScratch.prize,
      ]);
      setScratchError('');
      setScratchMessage(
        'Yalika preparó esta propuesta. Revísala y presiona Activar solamente si estás de acuerdo.',
      );
      setAssistantScratchPreview(
        preparedScratch,
      );
      setAssistantMessage(
        preparedScratch.usedDefaultChance
          ? 'Preparé el raspadito con una oportunidad sugerida de 10 de cada 100. Puedes cambiarla antes de activarlo.'
          : 'Preparé el raspadito con tus indicaciones. No se ha activado todavía.',
      );
      return;
    }

    setAssistantScratchPreview(undefined);

    const requestedStyle = styleIdeas.find((idea) =>
      idea.keywords.some((keyword) =>
        lower.includes(keyword),
      ),
    );

    if (requestedStyle) {
      applyStyleIdea(requestedStyle);
      setAssistantMessage(
        `Preparé el estilo ${requestedStyle.name}. Puedes revisarlo antes de publicar.`,
      );
    } else if (
      lower.includes('elegante') ||
      lower.includes('lujo')
    ) {
      selectTemplate('boutique_elegant');
      setAssistantMessage(
        'Seleccioné Boutique elegante.',
      );
    } else if (
      lower.includes('social') ||
      lower.includes('colorido') ||
      lower.includes('juvenil')
    ) {
      selectTemplate('social_vibrant');
      setAssistantMessage(
        'Seleccioné Moderno social.',
      );
    } else if (
      lower.includes('minimal') ||
      lower.includes('limpio') ||
      lower.includes('claro')
    ) {
      selectTemplate('minimal_catalog');
      setAssistantMessage(
        'Seleccioné Catálogo minimalista.',
      );
    } else if (
      lower.includes('artesanal') ||
      lower.includes('cálido') ||
      lower.includes('calido') ||
      lower.includes('local')
    ) {
      selectTemplate('artisan_warm');
      setAssistantMessage(
        'Seleccioné Local artesanal.',
      );
    }

    const nameMatch = command.match(
      /(?:mi tienda se llama|nombre de (?:mi )?tienda(?: es)?|la tienda se llama)\s+(.+)/i,
    );

    if (nameMatch?.[1]) {
      const name = nameMatch[1]
        .replace(/[.!]+$/, '')
        .trim();
      setSiteForm((current) => ({
        ...current,
        name,
        slug: toSlug(name),
      }));
      setAssistantMessage(
        `Preparé el nombre “${name}”.`,
      );
    }

    if (
      lower.includes('promoción') ||
      lower.includes('promocion') ||
      lower.includes('oferta') ||
      lower.includes('descuento')
    ) {
      const percentage = lower.match(
        /(\d{1,3})\s*(?:%|por ciento)/,
      );
      setPromotionTitle(command);
      setPromotionDescription(command);

      if (percentage?.[1]) {
        setPromotionType('percentage');
        setPromotionValue(percentage[1]);
      }

      setAssistantMessage(
        'Preparé la promoción. Revisa fechas y producto antes de publicarla.',
      );
    } else if (!nameMatch) {
      updateSiteForm(
        'heroSubtitle',
        command,
      );

      if (
        !requestedStyle &&
        !lower.includes('elegante') &&
        !lower.includes('social') &&
        !lower.includes('colorido') &&
        !lower.includes('juvenil') &&
        !lower.includes('minimal') &&
        !lower.includes('limpio') &&
        !lower.includes('claro') &&
        !lower.includes('artesanal') &&
        !lower.includes('cálido') &&
        !lower.includes('calido') &&
        !lower.includes('local')
      ) {
        setAssistantMessage(
          'Usé tu mensaje como presentación de la tienda.',
        );
      }
    }
  }

  async function saveSite(publish: boolean) {
    if (site?.status === 'published' && !publish) {
      setSiteError('La tienda ya está publicada. El borrador separado del diseño general aún no está disponible. Usa Guardar y publicar y confirma los cambios.');
      return;
    }
    if (site?.status === 'published' && publish && !window.confirm('Estos cambios serán visibles inmediatamente en tu tienda publicada. ¿Confirmas?')) {
      return;
    }
    if (!companyId) {
      setSiteError(
        'Primero conecta la empresa.',
      );
      return;
    }

    if (!siteForm.name.trim()) {
      setSiteError(
        'Escribe el nombre de la tienda.',
      );
      return;
    }

    setSavingSite(true);
    setSiteError('');
    setSiteMessage('');

    try {
      const [logoUpload, heroUpload] =
        await Promise.all([
          logoFile
            ? uploadImage(logoFile)
            : Promise.resolve(null),
          heroFile
            ? uploadImage(heroFile)
            : Promise.resolve(null),
        ]);
      const payload = {
        ...siteForm,
        name: siteForm.name.trim(),
        slug:
          siteForm.slug ||
          toSlug(siteForm.name),
        logoUrl:
          logoUpload?.url ??
          (siteForm.logoUrl ||
            undefined),
        heroImageUrl:
          heroUpload?.url ??
          (siteForm.heroImageUrl ||
            undefined),
        heroTitle:
          siteForm.heroTitle ||
          siteForm.name,
        heroSubtitle:
          siteForm.heroSubtitle ||
          undefined,
        heroButtonText:
          siteForm.heroButtonText ||
          undefined,
        heroButtonUrl:
          siteForm.heroButtonUrl ||
          undefined,
      };
      let savedSite: SiteRecord;
      let siteToUpdate = site;

      if (!siteToUpdate) {
        try {
          siteToUpdate =
            await apiRequest<SiteRecord>(
              `site/company/${companyId}`,
            );
        } catch {
          siteToUpdate = null;
        }
      }

      if (siteToUpdate) {
        savedSite = await apiRequest<SiteRecord>(
          `site/${siteToUpdate.id}`,
          {
            method: 'PATCH',
            headers: publish ? { 'x-yalika-confirm-live-update': 'yes' } : undefined,
            body: JSON.stringify(payload),
          },
        );
      } else {
        savedSite = await apiRequest<SiteRecord>(
          'site',
          {
            method: 'POST',
            body: JSON.stringify({
              ...payload,
              companyId,
            }),
          },
        );
      }

      if (publish) {
        savedSite = await apiRequest<SiteRecord>(
          `site/${savedSite.id}/publish`,
          {
            method: 'POST',
          },
        );
      }

      setSite(savedSite);
      setSiteForm(siteToForm(savedSite));
      setLogoFile(undefined);
      setHeroFile(undefined);
      setSiteMessage(
        publish
          ? 'Tu tienda quedó publicada.'
          : 'Diseño guardado como borrador.',
      );
    } catch (error) {
      setSiteError(
        getErrorMessage(error),
      );
    } finally {
      setSavingSite(false);
    }
  }

  async function refreshProducts() {
    const nextProducts =
      await apiRequest<CatalogProduct[]>(
        `catalog/product/company/${companyId}`,
      );
    const activeProducts = nextProducts.filter(
      (product) => product.status === 'active',
    );
    setProducts(activeProducts);
    return activeProducts;
  }

  function openProductEditor(product: CatalogProduct) {
    setEditingProduct(product);
    setEditProductName(product.name);
    setEditProductDescription(
      product.description ?? '',
    );
    setEditProductPrice(String(product.price));
    setEditProductStock(String(product.stock));
    setEditProductSku(product.sku ?? '');
    setProductError('');
  }

  function openPhotoManager(product: CatalogProduct) {
    setPhotoProduct(product);
    setPhotoError('');
    setPhotoMessage('');
  }

  async function refreshPhotoProduct(productId: string) {
    const activeProducts = await refreshProducts();
    const updated = activeProducts.find(
      (product) => product.id === productId,
    );

    if (updated) {
      setPhotoProduct(updated);
    } else {
      setPhotoProduct(undefined);
    }
  }

  async function addProductPhotos(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);

    if (!photoProduct || files.length === 0) {
      return;
    }

    const availableSpaces = Math.max(
      8 - photoProduct.images.length,
      0,
    );

    if (availableSpaces === 0) {
      setPhotoError(
        'Este producto ya tiene 8 fotografías. Quita una antes de agregar otra.',
      );
      event.target.value = '';
      return;
    }

    if (files.length > availableSpaces) {
      setPhotoError(
        `Puedes agregar ${availableSpaces} ${availableSpaces === 1 ? 'fotografía más' : 'fotografías más'}.`,
      );
      event.target.value = '';
      return;
    }

    setSavingProductPhotos(true);
    setPhotoError('');
    setPhotoMessage('');
    let uploadedCount = 0;

    try {
      for (const [index, file] of files.entries()) {
        const uploaded = await uploadImage(file);
        await apiRequest(
          `catalog/product/${photoProduct.id}/image`,
          {
            method: 'POST',
            body: JSON.stringify({
              url: uploaded.url,
              altText: photoProduct.name,
              sortOrder:
                photoProduct.images.length + index,
              isPrimary:
                photoProduct.images.length === 0 &&
                index === 0,
            }),
          },
        );
        uploadedCount += 1;
      }

      await refreshPhotoProduct(photoProduct.id);
      setPhotoMessage(
        files.length === 1
          ? 'Fotografía agregada correctamente.'
          : `${files.length} fotografías agregadas correctamente.`,
      );
    } catch (error) {
      if (uploadedCount > 0) {
        await refreshPhotoProduct(photoProduct.id);
      }
      setPhotoError(getErrorMessage(error));
    } finally {
      setSavingProductPhotos(false);
      event.target.value = '';
    }
  }

  async function makeProductPhotoPrimary(
    imageId: string,
  ) {
    if (!photoProduct) {
      return;
    }

    setSavingProductPhotos(true);
    setPhotoError('');
    setPhotoMessage('');

    try {
      await apiRequest(
        `catalog/product/${photoProduct.id}/image/${imageId}/primary`,
        { method: 'PATCH' },
      );
      await refreshPhotoProduct(photoProduct.id);
      setPhotoMessage(
        'La fotografía principal fue actualizada.',
      );
    } catch (error) {
      setPhotoError(getErrorMessage(error));
    } finally {
      setSavingProductPhotos(false);
    }
  }

  async function removeProductPhoto(imageId: string) {
    if (!photoProduct) {
      return;
    }

    const confirmed = window.confirm(
      '¿Quieres quitar esta fotografía del producto?',
    );

    if (!confirmed) {
      return;
    }

    setSavingProductPhotos(true);
    setPhotoError('');
    setPhotoMessage('');

    try {
      await apiRequest(
        `catalog/product/${photoProduct.id}/image/${imageId}`,
        { method: 'DELETE' },
      );
      await refreshPhotoProduct(photoProduct.id);
      setPhotoMessage('Fotografía eliminada.');
    } catch (error) {
      setPhotoError(getErrorMessage(error));
    } finally {
      setSavingProductPhotos(false);
    }
  }

  async function saveProductEdit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!editingProduct) {
      return;
    }

    const price = Number(editProductPrice);
    const stock = Number(editProductStock);

    if (!editProductName.trim()) {
      setProductError(
        'Escribe el nombre del producto.',
      );
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setProductError('Escribe un precio válido.');
      return;
    }

    if (
      editingProduct.variants.length === 0 &&
      (!Number.isInteger(stock) || stock < 0)
    ) {
      setProductError(
        'La existencia debe ser un número desde cero.',
      );
      return;
    }

    setSavingProductEdit(true);
    setProductError('');

    try {
      await apiRequest(
        `catalog/product/${editingProduct.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editProductName.trim(),
            description:
              editProductDescription.trim(),
            price,
            sku: editProductSku.trim(),
            stock:
              editingProduct.variants.length === 0
                ? stock
                : undefined,
          }),
        },
      );
      await refreshProducts();
      setEditingProduct(undefined);
      setSiteMessage(
        'Producto actualizado correctamente.',
      );
    } catch (error) {
      setProductError(getErrorMessage(error));
    } finally {
      setSavingProductEdit(false);
    }
  }

  function selectProductOptionMode(
    mode: ProductOptionMode,
  ) {
    setProductOptionMode(mode);

    if (mode === 'none') {
      setProductVariants([]);
      return;
    }

    if (mode === 'clothing') {
      setProductVariants(
        ['Chica', 'Mediana', 'Grande', 'Extra grande'].map(
          (name) => ({ name, stock: '0' }),
        ),
      );
      return;
    }

    if (mode === 'sizes') {
      setProductVariants(
        ['Chico', 'Mediano', 'Grande'].map((name) => ({
          name,
          stock: '0',
        })),
      );
      return;
    }

    setProductVariants([{ name: '', stock: '0' }]);
  }

  function updateProductVariant(
    index: number,
    field: keyof ProductVariantDraft,
    value: string,
  ) {
    setProductVariants((current) =>
      current.map((variant, variantIndex) =>
        variantIndex === index
          ? { ...variant, [field]: value }
          : variant,
      ),
    );
  }

  function openVariantEditor(product: CatalogProduct) {
    setVariantProduct(product);
    setVariantStocks(
      Object.fromEntries(
        product.variants.map((variant) => [
          variant.id,
          String(variant.stock),
        ]),
      ),
    );
    setVariantNames(
      Object.fromEntries(
        product.variants.map((variant) => [
          variant.id,
          variant.name,
        ]),
      ),
    );
    setVariantPrices(
      Object.fromEntries(
        product.variants.map((variant) => [
          variant.id,
          variant.price === null ? '' : String(variant.price),
        ]),
      ),
    );
    setNewVariantName('');
    setNewVariantStock('0');
    setNewVariantPrice('');
    setVariantError('');
    setVariantMessage('');
  }

  async function refreshVariantProduct(productId: string) {
    const activeProducts = await refreshProducts();
    const updated = activeProducts.find(
      (product) => product.id === productId,
    );

    if (updated) {
      openVariantEditor(updated);
    }
  }

  async function saveProduct(
    event: FormEvent,
  ) {
    event.preventDefault();
    const price = Number(productPrice);
    const stock = Number(productStock);
    const preparedVariants = productVariants
      .filter((variant) => variant.name.trim())
      .map((variant) => ({
        name: variant.name.trim(),
        stock: Number(variant.stock),
      }));

    if (!productName.trim()) {
      setProductError(
        'Indica el nombre del producto.',
      );
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setProductError(
        'Indica un precio válido.',
      );
      return;
    }

    if (
      productOptionMode !== 'none' &&
      (preparedVariants.length === 0 ||
        preparedVariants.some(
          (variant) =>
            !Number.isInteger(variant.stock) ||
            variant.stock < 0,
        ))
    ) {
      setProductError(
        'Escribe al menos una opción y una existencia válida.',
      );
      return;
    }

    setSavingProduct(true);
    setProductError('');

    try {
      const product =
        await apiRequest<CatalogProduct>(
          'catalog/product',
          {
            method: 'POST',
            body: JSON.stringify({
              name: productName.trim(),
              sku:
                productSku.trim() ||
                undefined,
              price,
              stock:
                productOptionMode === 'none' &&
                Number.isInteger(stock) &&
                stock >= 0
                  ? stock
                  : 0,
              variants:
                productOptionMode === 'none'
                  ? undefined
                  : preparedVariants,
              trackInventory: true,
              companyId,
            }),
          },
        );

      if (productFile) {
        const image =
          await uploadImage(productFile);
        await apiRequest(
          `catalog/product/${product.id}/image`,
          {
            method: 'POST',
            body: JSON.stringify({
              url: image.url,
              altText: product.name,
              isPrimary: true,
            }),
          },
        );
      }

      await refreshProducts();
      setShowProductForm(false);
      setProductName('');
      setProductPrice('');
      setProductStock('1');
      setProductOptionMode('none');
      setProductVariants([]);
      setProductSku('');
      setProductFile(undefined);
      setSiteMessage(
        'Producto guardado. Ya puedes editar su precio, fotografías y opciones desde la tarjeta.',
      );
    } catch (error) {
      setProductError(
        getErrorMessage(error),
      );
    } finally {
      setSavingProduct(false);
    }
  }

  async function addProductVariant(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!variantProduct) {
      return;
    }

    const stock = Number(newVariantStock);
    const price = newVariantPrice.trim()
      ? Number(newVariantPrice)
      : undefined;

    if (!newVariantName.trim()) {
      setVariantError('Escribe la talla, color o presentación.');
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      setVariantError('La existencia debe ser un número desde cero.');
      return;
    }

    if (
      price !== undefined &&
      (!Number.isFinite(price) || price < 0)
    ) {
      setVariantError('El precio debe ser cero o una cantidad mayor.');
      return;
    }

    setSavingVariant(true);
    setVariantError('');
    setVariantMessage('');

    try {
      await apiRequest(
        `catalog/product/${variantProduct.id}/variant`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: newVariantName.trim(),
            stock,
            price,
          }),
        },
      );
      setNewVariantName('');
      setNewVariantStock('0');
      setNewVariantPrice('');
      await refreshVariantProduct(variantProduct.id);
      setVariantMessage('Opción agregada correctamente.');
    } catch (error) {
      setVariantError(getErrorMessage(error));
    } finally {
      setSavingVariant(false);
    }
  }

  async function saveVariant(variantId: string) {
    if (!variantProduct) {
      return;
    }

    const stock = Number(variantStocks[variantId]);
    const name = variantNames[variantId]?.trim();
    const priceText = variantPrices[variantId]?.trim() ?? '';
    const price = priceText ? Number(priceText) : null;

    if (!name) {
      setVariantError('Escribe el nombre de la talla, color o presentación.');
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      setVariantError('La existencia debe ser un número desde cero.');
      return;
    }

    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setVariantError('El precio debe ser cero o una cantidad mayor.');
      return;
    }

    setSavingVariant(true);
    setVariantError('');
    setVariantMessage('');

    try {
      await apiRequest(`catalog/variant/${variantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, price, stock }),
      });
      await refreshVariantProduct(variantProduct.id);
      setVariantMessage('Opción, precio y existencia actualizados.');
    } catch (error) {
      setVariantError(getErrorMessage(error));
    } finally {
      setSavingVariant(false);
    }
  }

  function togglePromotionProduct(productId: string) {
    setPromotionProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  async function savePromotion(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!promotionTitle.trim()) {
      setPromotionError(
        'Indica el título de la promoción.',
      );
      return;
    }

    if (
      promotionScope === 'selected_products' &&
      promotionProductIds.length === 0
    ) {
      setPromotionError(
        'Selecciona al menos un producto para esta promoción.',
      );
      return;
    }

    if (
      promotionType === 'special_price' &&
      (promotionScope !== 'selected_products' ||
        promotionProductIds.length !== 1)
    ) {
      setPromotionError(
        'El precio especial debe aplicarse a un solo producto.',
      );
      return;
    }

    if (
      promotionType === 'buy_x_get_y' &&
      (promotionScope !== 'selected_products' ||
        promotionProductIds.length !== 1)
    ) {
      setPromotionError(
        'Compra X y recibe Y debe aplicarse a un solo producto.',
      );
      return;
    }

    const minimumPurchase = promotionMinimumPurchase.trim()
      ? Number(promotionMinimumPurchase)
      : undefined;

    if (
      minimumPurchase !== undefined &&
      (!Number.isFinite(minimumPurchase) || minimumPurchase < 0)
    ) {
      setPromotionError(
        'La compra mínima debe ser cero o una cantidad mayor.',
      );
      return;
    }

    if (
      promotionType === 'buy_x_get_y' &&
      (!Number.isInteger(Number(promotionBuyQuantity)) ||
        Number(promotionBuyQuantity) < 1 ||
        !Number.isInteger(Number(promotionGetQuantity)) ||
        Number(promotionGetQuantity) < 1)
    ) {
      setPromotionError(
        'Indica cantidades completas y mayores a cero.',
      );
      return;
    }

    setSavingPromotion(true);
    setPromotionError('');
    setPromotionMessage('');

    try {
      const image = promotionFile
        ? await uploadImage(promotionFile)
        : null;
      const value = Number(promotionValue);
      const payload = {
        title: promotionTitle.trim(),
        description:
          promotionDescription.trim() ||
          undefined,
        type: promotionType,
        discountValue:
          promotionType === 'percentage' ||
          promotionType === 'fixed'
            ? value
            : undefined,
        specialPrice:
          promotionType === 'special_price'
            ? value
            : undefined,
        buyQuantity:
          promotionType === 'buy_x_get_y'
            ? Number(promotionBuyQuantity)
            : undefined,
        getQuantity:
          promotionType === 'buy_x_get_y'
            ? Number(promotionGetQuantity)
            : undefined,
        minimumPurchase,
        rewardDescription:
          promotionType === 'custom'
            ? promotionDescription.trim()
            : undefined,
        imageUrl: image?.url,
        featured: true,
        startsAt: new Date(
          promotionStartsAt,
        ).toISOString(),
        endsAt: new Date(
          promotionEndsAt,
        ).toISOString(),
        companyId,
        productIds:
          promotionScope === 'selected_products'
            ? promotionProductIds
            : undefined,
      };
      const created =
        await apiRequest<PromotionRecord>(
          'promotion',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );
      const activated =
        await apiRequest<PromotionRecord>(
          `promotion/${created.id}/activate`,
          {
            method: 'POST',
          },
        );

      setPromotions((current) => [
        {
          ...created,
          ...activated,
          products: created.products,
        },
        ...current,
      ]);
      setPromotionTitle('');
      setPromotionDescription('');
      setPromotionFile(undefined);
      setPromotionProductIds([]);
      setPromotionMinimumPurchase('');
      setPromotionMessage(
        promotionScope === 'all'
          ? 'Promoción publicada para toda la tienda.'
          : 'Promoción publicada para los productos elegidos.',
      );
    } catch (error) {
      setPromotionError(
        getErrorMessage(error),
      );
    } finally {
      setSavingPromotion(false);
    }
  }

  async function changePromotionStatus(
    promotion: PromotionRecord,
  ) {
    const action =
      promotion.status === 'active'
        ? 'pause'
        : 'activate';

    setChangingPromotionId(promotion.id);
    setPromotionError('');
    setPromotionMessage('');

    try {
      const updated =
        await apiRequest<PromotionRecord>(
          `promotion/${promotion.id}/${action}`,
          { method: 'POST' },
        );
      setPromotions((current) =>
        current.map((item) =>
          item.id === promotion.id
            ? { ...item, ...updated }
            : item,
        ),
      );
      setPromotionMessage(
        action === 'pause'
          ? 'Promoción pausada. Ya no se muestra al público.'
          : 'Promoción reactivada.',
      );
    } catch (error) {
      setPromotionError(getErrorMessage(error));
    } finally {
      setChangingPromotionId('');
    }
  }

  async function closePromotion(
    promotion: PromotionRecord,
  ) {
    if (
      !window.confirm(
        `¿Cerrar definitivamente “${promotion.title}”? Ya no podrá reactivarse.`,
      )
    ) {
      return;
    }

    setChangingPromotionId(promotion.id);
    setPromotionError('');
    setPromotionMessage('');

    try {
      const updated = await apiRequest<PromotionRecord>(
        `promotion/${promotion.id}/close`,
        { method: 'POST' },
      );
      setPromotions((current) =>
        current.map((item) =>
          item.id === promotion.id
            ? { ...item, ...updated }
            : item,
        ),
      );
      setPromotionMessage(
        'Promoción cerrada. Se conserva en el historial y ya no se aplica.',
      );
    } catch (error) {
      setPromotionError(getErrorMessage(error));
    } finally {
      setChangingPromotionId('');
    }
  }

  async function createLoyaltyProgram(
    event: FormEvent,
  ) {
    event.preventDefault();
    const visits = Number(requiredVisits);

    if (!site || site.status !== 'published') {
      setLoyaltyError(
        'Primero guarda y publica la página. Después Yalika podrá crear su QR.',
      );
      return;
    }

    if (
      !Number.isInteger(visits) ||
      visits < 2 ||
      visits > 30
    ) {
      setLoyaltyError(
        'Elige entre 2 y 30 visitas.',
      );
      return;
    }

    if (!rewardDescription.trim()) {
      setLoyaltyError(
        'Escribe qué recibirá el cliente.',
      );
      return;
    }

    setSavingLoyalty(true);
    setLoyaltyError('');
    setLoyaltyMessage('');

    try {
      const startsAt = new Date();
      const endsAt = new Date();
      endsAt.setFullYear(endsAt.getFullYear() + 1);
      const created =
        await apiRequest<LoyaltyProgramRecord>(
          'loyalty-program',
          {
            method: 'POST',
            body: JSON.stringify({
              name:
                loyaltyName.trim() ||
                'Club de visitas',
              description:
                'Acumula visitas desde el QR de este negocio.',
              requiredVisits: visits,
              rewardType: 'custom',
              rewardDescription:
                rewardDescription.trim(),
              rewardValidDays: 30,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              companyId,
            }),
          },
        );
      const activated =
        await apiRequest<LoyaltyProgramRecord>(
          `loyalty-program/${created.id}/activate`,
          {
            method: 'POST',
          },
        );

      setLoyaltyPrograms((current) => [
        activated,
        ...current,
      ]);
      setLoyaltyMessage(
        'Club activado. El QR ya se puede imprimir o compartir.',
      );
    } catch (error) {
      setLoyaltyError(
        getErrorMessage(error),
      );
    } finally {
      setSavingLoyalty(false);
    }
  }

  function updateScratchPrize(
    index: number,
    field: keyof ScratchPrizeDraft,
    value: string,
  ) {
    setScratchPrizes((current) =>
      current.map((prize, prizeIndex) =>
        prizeIndex === index
          ? { ...prize, [field]: value }
          : prize,
      ),
    );
  }

  async function configureScratch(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!activeLoyaltyProgram) {
      setScratchError(
        'Primero activa el Club QR. Después podrás encender el raspadito.',
      );
      return;
    }

    const validDays = Number(scratchValidDays);
    const completedPrizes = scratchPrizes.filter(
      (prize) => prize.name.trim(),
    );

    if (
      !Number.isInteger(validDays) ||
      validDays < 1 ||
      validDays > 365
    ) {
      setScratchError(
        'La vigencia debe ser de 1 a 365 días.',
      );
      return;
    }

    if (
      completedPrizes.length === 0 ||
      completedPrizes.some((prize) => {
        const chance = Number(prize.probability);
        const stock = Number(prize.stock);

        return (
          !Number.isInteger(chance) ||
          chance < 1 ||
          chance > 100 ||
          (prize.stock.trim() !== '' &&
            (!Number.isInteger(stock) || stock < 1))
        );
      })
    ) {
      setScratchError(
        'Revisa los premios: oportunidad de 1 a 100 y cantidad mayor a cero.',
      );
      return;
    }

    const totalChance = completedPrizes.reduce(
      (total, prize) =>
        total + Number(prize.probability),
      0,
    );

    if (totalChance > 100) {
      setScratchError(
        'La suma de oportunidades no puede superar 100%.',
      );
      return;
    }

    const prizes = completedPrizes.map((prize) => ({
      name: prize.name.trim(),
      probabilityPercent: Number(prize.probability),
      ...(prize.stock.trim()
        ? { stock: Number(prize.stock) }
        : {}),
    }));

    setSavingScratch(true);
    setScratchError('');
    setScratchMessage('');

    try {
      const configured =
        await apiRequest<ScratchCampaignRecord>(
          `scratch/company/${companyId}/configure`,
          {
            method: 'POST',
            body: JSON.stringify({
              loyaltyProgramId:
                activeLoyaltyProgram.id,
              name:
                scratchName.trim() ||
                'Raspadito sorpresa',
              description:
                'Un intento seguro por cada compra pagada.',
              validDays,
              prizes,
            }),
          },
        );

      setScratchCampaign(configured);
      setScratchMessage(
        'Raspadito activado. Cada ticket pagado dará una sola oportunidad.',
      );
    } catch (error) {
      setScratchError(getErrorMessage(error));
    } finally {
      setSavingScratch(false);
    }
  }

  async function redeemScratch(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!initialAuthorizedUserId) {
      setRedeemError(
        'Tu sesión no tiene usuario activo para registrar quién entrega el premio. Vuelve a iniciar sesión.',
      );
      return;
    }

    if (!redeemCode.trim()) {
      setRedeemError('Escribe el código del premio.');
      return;
    }

    setRedeemingScratch(true);
    setRedeemError('');
    setRedeemMessage('');

    try {
      const redeemed = await apiRequest<{
        customer: { name: string };
        prize: { name: string };
      }>(`scratch/company/${companyId}/redeem`, {
        method: 'POST',
        body: JSON.stringify({
          claimCode: redeemCode.trim(),
          authorizedById: initialAuthorizedUserId,
        }),
      });

      setRedeemCode('');
      setRedeemMessage(
        `Premio entregado: ${redeemed.prize.name} a ${redeemed.customer.name}.`,
      );
    } catch (error) {
      setRedeemError(getErrorMessage(error));
    } finally {
      setRedeemingScratch(false);
    }
  }

  if (!companyId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <form
          onSubmit={connectCompany}
          className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl"
        >
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-400">
            Yalika · Mi página
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            Conectar mi tienda
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Usa el mismo identificador de empresa configurado en caja.
          </p>
          <input
            required
            value={companyDraft}
            onChange={(event) =>
              setCompanyDraft(
                event.target.value,
              )
            }
            placeholder="Identificador de empresa"
            className="mt-6 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
          />
          {siteError ? (
            <p className="mt-3 text-sm text-red-300">
              {siteError}
            </p>
          ) : null}
          <button className="mt-5 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950">
            Abrir constructor
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <header className="flex flex-col gap-5 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-400">
              Yalika · Mi página
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Mi tienda
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Elige un estilo, agrega tus fotos y dicta lo que quieres publicar.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {site && <a href="/sites/studio" className="inline-flex min-h-11 items-center rounded-xl border border-cyan-400 px-4 text-sm font-semibold text-cyan-200">Editar secciones y vista previa</a>}
            {site?.status === 'published' && site.slug ? (
              <a
                href={`/s/${site.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:bg-slate-900"
              >
                Ver mi tienda
              </a>
            ) : null}
            <button
              type="button"
              disabled={savingSite || site?.status === 'published'}
              onClick={() => void saveSite(false)}
              className="h-11 rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:bg-slate-900 disabled:opacity-50"
              title={site?.status === 'published' ? 'Una edición de un sitio publicado cambia inmediatamente la versión visible; el diseño general aún no tiene borrador independiente. Los bloques se editan en Editar secciones.' : undefined}
            >
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={savingSite}
              onClick={() => void saveSite(true)}
              className="h-11 rounded-xl bg-cyan-400 px-5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700"
            >
              {savingSite
                ? 'Guardando…'
                : 'Guardar y publicar'}
            </button>
          </div>
        </header>

        {siteMessage ? (
          <p className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            {siteMessage}
          </p>
        ) : null}
        {siteError ? (
          <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {siteError}
          </p>
        ) : null}

        <nav className="sticky top-3 z-40 mt-6 overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
          <div className="flex min-w-max gap-2">
            {[
              ['design', 'Diseño'],
              ['products', 'Productos'],
              ['social', 'Anuncios y redes'],
              ['promotions', 'Promociones'],
              ['club', 'Club QR'],
            ].map(([section, label]) => (
              <button
                key={section}
                type="button"
                onClick={() =>
                  setActiveStudioSection(
                    section as StudioSection,
                  )
                }
                className={`h-10 rounded-xl px-4 text-sm font-semibold transition ${
                  activeStudioSection === section
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        <section className={`${activeStudioSection === 'design' ? '' : 'hidden'} mt-7 overflow-hidden rounded-3xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 via-slate-900 to-cyan-400/10 p-5 sm:p-6`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">
                Idea de Yalika para esta temporada
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {seasonalStyleIdea.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {seasonalStyleIdea.description} Yalika cambia el estilo y prepara un anuncio; nunca publica sin tu permiso.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    applyStyleIdea(
                      seasonalStyleIdea,
                    )
                  }
                  className="rounded-xl bg-fuchsia-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-fuchsia-200"
                >
                  Probar este estilo
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setShowAllStyleIdeas(
                      (current) => !current,
                    )
                  }
                  className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-slate-400 hover:bg-slate-800"
                >
                  {showAllStyleIdeas
                    ? 'Ocultar ideas'
                    : 'Ver otras ideas'}
                </button>
              </div>
            </div>
            <div
              className={`h-36 w-full overflow-hidden rounded-3xl bg-gradient-to-br ${seasonalStyleIdea.preview} p-5 shadow-2xl lg:w-80`}
            >
              <div className="h-3 w-20 rounded-full bg-white/70" />
              <div className="mt-8 h-6 w-3/4 rounded-full bg-white/90" />
              <div className="mt-3 h-2 w-full rounded-full bg-white/50" />
              <div className="mt-2 h-2 w-2/3 rounded-full bg-white/40" />
            </div>
          </div>

          {showAllStyleIdeas ? (
            <div className="mt-6 border-t border-slate-700/70 pt-6">
              <p className="text-sm text-slate-300">
                También puedes decir por voz: “hazla punk”, “ponla navideña” o “quiero estilo vacaciones”.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {styleIdeas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() =>
                      applyStyleIdea(idea)
                    }
                    className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/60 text-left transition hover:-translate-y-0.5 hover:border-fuchsia-300"
                  >
                    <div
                      className={`h-20 bg-gradient-to-br ${idea.preview}`}
                    />
                    <div className="p-4">
                      <p className="font-semibold text-white">
                        {idea.name}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {idea.description}
                      </p>
                      <span className="mt-3 inline-block text-xs font-bold text-fuchsia-300">
                        Probar sin publicar
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className={`${activeStudioSection === 'design' ? '' : 'hidden'} mt-7`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">
              Ejemplos listos
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Empieza con una página bonita
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              El ejemplo prepara diseño, colores, textos y una promoción. Nada se publica hasta que tú confirmes.
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {pageExamples
              .filter((example) =>
                mainTemplateIds.has(
                  example.template,
                ),
              )
              .map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() =>
                  applyPageExample(example)
                }
                className={`group overflow-hidden rounded-3xl border text-left transition hover:-translate-y-1 hover:shadow-2xl ${
                  selectedExample === example.id
                    ? 'border-fuchsia-300 ring-2 ring-fuchsia-300/20'
                    : 'border-slate-800 hover:border-fuchsia-300/60'
                }`}
              >
                <div
                  className={`relative h-44 overflow-hidden bg-gradient-to-br ${example.preview} p-5`}
                >
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">
                    {example.kind}
                  </p>
                  <p className="mt-7 max-w-[13rem] text-2xl font-bold leading-tight text-white">
                    {example.title}
                  </p>
                  <span className="absolute bottom-4 left-5 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold text-slate-900">
                    Usar este ejemplo
                  </span>
                </div>
                <div className="bg-slate-900 p-4">
                  <p className="font-semibold">
                    {example.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Incluye promoción sugerida de {example.promotionValue}%.
                  </p>
                </div>
              </button>
              ))}
          </div>
        </section>

        <section className={`${activeStudioSection === 'design' ? '' : 'hidden'} mt-9 border-t border-slate-800 pt-8`}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Paso 1
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Cuatro diseños recomendados
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Son las opciones más claras y fáciles. Yalika puede transformar cualquiera en un estilo especial cuando se lo pidas.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates
              .filter((template) =>
                mainTemplateIds.has(template.id),
              )
              .map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() =>
                  selectTemplate(template.id)
                }
                className={`overflow-hidden rounded-3xl border text-left transition ${
                  siteForm.template === template.id
                    ? 'border-cyan-300 ring-2 ring-cyan-300/20'
                    : 'border-slate-800 hover:border-slate-600'
                }`}
              >
                <div
                  className={`h-36 bg-gradient-to-br ${template.preview} p-4`}
                >
                  <div className="h-3 w-16 rounded-full bg-white/70" />
                  <div className="mt-8 h-5 w-3/4 rounded-full bg-white/90" />
                  <div className="mt-3 h-2 w-full rounded-full bg-white/40" />
                  <div className="mt-2 h-2 w-2/3 rounded-full bg-white/30" />
                </div>
                <div className="bg-slate-900 p-4">
                  <p className="font-semibold">
                    {template.name}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {template.description}
                  </p>
                </div>
              </button>
              ))}
          </div>
        </section>

        <section className={`${activeStudioSection === 'design' ? '' : 'hidden'} mt-9 border-t border-slate-800 pt-8`}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Plantillas nuevas
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            Para tu negocio y para la temporada
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Ya traen dibujos, textos y pasos listos. Tus productos y fotos reales los reemplazan cuando los cargas. Puedes cambiar de diseño cuando quieras.
          </p>
          {(['negocio', 'temporada'] as const).map((group) => (
            <div key={group} className="mt-6">
              <p className="text-sm font-bold text-slate-300">
                {group === 'negocio' ? 'Negocios' : 'Temporada'}
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {PRESETS.filter((preset) => preset.group === group).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectTemplate(preset.id)}
                    className={`overflow-hidden rounded-3xl border text-left transition ${
                      siteForm.template === preset.id
                        ? 'border-cyan-300 ring-2 ring-cyan-300/20'
                        : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div
                      className="relative h-36 overflow-hidden [&>svg]:h-full [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: heroArt(preset.hero, preset.label) }}
                    />
                    <div className="bg-slate-900 p-4">
                      <p className="font-semibold">
                        {suggestedSeason() === preset.id ? '★ ' : ''}
                        {preset.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {suggestedSeason() === preset.id ? 'De temporada ahora · ' : ''}
                        {preset.eyebrow}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className={`${activeStudioSection === 'design' ? '' : 'hidden'} mt-8 grid gap-6 xl:grid-cols-[1.1fr_.9fr]`}>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  Paso 2
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  Identidad de la tienda
                </h2>
              </div>
              <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                {activeTemplate.name}
              </span>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">
                Nombre de la tienda
                <div className="mt-2 flex gap-2">
                  <input
                    value={siteForm.name}
                    onChange={(event) => {
                      const name =
                        event.target.value;
                      setSiteForm((current) => ({
                        ...current,
                        name,
                        slug:
                          current.slug ||
                          toSlug(name),
                      }));
                    }}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
                  />
                  <VoiceButton
                    target="site-name"
                    listening={listening}
                    onListen={() =>
                      startDictation(
                        'site-name',
                        (text) => {
                          updateSiteForm(
                            'name',
                            text,
                          );
                          updateSiteForm(
                            'slug',
                            toSlug(text),
                          );
                        },
                      )
                    }
                  />
                </div>
              </label>
              <label className="text-sm text-slate-300">
                Dirección pública
                <div className="mt-2 flex h-11 items-center rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">
                  <span className="text-slate-500">
                    /s/
                  </span>
                  <input
                    value={siteForm.slug}
                    onChange={(event) =>
                      updateSiteForm(
                        'slug',
                        toSlug(event.target.value),
                      )
                    }
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                </div>
              </label>
              <label className="text-sm text-slate-300 sm:col-span-2">
                Frase principal
                <div className="mt-2 flex gap-2">
                  <input
                    value={siteForm.heroTitle}
                    onChange={(event) =>
                      updateSiteForm(
                        'heroTitle',
                        event.target.value,
                      )
                    }
                    placeholder="Nueva colección disponible"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
                  />
                  <VoiceButton
                    target="hero-title"
                    listening={listening}
                    onListen={() =>
                      startDictation(
                        'hero-title',
                        (text) =>
                          updateSiteForm(
                            'heroTitle',
                            text,
                          ),
                      )
                    }
                  />
                </div>
              </label>
              <label className="text-sm text-slate-300 sm:col-span-2">
                Mensaje para tus clientes
                <div className="mt-2 flex items-start gap-2">
                  <textarea
                    value={siteForm.heroSubtitle}
                    onChange={(event) =>
                      updateSiteForm(
                        'heroSubtitle',
                        event.target.value,
                      )
                    }
                    rows={3}
                    placeholder="Describe tu negocio o dicta el mensaje."
                    className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-cyan-400"
                  />
                  <VoiceButton
                    target="hero-subtitle"
                    listening={listening}
                    onListen={() =>
                      startDictation(
                        'hero-subtitle',
                        (text) =>
                          updateSiteForm(
                            'heroSubtitle',
                            text,
                          ),
                      )
                    }
                  />
                </div>
              </label>
              <label className="text-sm text-slate-300">
                Logotipo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(event) =>
                    setLogoFile(
                      event.target.files?.[0],
                    )
                  }
                  className="mt-2 block w-full rounded-xl border border-dashed border-slate-700 bg-slate-950 p-3 text-xs"
                />
              </label>
              <label className="text-sm text-slate-300">
                Foto principal
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(event) =>
                    setHeroFile(
                      event.target.files?.[0],
                    )
                  }
                  className="mt-2 block w-full rounded-xl border border-dashed border-slate-700 bg-slate-950 p-3 text-xs"
                />
              </label>
              <label className="text-sm text-slate-300">
                Color principal
                <input
                  type="color"
                  value={siteForm.primaryColor}
                  onChange={(event) =>
                    updateSiteForm(
                      'primaryColor',
                      event.target.value,
                    )
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 p-1"
                />
              </label>
              <label className="text-sm text-slate-300">
                Color de botones
                <input
                  type="color"
                  value={siteForm.accentColor}
                  onChange={(event) =>
                    updateSiteForm(
                      'accentColor',
                      event.target.value,
                    )
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 p-1"
                />
              </label>
              <div className="sm:col-span-2">
                <p className="text-sm text-slate-300">
                  Combinaciones recomendadas
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {colorPalettes.map((palette) => (
                    <button
                      key={palette.name}
                      type="button"
                      onClick={() =>
                        setSiteForm((current) => ({
                          ...current,
                          primaryColor: palette.primary,
                          backgroundValue: palette.primary,
                          accentColor: palette.accent,
                        }))
                      }
                      className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-400/50"
                      title={`Usar los colores ${palette.name}`}
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-white/20"
                        style={{ backgroundColor: palette.primary }}
                      />
                      <span
                        className="h-4 w-4 rounded-full border border-white/20"
                        style={{ backgroundColor: palette.accent }}
                      />
                      {palette.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            className={`relative min-h-[440px] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${activeTemplate.preview} p-7 shadow-2xl`}
            style={{
              backgroundColor:
                siteForm.primaryColor,
            }}
          >
            {siteForm.heroImageUrl ? (
              <img
                src={siteForm.heroImageUrl}
                alt="Vista previa"
                className="absolute inset-0 h-full w-full object-cover opacity-40"
              />
            ) : null}
            <div className="relative flex h-full min-h-[385px] flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-white/80">
                  {siteForm.name ||
                    'Mi boutique'}
                </p>
                <span className="rounded-full bg-black/20 px-3 py-1 text-[10px] text-white/80 backdrop-blur">
                  Vista previa
                </span>
              </div>
              <div>
                <p className="max-w-xl text-4xl font-bold leading-tight text-white sm:text-5xl">
                  {siteForm.heroTitle ||
                    'Tu nueva colección comienza aquí'}
                </p>
                <p className="mt-4 max-w-lg text-sm leading-6 text-white/75">
                  {siteForm.heroSubtitle ||
                    'Agrega una frase corta para presentar tu negocio.'}
                </p>
                <span
                  className="mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-bold"
                  style={{
                    backgroundColor:
                      siteForm.accentColor,
                    color:
                      siteForm.template ===
                      'minimal_catalog'
                        ? '#ffffff'
                        : '#111827',
                  }}
                >
                  {siteForm.heroButtonText ||
                    'Ver catálogo'}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className={`${activeStudioSection === 'social' ? '' : 'hidden'} mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6`}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
            Anuncios y contacto
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            Lo que quieres comunicar
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            El aviso aparece arriba de la página. Las redes se mostrarán como botones para que tus clientes te contacten fácilmente.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-300 sm:col-span-2">
              Aviso principal (opcional)
              <div className="mt-2 flex items-start gap-2">
                <textarea
                  value={siteForm.announcementText}
                  onChange={(event) =>
                    updateSiteForm(
                      'announcementText',
                      event.target.value,
                    )
                  }
                  rows={3}
                  maxLength={240}
                  placeholder="Ej. Hoy cerramos a las 8 · Envíos gratis en compras mayores a $500"
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-cyan-400"
                />
                <VoiceButton
                  target="announcement"
                  listening={listening}
                  onListen={() =>
                    startDictation(
                      'announcement',
                      (text) =>
                        updateSiteForm(
                          'announcementText',
                          text,
                        ),
                    )
                  }
                />
              </div>
            </label>
            <label className="text-sm text-slate-300">
              WhatsApp
              <input
                value={siteForm.whatsappPhone}
                onChange={(event) =>
                  updateSiteForm(
                    'whatsappPhone',
                    event.target.value,
                  )
                }
                placeholder="Ej. 4431234567"
                className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                Escribe el número con lada; Yalika creará el enlace.
              </span>
            </label>
            <label className="text-sm text-slate-300">
              Facebook
              <input
                value={siteForm.facebookUrl}
                onChange={(event) =>
                  updateSiteForm(
                    'facebookUrl',
                    event.target.value,
                  )
                }
                placeholder="https://facebook.com/tu-pagina"
                className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
              />
            </label>
            <label className="text-sm text-slate-300">
              Instagram
              <input
                value={siteForm.instagramUrl}
                onChange={(event) =>
                  updateSiteForm(
                    'instagramUrl',
                    event.target.value,
                  )
                }
                placeholder="https://instagram.com/tu-cuenta"
                className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
              />
            </label>
            <label className="text-sm text-slate-300">
              TikTok
              <input
                value={siteForm.tiktokUrl}
                onChange={(event) =>
                  updateSiteForm(
                    'tiktokUrl',
                    event.target.value,
                  )
                }
                placeholder="https://tiktok.com/@tu-cuenta"
                className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
              />
            </label>
            <label className="text-sm text-slate-300">
              Nombre de otra página
              <input
                value={siteForm.extraLinkLabel}
                onChange={(event) =>
                  updateSiteForm(
                    'extraLinkLabel',
                    event.target.value,
                  )
                }
                placeholder="Ej. Reservar cita"
                className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
              />
            </label>
            <label className="text-sm text-slate-300">
              Enlace de esa página
              <input
                value={siteForm.extraLinkUrl}
                onChange={(event) =>
                  updateSiteForm(
                    'extraLinkUrl',
                    event.target.value,
                  )
                }
                placeholder="https://..."
                className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={savingSite}
            onClick={() => void saveSite(Boolean(site?.status === 'published'))}
            className="mt-6 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700"
          >
            Guardar anuncio y redes
          </button>
        </section>

        <section id="products" className={`${activeStudioSection === 'products' ? '' : 'hidden'} mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Paso 3
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Productos y fotografías
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                El catálogo es el mismo de tu punto de venta.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setShowProductForm(true)
              }
              className="h-11 rounded-xl bg-white px-5 text-sm font-bold text-slate-950"
            >
              + Producto con foto
            </button>
          </div>

          {productError ? (
            <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {productError}
            </p>
          ) : null}

          <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            {products.map((product) => {
              const image =
                [...product.images].sort(
                  (left, right) =>
                    Number(right.isPrimary) -
                      Number(left.isPrimary) ||
                    left.sortOrder -
                      right.sortOrder,
                )[0];

              return (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
                >
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-slate-800 to-slate-900">
                    {image ? (
                      <img
                        src={image.url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-slate-500">
                        Agrega una fotografía
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        openPhotoManager(product)
                      }
                      className="absolute bottom-3 right-3 rounded-full bg-slate-950/85 px-3 py-2 text-xs font-bold text-white backdrop-blur hover:bg-slate-950"
                      title="Agregar fotografías, elegir la principal o quitar una."
                    >
                      {product.images.length === 0
                        ? 'Agregar fotos'
                        : `${product.images.length} ${product.images.length === 1 ? 'foto' : 'fotos'}`}
                    </button>
                  </div>
                  <div className="p-4">
                    <p className="truncate font-semibold">
                      {product.name}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-bold text-cyan-300">
                        ${product.price.toFixed(2)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {product.variants.length > 0
                          ? `${product.variants.reduce(
                              (total, variant) =>
                                total +
                                (variant.status === 'active'
                                  ? variant.stock
                                  : 0),
                              0,
                            )} entre opciones`
                          : `${product.stock} disponibles`}
                      </span>
                    </div>
                    {product.variants.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {product.variants
                          .filter(
                            (variant) =>
                              variant.status === 'active',
                          )
                          .slice(0, 4)
                          .map((variant) => (
                            <span
                              key={variant.id}
                              className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400"
                            >
                              {variant.name}: {variant.stock}
                            </span>
                          ))}
                      </div>
                    ) : null}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => openProductEditor(product)}
                        className="col-span-2 min-h-10 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold leading-4 text-white hover:bg-white/10"
                        title="Cambiar nombre, descripción, precio, código o existencia."
                      >
                        Editar datos y precio
                      </button>
                      <button
                        type="button"
                        onClick={() => openPhotoManager(product)}
                        className="min-h-10 rounded-xl border border-fuchsia-400/25 bg-fuchsia-400/5 px-2 py-2 text-xs font-bold leading-4 text-fuchsia-200 hover:bg-fuchsia-400/10"
                        title="Agregar, cambiar o quitar fotografías."
                      >
                        Fotos ({product.images.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => openVariantEditor(product)}
                        className="min-h-10 rounded-xl border border-cyan-400/25 bg-cyan-400/5 px-2 py-2 text-xs font-bold leading-4 text-cyan-300 hover:bg-cyan-400/10"
                        title="Agrega tallas, colores o presentaciones y controla nombre, precio y existencia."
                      >
                        Opciones ({product.variants.length})
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="promotions" className={`${activeStudioSection === 'promotions' ? '' : 'hidden'} mt-8 grid gap-6 xl:grid-cols-[1fr_.8fr]`}>
          <form
            onSubmit={savePromotion}
            className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Paso 4
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Crear promoción
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Puedes dictar el título y el mensaje; Yalika conservará los números para que los revises.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300 sm:col-span-2">
                Título
                <div className="mt-2 flex gap-2">
                  <input
                    required
                    value={promotionTitle}
                    onChange={(event) =>
                      setPromotionTitle(
                        event.target.value,
                      )
                    }
                    placeholder="Fin de semana: 20% de descuento"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
                  />
                  <VoiceButton
                    target="promotion-title"
                    listening={listening}
                    onListen={() =>
                      startDictation(
                        'promotion-title',
                        setPromotionTitle,
                      )
                    }
                  />
                </div>
              </label>
              <label className="text-sm text-slate-300 sm:col-span-2">
                Mensaje
                <div className="mt-2 flex items-start gap-2">
                  <textarea
                    value={promotionDescription}
                    onChange={(event) =>
                      setPromotionDescription(
                        event.target.value,
                      )
                    }
                    rows={3}
                    placeholder="Dicta las condiciones o una frase para tus clientes."
                    className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-cyan-400"
                  />
                  <VoiceButton
                    target="promotion-description"
                    listening={listening}
                    onListen={() =>
                      startDictation(
                        'promotion-description',
                        setPromotionDescription,
                      )
                    }
                  />
                </div>
              </label>
              <label className="text-sm text-slate-300">
                Tipo
                <select
                  value={promotionType}
                  onChange={(event) => {
                    const type = event.target.value;
                    setPromotionType(type);

                    if (
                      type === 'special_price' ||
                      type === 'buy_x_get_y'
                    ) {
                      setPromotionScope(
                        'selected_products',
                      );
                      setPromotionProductIds(
                        (current) =>
                          current.slice(0, 1),
                      );
                    }
                  }}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                >
                  <option value="percentage">
                    Porcentaje
                  </option>
                  <option value="fixed">
                    Descuento en pesos
                  </option>
                  <option value="special_price">
                    Precio especial
                  </option>
                  <option value="buy_x_get_y">
                    Compra X y recibe Y
                  </option>
                  <option value="custom">
                    Promoción informativa
                  </option>
                </select>
              </label>
              {promotionType === 'percentage' ||
              promotionType === 'fixed' ||
              promotionType === 'special_price' ? (
                <label className="text-sm text-slate-300">
                  {promotionType === 'percentage'
                    ? 'Descuento (%)'
                    : promotionType === 'fixed'
                      ? 'Descuento ($)'
                      : 'Nuevo precio ($)'}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={promotionValue}
                    onChange={(event) =>
                      setPromotionValue(
                        event.target.value,
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                  />
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                    {promotionType === 'percentage'
                      ? 'Ej. 15 significa que pagarían 15% menos.'
                      : promotionType === 'fixed'
                        ? 'Ej. 50 descuenta $50 al precio.'
                        : 'Escribe el precio final del producto.'}
                  </span>
                </label>
              ) : null}
              {promotionType === 'buy_x_get_y' ? (
                <div className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/5 p-4 sm:col-span-2">
                  <p className="text-sm font-semibold text-white">
                    Arma la oferta
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Ejemplo: compra 2 y recibe 1 significa que el cliente lleva 3 y paga solamente 2.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs text-slate-300">
                      Compra
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={promotionBuyQuantity}
                        onChange={(event) =>
                          setPromotionBuyQuantity(event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base font-bold outline-none focus:border-fuchsia-300"
                      />
                    </label>
                    <label className="text-xs text-slate-300">
                      Recibe gratis
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={promotionGetQuantity}
                        onChange={(event) =>
                          setPromotionGetQuantity(event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base font-bold outline-none focus:border-fuchsia-300"
                      />
                    </label>
                  </div>
                </div>
              ) : null}
              {promotionType !== 'custom' ? (
                <label className="text-sm text-slate-300 sm:col-span-2">
                  Compra mínima (opcional)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={promotionMinimumPurchase}
                    onChange={(event) =>
                      setPromotionMinimumPurchase(event.target.value)
                    }
                    placeholder="Sin mínimo"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                  />
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                    La oferta solo se activa cuando la venta alcanza esta cantidad. Déjalo vacío si no aplica.
                  </span>
                </label>
              ) : null}
              <fieldset className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4 sm:col-span-2">
                <legend className="px-2 text-sm font-semibold text-white">
                  ¿Dónde aplica la promoción?
                </legend>
                <p className="mb-3 text-xs leading-5 text-slate-400">
                  Elegir productos destacados suele llamar más la atención y cuida mejor tu ganancia.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={
                      promotionType === 'special_price' ||
                      promotionType === 'buy_x_get_y'
                    }
                    onClick={() =>
                      setPromotionScope('all')
                    }
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      promotionScope === 'all'
                        ? 'border-cyan-300 bg-cyan-300 text-slate-950'
                        : 'border-slate-700 text-slate-300 hover:border-cyan-300/50'
                    }`}
                  >
                    <strong className="block">
                      Toda la tienda
                    </strong>
                    <span className="mt-1 block text-xs opacity-70">
                      Úsalo para una oferta general y corta.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPromotionScope(
                        'selected_products',
                      )
                    }
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                      promotionScope === 'selected_products'
                        ? 'border-fuchsia-300 bg-fuchsia-300 text-fuchsia-950'
                        : 'border-slate-700 text-slate-300 hover:border-fuchsia-300/50'
                    }`}
                  >
                    <strong className="block">
                      Productos elegidos
                    </strong>
                    <span className="mt-1 block text-xs opacity-70">
                      Uno o varios forman tu segmento.
                    </span>
                  </button>
                </div>

                {promotionScope === 'selected_products' ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-300">
                      {promotionType === 'special_price' ||
                      promotionType === 'buy_x_get_y'
                        ? 'Elige un producto'
                        : 'Elige uno o varios productos'}
                    </p>
                    {promotionType !== 'special_price' &&
                    promotionType !== 'buy_x_get_y' &&
                    promotionCategories.length > 0 ? (
                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300">
                          Selección rápida por categoría
                        </p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">
                          Un toque elige todo el segmento; después puedes quitar productos individuales.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {promotionCategories.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() =>
                                setPromotionProductIds(
                                  category.productIds,
                                )
                              }
                              className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:border-cyan-200"
                            >
                              {category.name} ({category.productIds.length})
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {products.map((product) => {
                        const checked =
                          promotionProductIds.includes(
                            product.id,
                          );

                        return (
                          <label
                            key={product.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                              checked
                                ? 'border-fuchsia-300/60 bg-fuchsia-300/10 text-white'
                                : 'border-slate-800 text-slate-400 hover:border-slate-600'
                            }`}
                          >
                            <input
                              type={
                                promotionType === 'special_price' ||
                                promotionType === 'buy_x_get_y'
                                  ? 'radio'
                                  : 'checkbox'
                              }
                              name={
                                promotionType === 'special_price' ||
                                promotionType === 'buy_x_get_y'
                                  ? 'special-price-product'
                                  : undefined
                              }
                              checked={checked}
                              onChange={() => {
                                if (
                                  promotionType === 'special_price' ||
                                  promotionType === 'buy_x_get_y'
                                ) {
                                  setPromotionProductIds([
                                    product.id,
                                  ]);
                                } else {
                                  togglePromotionProduct(
                                    product.id,
                                  );
                                }
                              }}
                              className="h-4 w-4 accent-fuchsia-300"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {product.name}
                            </span>
                            <span className="text-xs text-slate-500">
                              ${product.price.toFixed(2)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {products.length === 0 ? (
                      <p className="mt-2 text-xs text-amber-200">
                        Primero agrega productos al catálogo.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
              <label className="text-sm text-slate-300">
                Foto de promoción
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(event) =>
                    setPromotionFile(
                      event.target.files?.[0],
                    )
                  }
                  className="mt-2 block w-full rounded-xl border border-dashed border-slate-700 bg-slate-950 p-2.5 text-xs"
                />
              </label>
              <label className="text-sm text-slate-300">
                Comienza
                <input
                  type="datetime-local"
                  value={promotionStartsAt}
                  onChange={(event) =>
                    setPromotionStartsAt(
                      event.target.value,
                    )
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                />
              </label>
              <label className="text-sm text-slate-300">
                Termina
                <input
                  type="datetime-local"
                  value={promotionEndsAt}
                  onChange={(event) =>
                    setPromotionEndsAt(
                      event.target.value,
                    )
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                />
              </label>
            </div>

            {promotionError ? (
              <p className="mt-4 text-sm text-red-300">
                {promotionError}
              </p>
            ) : null}
            {promotionMessage ? (
              <p className="mt-4 text-sm text-emerald-300">
                {promotionMessage}
              </p>
            ) : null}
            <button
              disabled={savingPromotion}
              className="mt-5 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700"
            >
              {savingPromotion
                ? 'Publicando…'
                : 'Publicar promoción'}
            </button>
          </form>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">
              Promociones recientes
            </h2>
            <div className="mt-5 space-y-3">
              {promotions.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
                  Aún no hay promociones.
                </p>
              ) : (
                promotions.slice(0, 6).map(
                  (promotion) => (
                    <article
                      key={promotion.id}
                      className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3"
                    >
                      {promotion.imageUrl ? (
                        <img
                          src={promotion.imageUrl}
                          alt=""
                          className="h-16 w-16 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-cyan-500/30 to-violet-500/30" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {promotion.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          {promotion.type === 'percentage'
                            ? `${promotion.discountValue ?? 0}% de descuento`
                            : promotion.type === 'fixed'
                              ? `$${(promotion.discountValue ?? 0).toFixed(2)} de descuento`
                              : promotion.type === 'special_price'
                                ? `Precio especial $${(promotion.specialPrice ?? 0).toFixed(2)}`
                                : promotion.type === 'buy_x_get_y'
                                  ? `Compra ${promotion.buyQuantity ?? 0} y recibe ${promotion.getQuantity ?? 0} gratis`
                                  : 'Anuncio promocional'}
                        </p>
                        {promotion.minimumPurchase ? (
                          <p className="text-[11px] text-amber-200/80">
                            Compra mínima: ${promotion.minimumPurchase.toFixed(2)}
                          </p>
                        ) : null}
                        <p className="text-[11px] text-slate-500">
                          {promotion.scope === 'selected_products'
                            ? `${promotion.products?.length ?? 0} productos elegidos`
                            : 'Toda la tienda'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                            promotion.status === 'active'
                              ? 'bg-emerald-300/15 text-emerald-200'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {promotion.status === 'active'
                            ? 'Publicada'
                            : promotion.status === 'paused'
                              ? 'Pausada'
                              : promotion.status}
                        </span>
                        {promotion.status === 'active' ||
                        promotion.status === 'paused' ? (
                          <>
                            <button
                              type="button"
                              disabled={
                                changingPromotionId ===
                                promotion.id
                              }
                              onClick={() =>
                                void changePromotionStatus(
                                  promotion,
                                )
                              }
                              className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-cyan-300/50 disabled:opacity-40"
                            >
                              {changingPromotionId ===
                              promotion.id
                                ? 'Guardando…'
                                : promotion.status === 'active'
                                  ? 'Pausar'
                                  : 'Reactivar'}
                            </button>
                            <button
                              type="button"
                              disabled={
                                changingPromotionId ===
                                promotion.id
                              }
                              onClick={() =>
                                void closePromotion(
                                  promotion,
                                )
                              }
                              className="text-[10px] font-semibold text-red-300/80 hover:text-red-200 disabled:opacity-40"
                            >
                              Cerrar promoción
                            </button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  ),
                )
              )}
            </div>
          </div>
        </section>

        <section className={`${activeStudioSection === 'club' ? '' : 'hidden'} mt-8 overflow-hidden rounded-[2rem] border border-fuchsia-300/20 bg-gradient-to-br from-slate-900 via-slate-900 to-fuchsia-950/40`}>
          <div className="grid lg:grid-cols-[1.1fr_.9fr]">
            <div className="p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-fuchsia-300">
                Paso 5 · Club QR
              </p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
                Convierte visitas en clientes frecuentes
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                El QR general permite consultar promociones y avance. Las visitas solamente se suman con el QR único de un ticket pagado.
              </p>

              {activeLoyaltyProgram ? (
                <div className="mt-6 rounded-3xl border border-emerald-300/25 bg-emerald-300/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                        Club activo
                      </p>
                      <p className="mt-2 text-xl font-semibold">
                        {activeLoyaltyProgram.name}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-bold text-emerald-950">
                      {activeLoyaltyProgram.requiredVisits} visitas
                    </span>
                  </div>
                  <p className="mt-4 text-sm text-emerald-50/80">
                    Premio: {activeLoyaltyProgram.rewardDescription}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {Array.from({
                      length: Math.min(
                        activeLoyaltyProgram.requiredVisits,
                        12,
                      ),
                    }).map((_, index) => (
                      <span
                        key={index}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200/30 bg-slate-950/50 text-xs font-bold text-emerald-200"
                      >
                        {index + 1}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={createLoyaltyProgram}
                  className="mt-6 grid gap-4 sm:grid-cols-2"
                >
                  <label className="text-sm text-slate-300 sm:col-span-2">
                    Nombre del club
                    <div className="mt-2 flex gap-2">
                      <input
                        required
                        value={loyaltyName}
                        onChange={(event) =>
                          setLoyaltyName(
                            event.target.value,
                          )
                        }
                        className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-fuchsia-300"
                      />
                      <VoiceButton
                        target="loyalty-name"
                        listening={listening}
                        onListen={() =>
                          startDictation(
                            'loyalty-name',
                            setLoyaltyName,
                          )
                        }
                      />
                    </div>
                  </label>
                  <label className="text-sm text-slate-300">
                    Visitas para ganar
                    <select
                      value={requiredVisits}
                      onChange={(event) =>
                        setRequiredVisits(
                          event.target.value,
                        )
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                    >
                      {[4, 5, 6, 8, 10].map(
                        (visits) => (
                          <option
                            key={visits}
                            value={visits}
                          >
                            {visits} visitas
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="text-sm text-slate-300 sm:col-span-2">
                    Premio
                    <div className="mt-2 flex gap-2">
                      <input
                        required
                        value={rewardDescription}
                        onChange={(event) =>
                          setRewardDescription(
                            event.target.value,
                          )
                        }
                        placeholder="Ej. Manicure gratis o 25% de descuento"
                        className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-fuchsia-300"
                      />
                      <VoiceButton
                        target="loyalty-reward"
                        listening={listening}
                        onListen={() =>
                          startDictation(
                            'loyalty-reward',
                            setRewardDescription,
                          )
                        }
                      />
                    </div>
                  </label>
                  <div className="sm:col-span-2">
                    {loyaltyError ? (
                      <p className="mb-3 text-sm text-red-300">
                        {loyaltyError}
                      </p>
                    ) : null}
                    <button
                      disabled={savingLoyalty}
                      className="h-12 w-full rounded-xl bg-fuchsia-300 font-bold text-fuchsia-950 hover:bg-fuchsia-200 disabled:bg-slate-700"
                    >
                      {savingLoyalty
                        ? 'Creando Club…'
                        : 'Activar Club y crear QR'}
                    </button>
                  </div>
                </form>
              )}

              {loyaltyMessage ? (
                <p className="mt-4 text-sm text-emerald-300">
                  {loyaltyMessage}
                </p>
              ) : null}
            </div>

            <div className="flex min-h-[390px] items-center justify-center border-t border-white/10 bg-white/[0.03] p-6 lg:border-l lg:border-t-0">
              {qrDataUrl && site?.slug ? (
                <div className="w-full max-w-xs text-center">
                  <div className="rounded-[2rem] bg-white p-5 shadow-2xl shadow-fuchsia-950/50">
                    <img
                      src={qrDataUrl}
                      alt={`QR del club de ${site.name}`}
                      className="mx-auto aspect-square w-full"
                    />
                    <p className="mt-2 text-sm font-bold text-slate-950">
                      Escanea y consulta tus beneficios
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {site.name}
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <a
                      href={`/r/${site.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-600 text-sm font-semibold hover:bg-white/5"
                    >
                      Probar QR
                    </a>
                    <a
                      href={qrDataUrl}
                      download={`QR-${site.slug}.png`}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-white text-sm font-bold text-slate-950"
                    >
                      Descargar
                    </a>
                  </div>
                </div>
              ) : (
                <div className="max-w-xs text-center">
                  <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] border border-dashed border-fuchsia-300/40 bg-fuchsia-300/5 text-5xl">
                    ◫
                  </div>
                  <p className="mt-5 font-semibold">
                    Aquí aparecerá tu QR
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Publica la página y activa el Club para descargarlo.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          id="scratch-builder"
          className={`${activeStudioSection === 'club' ? '' : 'hidden'} mt-8 overflow-hidden rounded-[2rem] border border-amber-300/20 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40`}
        >
          <div className="grid lg:grid-cols-[1.15fr_.85fr]">
            <div className="p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">
                Paso 6 · Raspadito seguro
              </p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
                Premia una compra real, una sola vez
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                El cliente recibe una oportunidad únicamente después de pagar. Yalika decide el resultado, descuenta existencias y crea un código único si gana.
              </p>

              <button
                type="button"
                onClick={() => {
                  setAssistantText(
                    'Quiero un raspadito con 10 descuentos del 20%, con 10% de oportunidad. El premio dura 7 días.',
                  );
                  setAssistantMessage('');
                  setAssistantScratchPreview(undefined);
                  setShowAssistant(true);
                }}
                className="mt-5 flex w-full items-center justify-between gap-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-left transition hover:bg-cyan-300/15 sm:w-auto"
              >
                <span>
                  <strong className="block text-sm text-cyan-100">
                    Que Yalika lo prepare por mí
                  </strong>
                  <span className="mt-1 block text-xs text-cyan-100/65">
                    Habla o escribe lo que quieres regalar.
                  </span>
                </span>
                <span className="text-2xl text-cyan-300">✦</span>
              </button>

              <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-300/5 p-5">
                <p className="text-sm font-semibold text-amber-100">
                  ¿Cómo funciona?
                </p>
                <ol className="mt-3 grid gap-2 text-xs leading-5 text-slate-300 sm:grid-cols-2">
                  <li><strong className="text-amber-200">1.</strong> El cliente realiza y paga una compra.</li>
                  <li><strong className="text-amber-200">2.</strong> El QR del ticket le da un intento.</li>
                  <li><strong className="text-amber-200">3.</strong> Si gana, Yalika crea un código ganador.</li>
                  <li><strong className="text-amber-200">4.</strong> Caja valida el código al entregar el premio.</li>
                </ol>
              </div>

              {scratchCampaign?.status === 'active' ? (
                <div className="mt-6 rounded-3xl border border-emerald-300/25 bg-emerald-300/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                        Raspadito activo
                      </p>
                      <p className="mt-2 text-xl font-semibold">
                        {scratchCampaign.name}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-bold text-emerald-950">
                      {scratchCampaign._count.attempts} jugados
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {scratchCampaign.prizes.map((prize) => (
                      <div
                        key={prize.id}
                        className="rounded-2xl border border-emerald-200/15 bg-slate-950/35 px-4 py-3"
                      >
                        <p className="font-semibold text-emerald-50">
                          {prize.name}
                        </p>
                        <p className="mt-1 text-xs text-emerald-100/65">
                          {prize.probabilityBasisPoints / 100}% de oportunidad ·{' '}
                          {prize.remaining === null
                            ? 'sin límite'
                            : `${prize.remaining} disponibles`}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-emerald-100/70">
                    Puedes crear una campaña nueva abajo. La anterior se cerrará, pero sus premios ganados conservarán su registro.
                  </p>
                </div>
              ) : null}

              <form
                onSubmit={configureScratch}
                className="mt-6 space-y-5"
              >
                <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
                  <label className="text-sm text-slate-300">
                    Nombre del raspadito
                    <div className="mt-2 flex gap-2">
                      <input
                        required
                        value={scratchName}
                        onChange={(event) =>
                          setScratchName(event.target.value)
                        }
                        className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-amber-300"
                      />
                      <VoiceButton
                        target="scratch-name"
                        listening={listening}
                        onListen={() =>
                          startDictation(
                            'scratch-name',
                            setScratchName,
                          )
                        }
                      />
                    </div>
                  </label>
                  <label className="text-sm text-slate-300">
                    Días para usar el premio
                    <input
                      type="number"
                      min="1"
                      max="365"
                      required
                      value={scratchValidDays}
                      onChange={(event) =>
                        setScratchValidDays(event.target.value)
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-amber-300"
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Premios
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Lo que falte para llegar a 100% será “sigue participando”.
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">
                      Total: {scratchPrizes.reduce(
                        (total, prize) =>
                          total +
                          (Number(prize.probability) || 0),
                        0,
                      )}%
                    </span>
                  </div>

                  {scratchPrizes.map((prize, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/45 p-4 sm:grid-cols-[1fr_110px_120px_auto]"
                    >
                      <label className="text-xs text-slate-400">
                        ¿Qué puede ganar?
                        <input
                          value={prize.name}
                          onChange={(event) =>
                            updateScratchPrize(
                              index,
                              'name',
                              event.target.value,
                            )
                          }
                          placeholder="Ej. 15% de descuento"
                          className="mt-1.5 h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
                        />
                      </label>
                      <label className="text-xs text-slate-400">
                        ¿Cuántos de cada 100 pueden ganar?
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={prize.probability}
                          onChange={(event) =>
                            updateScratchPrize(
                              index,
                              'probability',
                              event.target.value,
                            )
                          }
                          className="mt-1.5 h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
                        />
                        <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                          Ej. 20 significa aproximadamente 20 ganadores de cada 100 intentos.
                        </span>
                      </label>
                      <label className="text-xs text-slate-400">
                        ¿Cuántos premios tienes?
                        <input
                          type="number"
                          min="1"
                          value={prize.stock}
                          onChange={(event) =>
                            updateScratchPrize(
                              index,
                              'stock',
                              event.target.value,
                            )
                          }
                          placeholder="Sin límite"
                          className="mt-1.5 h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
                        />
                        <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                          Vacío significa sin límite.
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={scratchPrizes.length === 1}
                        onClick={() =>
                          setScratchPrizes((current) =>
                            current.filter(
                              (_, prizeIndex) =>
                                prizeIndex !== index,
                            ),
                          )
                        }
                        className="self-end rounded-xl border border-red-400/25 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/10 disabled:opacity-30"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}

                  {scratchPrizes.length < 5 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setScratchPrizes((current) => [
                          ...current,
                          {
                            name: '',
                            probability: '5',
                            stock: '',
                          },
                        ])
                      }
                      className="rounded-xl border border-dashed border-amber-300/35 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-300/10"
                    >
                      + Agregar otro premio
                    </button>
                  ) : null}
                </div>

                {scratchError ? (
                  <p className="text-sm text-red-300">
                    {scratchError}
                  </p>
                ) : null}
                {scratchMessage ? (
                  <p className="text-sm text-emerald-300">
                    {scratchMessage}
                  </p>
                ) : null}
                <button
                  disabled={savingScratch || !activeLoyaltyProgram}
                  className="h-12 w-full rounded-xl bg-amber-300 font-bold text-amber-950 hover:bg-amber-200 disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {savingScratch
                    ? 'Activando…'
                    : scratchCampaign?.status === 'active'
                      ? 'Guardar como nueva campaña'
                      : 'Activar raspadito'}
                </button>
              </form>
            </div>

            <div className="border-t border-white/10 bg-white/[0.03] p-6 sm:p-8 lg:border-l lg:border-t-0">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
                Entregar premio
              </p>
              <h3 className="mt-2 text-2xl font-semibold">
                Canjear código
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Si el cliente gana, Yalika mostrará un código en su celular. No es su teléfono ni tiene que inventarlo. Escríbelo aquí al entregar el premio.
              </p>
              <form
                onSubmit={redeemScratch}
                className="mt-6"
              >
                <label className="text-sm text-slate-300">
                  Código ganador creado por Yalika
                  <input
                    value={redeemCode}
                    onChange={(event) =>
                      setRedeemCode(
                        event.target.value.toUpperCase(),
                      )
                    }
                    placeholder="YALIKA-XXXXXXXXXX"
                    className="mt-2 h-14 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-center font-mono text-lg font-bold uppercase tracking-wider outline-none focus:border-cyan-300"
                  />
                </label>
                {redeemError ? (
                  <p className="mt-3 text-sm text-red-300">
                    {redeemError}
                  </p>
                ) : null}
                {redeemMessage ? (
                  <p className="mt-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm text-emerald-200">
                    {redeemMessage}
                  </p>
                ) : null}
                <button
                  disabled={redeemingScratch}
                  className="mt-4 h-12 w-full rounded-xl bg-cyan-300 font-bold text-cyan-950 hover:bg-cyan-200 disabled:bg-slate-700"
                >
                  {redeemingScratch
                    ? 'Validando…'
                    : 'Validar y marcar entregado'}
                </button>
              </form>

              <div className="mt-8 rounded-3xl border border-slate-700 bg-slate-950/50 p-5">
                <p className="text-sm font-semibold text-white">
                  Protección incluida
                </p>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                  <li>• Una oportunidad por ticket pagado.</li>
                  <li>• Un código ganador solamente se usa una vez.</li>
                  <li>• Una devolución cancela el beneficio relacionado.</li>
                  <li>• Yalika registra quién entregó el premio.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>

      {showProductForm ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveProduct}
            className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Alta sencilla
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Producto con foto
                </h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  setShowProductForm(false)
                }
                className="text-2xl text-slate-500"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-sm text-slate-300">
                Fotografía principal
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="environment"
                  onChange={(event) =>
                    setProductFile(
                      event.target.files?.[0],
                    )
                  }
                  className="mt-2 block w-full rounded-xl border border-dashed border-slate-700 bg-slate-950 p-3 text-xs"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Después podrás agregar hasta 8 fotos desde la tarjeta del producto.
                </span>
              </label>
              <label className="block text-sm text-slate-300">
                Nombre
                <div className="mt-2 flex gap-2">
                  <input
                    required
                    value={productName}
                    onChange={(event) =>
                      setProductName(
                        event.target.value,
                      )
                    }
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                  />
                  <VoiceButton
                    target="product-name"
                    listening={listening}
                    onListen={() =>
                      startDictation(
                        'product-name',
                        setProductName,
                      )
                    }
                  />
                </div>
              </label>
              <fieldset className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold text-white">
                  ¿Este producto tiene tallas, colores o tamaños?
                </legend>
                <p className="mb-3 text-xs leading-5 text-slate-400">
                  Elige una opción y Yalika llevará la existencia de cada variante por separado.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['none', 'No, es único'],
                    ['clothing', 'Tallas de ropa'],
                    ['sizes', 'Tamaños'],
                    ['custom', 'Personalizado'],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        selectProductOptionMode(
                          mode as ProductOptionMode,
                        )
                      }
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        productOptionMode === mode
                          ? 'border-cyan-300 bg-cyan-300 text-slate-950'
                          : 'border-slate-700 text-slate-300 hover:border-cyan-400/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {productOptionMode !== 'none' ? (
                  <div className="mt-4 space-y-2">
                    {productVariants.map((variant, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[minmax(0,1fr)_90px] gap-2 sm:grid-cols-[1fr_110px_auto]"
                      >
                        <input
                          value={variant.name}
                          onChange={(event) =>
                            updateProductVariant(
                              index,
                              'name',
                              event.target.value,
                            )
                          }
                          placeholder="Ej. Mediana, Negro o Familiar"
                          aria-label={`Nombre de la opción ${index + 1}`}
                          className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-300"
                        />
                        <input
                          type="number"
                          min="0"
                          value={variant.stock}
                          onChange={(event) =>
                            updateProductVariant(
                              index,
                              'stock',
                              event.target.value,
                            )
                          }
                          placeholder="Existencia"
                          aria-label={`Existencia de la opción ${index + 1}`}
                          title="Cuántas piezas hay disponibles de esta talla, color o presentación."
                          className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-300"
                        />
                        <button
                          type="button"
                          disabled={productVariants.length === 1}
                          onClick={() =>
                            setProductVariants((current) =>
                              current.filter(
                                (_, variantIndex) =>
                                  variantIndex !== index,
                              ),
                            )
                          }
                          className="col-span-2 h-10 rounded-xl border border-red-400/25 px-3 text-xs font-semibold text-red-300 disabled:opacity-30 sm:col-span-1"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                    {productVariants.length < 30 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setProductVariants((current) => [
                            ...current,
                            { name: '', stock: '0' },
                          ])
                        }
                        className="rounded-xl border border-dashed border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-300"
                      >
                        + Agregar talla, color o presentación
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
              <div className={`grid gap-3 ${
                productOptionMode === 'none'
                  ? 'grid-cols-2'
                  : 'grid-cols-1'
              }`}>
                <label className="text-sm text-slate-300">
                  Precio de venta
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={productPrice}
                    onChange={(event) =>
                      setProductPrice(
                        event.target.value,
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                  />
                </label>
                {productOptionMode === 'none' ? (
                  <label className="text-sm text-slate-300">
                    Existencia total
                    <input
                      required
                      inputMode="numeric"
                      value={productStock}
                      onChange={(event) =>
                        setProductStock(
                          event.target.value,
                        )
                      }
                      title="Número de piezas disponibles cuando el producto no tiene tallas ni presentaciones."
                      className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                    />
                  </label>
                ) : null}
              </div>
              <label className="block text-sm text-slate-300">
                Código o SKU (opcional)
                <input
                  value={productSku}
                  onChange={(event) =>
                    setProductSku(
                      event.target.value,
                    )
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none"
                />
              </label>
            </div>
            {productError ? (
              <p className="mt-4 text-sm text-red-300">
                {productError}
              </p>
            ) : null}
            <button
              disabled={savingProduct}
              className="mt-6 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 disabled:bg-slate-700"
            >
              {savingProduct
                ? 'Guardando…'
                : 'Guardar producto'}
            </button>
          </form>
        </div>
      ) : null}

      {photoProduct ? (
        <div className="fixed inset-0 z-[83] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
          <section className="my-auto w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">
                  Galería del producto
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {photoProduct.name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  La foto principal aparece primero en la tienda. Puedes guardar hasta 8 fotografías.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoProduct(undefined)}
                className="text-2xl text-slate-500 hover:text-white"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...photoProduct.images]
                .sort(
                  (left, right) =>
                    Number(right.isPrimary) -
                      Number(left.isPrimary) ||
                    left.sortOrder - right.sortOrder,
                )
                .map((productImage) => (
                  <article
                    key={productImage.id}
                    className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950"
                  >
                    <div className="relative aspect-[4/3]">
                      <img
                        src={productImage.url}
                        alt={photoProduct.name}
                        className="h-full w-full object-cover"
                      />
                      {productImage.isPrimary ? (
                        <span className="absolute left-3 top-3 rounded-full bg-emerald-300 px-2.5 py-1 text-[10px] font-bold text-emerald-950">
                          Principal
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3">
                      <button
                        type="button"
                        disabled={
                          savingProductPhotos ||
                          productImage.isPrimary
                        }
                        onClick={() =>
                          void makeProductPhotoPrimary(
                            productImage.id,
                          )
                        }
                        className="min-h-9 rounded-xl border border-cyan-300/25 px-2 py-2 text-xs font-semibold leading-4 text-cyan-200 hover:bg-cyan-300/10 disabled:opacity-40"
                      >
                        Hacer principal
                      </button>
                      <button
                        type="button"
                        disabled={savingProductPhotos}
                        onClick={() =>
                          void removeProductPhoto(
                            productImage.id,
                          )
                        }
                        className="min-h-9 rounded-xl border border-red-300/25 px-2 py-2 text-xs font-semibold text-red-200 hover:bg-red-300/10 disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    </div>
                  </article>
                ))}
            </div>

            {photoProduct.images.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
                Este producto todavía no tiene fotografías.
              </p>
            ) : null}

            {photoError ? (
              <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {photoError}
              </p>
            ) : null}
            {photoMessage ? (
              <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {photoMessage}
              </p>
            ) : null}

            <label
              className={`mt-5 flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-bold transition ${
                savingProductPhotos ||
                photoProduct.images.length >= 8
                  ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                  : 'cursor-pointer bg-fuchsia-300 text-fuchsia-950 hover:bg-fuchsia-200'
              }`}
            >
              {savingProductPhotos
                ? 'Guardando fotografías…'
                : photoProduct.images.length >= 8
                  ? 'Límite de 8 fotografías alcanzado'
                  : '+ Agregar una o varias fotografías'}
              <input
                type="file"
                multiple
                disabled={
                  savingProductPhotos ||
                  photoProduct.images.length >= 8
                }
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) =>
                  void addProductPhotos(event)
                }
                className="hidden"
              />
            </label>
          </section>
        </div>
      ) : null}

      {editingProduct ? (
        <div className="fixed inset-0 z-[84] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveProductEdit}
            className="w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Editar artículo
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Cambiar producto
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(undefined)}
                className="text-2xl text-slate-500 hover:text-white"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-sm text-slate-300">
                Nombre
                <input
                  required
                  value={editProductName}
                  onChange={(event) =>
                    setEditProductName(event.target.value)
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Descripción
                <textarea
                  value={editProductDescription}
                  onChange={(event) =>
                    setEditProductDescription(event.target.value)
                  }
                  rows={3}
                  placeholder="Describe el producto para tus clientes."
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-cyan-400"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Precio de venta
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={editProductPrice}
                    onChange={(event) =>
                      setEditProductPrice(event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Este precio se actualizará también en caja.
                  </span>
                </label>
                <label className="text-sm text-slate-300">
                  Código o SKU
                  <input
                    value={editProductSku}
                    onChange={(event) =>
                      setEditProductSku(event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
                  />
                </label>
              </div>
              {editingProduct.variants.length === 0 ? (
                <label className="block text-sm text-slate-300">
                  Existencia
                  <input
                    required
                    type="number"
                    min="0"
                    value={editProductStock}
                    onChange={(event) =>
                      setEditProductStock(event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
                  />
                </label>
              ) : (
                <p className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-xs leading-5 text-cyan-100/75">
                  Este producto tiene tallas u opciones. Guarda estos cambios y usa “Tallas y opciones” para modificar sus existencias.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  const product = editingProduct;
                  setEditingProduct(undefined);
                  openPhotoManager(product);
                }}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/5 px-4 py-3 text-left text-sm font-semibold text-fuchsia-100 hover:bg-fuchsia-300/10"
              >
                <span>
                  Administrar fotografías
                  <span className="mt-1 block text-xs font-normal text-fuchsia-100/60">
                    Agrega hasta 8, elige la principal o quita una.
                  </span>
                </span>
                <span className="rounded-full bg-fuchsia-300/15 px-2.5 py-1 text-xs">
                  {editingProduct.images.length}
                </span>
              </button>
            </div>
            {productError ? (
              <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {productError}
              </p>
            ) : null}
            <button
              disabled={savingProductEdit}
              className="mt-6 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700"
            >
              {savingProductEdit
                ? 'Guardando…'
                : 'Guardar cambios'}
            </button>
          </form>
        </div>
      ) : null}

      {variantProduct ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
          <section className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Inventario sencillo
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {variantProduct.name}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Cada opción puede tener nombre, precio y existencia propios. Si dejas el precio vacío, usa el precio general del producto.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVariantProduct(undefined)}
                className="text-2xl text-slate-500 hover:text-white"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {variantProduct.variants.filter(
              (variant) => variant.status === 'active',
            ).length > 0 ? (
              <div className="mt-6 space-y-3">
                <div className="hidden grid-cols-[1fr_120px_100px_100px] gap-2 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:grid">
                  <span>Talla, color o presentación</span>
                  <span>Precio</span>
                  <span>Existencia</span>
                  <span />
                </div>
                {variantProduct.variants
                  .filter(
                    (variant) => variant.status === 'active',
                  )
                  .map((variant) => (
                    <div
                      key={variant.id}
                      className="grid grid-cols-2 items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-2 sm:grid-cols-[1fr_120px_100px_100px]"
                    >
                      <input
                        value={variantNames[variant.id] ?? variant.name}
                        onChange={(event) =>
                          setVariantNames((current) => ({
                            ...current,
                            [variant.id]: event.target.value,
                          }))
                        }
                        aria-label={`Nombre de ${variant.name}`}
                        className="col-span-2 h-10 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-cyan-300 sm:col-span-1"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={variantPrices[variant.id] ?? ''}
                        onChange={(event) =>
                          setVariantPrices((current) => ({
                            ...current,
                            [variant.id]: event.target.value,
                          }))
                        }
                        placeholder={`Base $${variantProduct.price.toFixed(2)}`}
                        aria-label={`Precio de ${variant.name}`}
                        className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-300"
                      />
                      <input
                        type="number"
                        min="0"
                        value={variantStocks[variant.id] ?? '0'}
                        onChange={(event) =>
                          setVariantStocks((current) => ({
                            ...current,
                            [variant.id]: event.target.value,
                          }))
                        }
                        aria-label={`Existencia de ${variant.name}`}
                        className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-300"
                      />
                      <button
                        type="button"
                        disabled={savingVariant}
                        onClick={() =>
                          void saveVariant(variant.id)
                        }
                        className="col-span-2 h-10 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-xs font-bold text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-40 sm:col-span-1"
                      >
                        Guardar
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
                Este producto todavía no tiene opciones. Agrega la primera abajo.
              </div>
            )}

            <form
              onSubmit={addProductVariant}
              className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/40 p-4"
            >
              <h3 className="font-semibold text-white">
                Agregar otra opción
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Puede ser una talla, un color, una presentación de comida o cualquier variación que vendas.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_100px_auto]">
                <label className="text-xs text-slate-400">
                  Nombre
                  <input
                    required
                    value={newVariantName}
                    onChange={(event) =>
                      setNewVariantName(event.target.value)
                    }
                    placeholder="Ej. Mediana, Negro o Familiar"
                    className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Precio opcional
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newVariantPrice}
                    onChange={(event) =>
                      setNewVariantPrice(event.target.value)
                    }
                    placeholder={`Base $${variantProduct.price.toFixed(2)}`}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Existencia
                  <input
                    required
                    type="number"
                    min="0"
                    value={newVariantStock}
                    onChange={(event) =>
                      setNewVariantStock(event.target.value)
                    }
                    className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300"
                  />
                </label>
                <button
                  disabled={savingVariant}
                  className="h-11 self-end rounded-xl bg-cyan-400 px-5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700"
                >
                  Agregar
                </button>
              </div>
            </form>

            {variantError ? (
              <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {variantError}
              </p>
            ) : null}
            {variantMessage ? (
              <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {variantMessage}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setShowAssistant(true);
          setAssistantMessage('');
        }}
        className="fixed bottom-5 right-5 z-[70] flex h-16 w-16 items-center justify-center rounded-full border border-cyan-200/40 bg-gradient-to-br from-cyan-300 via-cyan-400 to-violet-500 text-2xl font-black text-slate-950 shadow-[0_0_45px_rgba(34,211,238,.45)] transition hover:scale-105 sm:bottom-7 sm:right-7 sm:h-20 sm:w-20"
        aria-label="Hablar con Yalika"
        title="Hablar con Yalika"
      >
        <span className="absolute inset-2 animate-pulse rounded-full border border-white/45" />
        <span className="relative">✦</span>
      </button>

      {showAssistant ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-xl rounded-[2rem] border border-cyan-300/25 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/40">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-500 text-xl font-black text-slate-950 shadow-[0_0_25px_rgba(34,211,238,.35)]">
                  ✦
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
                    Dile a Yalika
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    ¿Qué quieres preparar?
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setShowAssistant(false)
                }
                className="text-2xl text-slate-500 hover:text-white"
              >
                ×
              </button>
            </div>

            <p className="mt-5 text-sm leading-6 text-slate-400">
              Puedes pedir un diseño, una promoción o un raspadito. Yalika prepara los campos y tú confirmas al final.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                [
                  'Raspadito fácil',
                  'Quiero un raspadito con 10 descuentos del 20%, con 10% de oportunidad. El premio dura 7 días.',
                ],
                [
                  'Diseño elegante',
                  'Quiero un diseño elegante para mi tienda.',
                ],
                [
                  'Promoción',
                  'Quiero una promoción del 15% de descuento.',
                ],
              ].map(([label, example]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setAssistantText(example);
                    setAssistantMessage('');
                    setAssistantScratchPreview(undefined);
                  }}
                  className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  {label}
                </button>
              ))}
            </div>

            <textarea
              autoFocus
              value={assistantText}
              onChange={(event) =>
                setAssistantText(
                  event.target.value,
                )
              }
              rows={4}
              placeholder="Habla o escribe aquí…"
              className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-base outline-none focus:border-cyan-400"
            />

            <button
              type="button"
              onClick={() =>
                startDictation(
                  'assistant',
                  setAssistantText,
                )
              }
              className={`mt-4 flex h-16 w-full items-center justify-center gap-3 rounded-2xl border text-base font-bold ${
                listening === 'assistant'
                  ? 'border-red-300 bg-red-400/10 text-red-200'
                  : 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20'
              }`}
            >
              <span
                className={`h-3 w-3 rounded-full ${
                  listening === 'assistant'
                    ? 'animate-pulse bg-red-400'
                    : 'bg-cyan-300'
                }`}
              />
              {listening === 'assistant'
                ? 'Te estoy escuchando…'
                : 'Hablar ahora'}
            </button>

            {assistantMessage ? (
              <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {assistantMessage}
              </p>
            ) : null}

            {assistantScratchPreview ? (
              <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                  Propuesta preparada
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {assistantScratchPreview.prize.name}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-300">
                  {assistantScratchPreview.explanation}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowAssistant(false);
                    window.setTimeout(() => {
                      document
                        .getElementById('scratch-builder')
                        ?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                    }, 100);
                  }}
                  className="mt-3 h-10 w-full rounded-xl bg-amber-300 text-sm font-bold text-amber-950 hover:bg-amber-200"
                >
                  Ver y confirmar raspadito
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={applyAssistantCommand}
              className="mt-4 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300"
            >
              Preparar para revisar
            </button>
            <p className="mt-3 text-center text-xs text-slate-500">
              Yalika no publicará nada sin tu confirmación.
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}

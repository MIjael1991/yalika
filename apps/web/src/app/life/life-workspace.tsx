"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { BusinessAssistantWorkspace } from "../asistente/business-assistant-workspace";

type UserSummary = {
  id: string;
  name: string;
  email?: string;
};

type CurrentUser = UserSummary & {
  email: string;
  companyId: string;
  role: {
    id: string;
    name: string;
  } | null;
};

type SpaceMember = {
  id: string;
  role: string;
  status: string;
  user: UserSummary;
};

type Space = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  timezone: string;
  status: string;
  companyId: string;
  ownerUserId: string;
  owner: UserSummary;
  members: SpaceMember[];
  _count: {
    tasks: number;
  };
  reused?: boolean;
};

type TaskActivity = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
  } | null;
};

type TaskRecurrenceSummary = {
  id: string;
  frequency: string;
  interval: number;
  timezone: string;
  status: string;
  startsAt: string;
  nextOccurrenceAt: string;
  endsAt: string | null;
  reminderMinutesBefore: number | null;
};

type TaskReminderSummary = {
  id: string;
  leadMinutes: number;
  remindAt: string;
  status: string;
  snoozeCount: number;
  userId: string;
};

type LifeTask = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
  dueAt: string | null;
  estimatedMinutes: number | null;
  postponedUntil: string | null;
  completedAt: string | null;
  version: number;
  recurrenceId: string | null;
  recurrenceOccurrenceAt: string | null;
  recurrence: TaskRecurrenceSummary | null;
  reminder: TaskReminderSummary | null;
  space: {
    id: string;
    name: string;
    type: string;
  } | null;
  user: UserSummary | null;
  createdBy: UserSummary | null;
  claimedBy: UserSummary | null;
  completedBy: UserSummary | null;
  activities: TaskActivity[];
};

type ReminderItem = TaskReminderSummary & {
  originalRemindAt: string;
  urgency: "due" | "upcoming";
  task: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    status: string;
    dueAt: string | null;
    spaceId: string | null;
    space: {
      id: string;
      name: string;
      type: string;
    } | null;
  };
};

type CaptureProposal = {
  intent: "create" | "cancel" | "complete" | "find";
  title: string;
  category: string;
  requestedSpaceType: string | null;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  reasons: string[];
  sensitive: boolean;
  privacyWarning: string | null;
  destinationWarning: string | null;
  needsSpaceConfirmation: boolean;
  suggestedSpace: {
    id: string;
    name: string;
    type: string;
  };
  alternatives: Array<{
    id: string;
    name: string;
    type: string;
    score: number;
  }>;
  dueAt: string | null;
  recurrenceFrequency: "daily" | "weekly" | "monthly" | "yearly" | null;
  recurrenceInterval: number | null;
  recurrenceEndsAt: string | null;
  reminderMinutesBefore: number | null;
  temporalSummary: string | null;
  needsTemporalConfirmation: boolean;
  canUseTemporalProposal: boolean;
  actionProposal: {
    intent: "cancel" | "complete" | "find";
    query: string;
    scope:
      "today" | "tomorrow" | "today_and_tomorrow" | "series" | "unspecified";
    recommendedTaskId: string | null;
    message: string;
    matches: Array<{
      id: string;
      title: string;
      status: string;
      dueAt: string | null;
      spaceId: string | null;
      recurrenceId: string | null;
      recurrence: {
        status: string;
        nextOccurrenceAt: string;
        endsAt: string | null;
      } | null;
      score: number;
      dateMatches: boolean;
      space: {
        id: string;
        name: string;
        type: string;
      } | null;
    }>;
  } | null;
};

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  code?: "DUPLICATE_TASK" | "SIMILAR_TASK_EXISTS";
  similarTasks?: SimilarTask[];
};

type SimilarTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  spaceId: string | null;
  similarity: number;
};

type TaskCreatePayload = Record<string, unknown> & {
  title: string;
  spaceId: string;
};

type DuplicateWarning = {
  code: "DUPLICATE_TASK" | "SIMILAR_TASK_EXISTS";
  message: string;
  similarTasks: SimilarTask[];
  payload: TaskCreatePayload;
  source: "capture" | "form";
  destinationName: string;
};

type RecentCreation = {
  task: LifeTask;
  destinationName: string;
  undone: boolean;
  restored?: boolean;
};

type BriefingTask = {
  id: string;
  title: string;
  category: string | null;
  priority: string;
  status: string;
  dueAt: string;
  space: {
    id: string;
    name: string;
    type: string;
  } | null;
};

type DailyBriefing = {
  generatedAt: string;
  greeting: string;
  today: {
    count: number;
    tasks: BriefingTask[];
  };
  overdue: {
    count: number;
    tasks: BriefingTask[];
  };
  tomorrowCount: number;
  dueReminderCount: number;
  business: {
    lowStockProducts: Array<{
      id: string;
      name: string;
      available: number;
      lowStockAt: number;
    }>;
    yesterdaySales: {
      count: number;
      total: number;
    };
    previousSales: {
      count: number;
      total: number;
    };
    salesChangePercent: number | null;
  };
  suggestions: Array<{
    id: string;
    kind: "reminder" | "inventory" | "sales" | "planning";
    title: string;
    detail: string;
    actionHref: string;
    actionLabel: string;
  }>;
};

type AssistantPreference = {
  preferredName: string | null;
  automaticLocale: boolean;
  voiceLocale: string;
  voiceName: string | null;
  voiceRate: number;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal?: boolean;
      0?: {
        transcript?: string;
      };
    };
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: ApiErrorPayload | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const sessionExpiredEvent = "orion-session-expired";

const voiceLocaleOptions = [
  { value: "es-MX", label: "Español · México" },
  { value: "es-US", label: "Español · Estados Unidos" },
  { value: "es-ES", label: "Español · España" },
  { value: "en-US", label: "English · United States" },
  { value: "pt-BR", label: "Português · Brasil" },
];

const activeStatuses = new Set([
  "pending",
  "assigned",
  "in_progress",
  "postponed",
]);

const spaceTypeLabels: Record<string, string> = {
  personal: "Personal",
  family: "Familia",
  business: "Negocio",
  school: "Escuela",
  health: "Salud",
  government: "Gobierno",
  community: "Comunidad",
};

type OrionAreaKind =
  "family" | "business" | "school" | "health" | "government" | "community";

type OrionAreaAction = {
  title: string;
  description: string;
  taskTitle?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  href?: string;
};

const orionAreaGuides: Record<
  OrionAreaKind,
  {
    label: string;
    description: string;
    privacy: string;
    actions: OrionAreaAction[];
  }
> = {
  family: {
    label: "Familia",
    description:
      "Reúne salidas, compras, citas y pendientes que necesitan coordinación.",
    privacy:
      "Solo las personas que agregues al espacio familiar podrán ver sus actividades.",
    actions: [
      {
        title: "Preparar una salida",
        description: "Documentos, traslado y lo necesario antes de salir.",
        taskTitle:
          "Preparar documentos, traslado y lo necesario para la salida familiar",
        priority: "high",
      },
      {
        title: "Hacer lista de compras",
        description: "Deja una lista clara para no olvidar lo importante.",
        taskTitle: "Preparar lista de compras de la familia",
      },
      {
        title: "Organizar una cita",
        description: "Agrega fecha, aviso y responsable.",
        taskTitle: "Organizar cita o reunión familiar",
      },
    ],
  },
  business: {
    label: "Negocio",
    description:
      "Vende, revisa existencias y prepara promociones sin mezclar movimientos sin cobrar.",
    privacy:
      "Ventas, dinero e inventario permanecen dentro de la empresa y sus permisos.",
    actions: [
      {
        title: "Abrir punto de venta",
        description: "Inicia una venta y cobra desde caja.",
        href: "/pos",
      },
      {
        title: "Revisar inventario",
        description: "Busca faltantes y productos con poca existencia.",
        href: "/pos",
      },
      {
        title: "Página y promociones",
        description: "Actualiza catálogo, descuentos, QR y publicación.",
        href: "/sites",
      },
    ],
  },
  school: {
    label: "Educación",
    description:
      "Organiza clases, tareas, evaluaciones y reuniones sin perder el seguimiento.",
    privacy:
      "La información escolar solo será visible para integrantes autorizados.",
    actions: [
      {
        title: "Preparar clase o examen",
        description: "Define lo necesario y agrega una fecha.",
        taskTitle: "Preparar clase, material o examen",
        priority: "high",
      },
      {
        title: "Revisar tareas",
        description: "Agenda el seguimiento de trabajos pendientes.",
        taskTitle: "Revisar tareas y avances pendientes",
      },
      {
        title: "Reunión con familias",
        description: "Organiza temas, fecha y recordatorio.",
        taskTitle: "Preparar reunión con madres y padres de familia",
      },
    ],
  },
  health: {
    label: "Salud",
    description:
      "Prepara consultas y recordatorios personales sin sustituir al profesional de salud.",
    privacy:
      "Yaleka guardará estas actividades en Mi vida. No se comparten automáticamente.",
    actions: [
      {
        title: "Preparar una consulta",
        description:
          "Anota estudios, documentos y preguntas para el profesional.",
        taskTitle: "Preparar estudios, documentos y preguntas para la consulta",
        priority: "high",
      },
      {
        title: "Recordatorio indicado",
        description: "Registra únicamente una indicación que ya recibiste.",
        taskTitle: "Seguir la indicación de salud que ya recibí",
        priority: "high",
      },
      {
        title: "Movimiento y bienestar",
        description: "Reserva tiempo para una actividad saludable.",
        taskTitle: "Reservar tiempo para movimiento y bienestar",
      },
    ],
  },
  government: {
    label: "Gobierno",
    description:
      "Controla citas, documentos, pagos y vencimientos de tus trámites.",
    privacy:
      "Tus trámites se guardan en Mi vida y no se muestran a otras personas.",
    actions: [
      {
        title: "Dar seguimiento a trámite",
        description: "Registra el paso pendiente y su fecha límite.",
        taskTitle: "Dar seguimiento al trámite pendiente",
        priority: "high",
      },
      {
        title: "Preparar documentos",
        description: "Haz una lista antes de acudir a la oficina.",
        taskTitle: "Preparar documentos necesarios para el trámite",
      },
      {
        title: "Registrar cita o pago",
        description: "Agrega fecha y un aviso anticipado.",
        taskTitle: "Registrar cita, pago o vencimiento de gobierno",
        priority: "high",
      },
    ],
  },
  community: {
    label: "Comunidad",
    description:
      "Organiza asambleas, recorridos, solicitudes y compromisos con seguimiento.",
    privacy:
      "Se prepara primero de forma privada; tú decides después qué compartir y con quién.",
    actions: [
      {
        title: "Preparar asamblea",
        description: "Anota temas, lugar, hora y responsables.",
        taskTitle: "Preparar temas, lugar y responsables de la asamblea",
        priority: "high",
      },
      {
        title: "Registrar visita",
        description: "Da seguimiento a una visita de trabajo o territorio.",
        taskTitle: "Registrar visita y acuerdos de seguimiento",
      },
      {
        title: "Atender solicitud",
        description: "Conserva el compromiso y su próxima acción.",
        taskTitle: "Atender solicitud y registrar la próxima acción",
        priority: "high",
      },
    ],
  },
};

function OrionBrandMark({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <circle cx="24" cy="24" r="16.5" stroke="#60A5FA" strokeWidth="5" />
      <path
        d="M12.4 35.6A16.4 16.4 0 0 1 8 24c0-9 7.2-16.3 16.2-16.5"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="M35.6 12.4A16.4 16.4 0 0 1 40 24c0 9-7.2 16.3-16.2 16.5"
        stroke="#22D3EE"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <circle cx="38" cy="10" r="4.5" fill="white" />
      <circle cx="9" cy="37" r="3.5" fill="#38BDF8" />
    </svg>
  );
}

function OrionAreaIcon({ kind }: { kind: OrionAreaKind }) {
  const common = {
    width: 25,
    height: 25,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (kind === "business") {
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="12" rx="2" />
        <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 11.5h18M10 11.5v2h4v-2" />
      </svg>
    );
  }

  if (kind === "school") {
    return (
      <svg {...common}>
        <path d="m3 9 9-5 9 5-9 5-9-5Z" />
        <path d="M7 12v4.5c2.8 2 7.2 2 10 0V12M21 9v6" />
      </svg>
    );
  }

  if (kind === "health") {
    return (
      <svg {...common}>
        <path d="M20.8 4.8c-2.1-2.1-5.5-1.7-7.3.7L12 7.4l-1.5-1.9c-1.8-2.4-5.2-2.8-7.3-.7-2.3 2.3-2.2 6 .1 8.3L12 21l8.7-7.9c2.3-2.3 2.4-6 .1-8.3Z" />
      </svg>
    );
  }

  if (kind === "government") {
    return (
      <svg {...common}>
        <path d="m3 9 9-5 9 5H3ZM5 20h14M6 9v8M10 9v8M14 9v8M18 9v8M3 17h18" />
      </svg>
    );
  }

  if (kind === "community") {
    return (
      <svg {...common}>
        <circle cx="12" cy="7" r="3" />
        <circle cx="5" cy="10" r="2" />
        <circle cx="19" cy="10" r="2" />
        <path d="M6.5 20v-2.2A4.5 4.5 0 0 1 11 13.3h2a4.5 4.5 0 0 1 4.5 4.5V20M2 20v-1.2A3.8 3.8 0 0 1 5.8 15h1M22 20v-1.2a3.8 3.8 0 0 0-3.8-3.8h-1" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2.5 20v-2a4.5 4.5 0 0 1 4.5-4.5h2A4.5 4.5 0 0 1 13.5 18v2M10.5 20v-1.5a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5V20" />
    </svg>
  );
}

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  assigned: "Asignada",
  in_progress: "En proceso",
  postponed: "Pospuesta",
  completed: "Terminada",
  cancelled: "Cancelada",
};

const actionLabels: Record<string, string> = {
  created: "creó la tarea",
  claimed: "se encargó de la tarea",
  completed: "terminó la tarea",
  cancelled: "canceló la tarea",
  note_added: "agregó un dato",
  postponed: "pospuso la tarea",
  reopened: "reabrió la tarea",
  recurrence_generated: "preparó la siguiente repetición",
  recurrence_cancelled: "detuvo las siguientes repeticiones",
  cancelled_with_recurrence: "canceló una repetición futura",
  reminder_snoozed: "pospuso el recordatorio",
  reminder_acknowledged: "confirmó que vio el recordatorio",
};

const recurrenceLabels: Record<string, string> = {
  daily: "Cada día",
  weekly: "Cada semana",
  monthly: "Cada mes",
  yearly: "Cada año",
};

const categoryIcons: Record<string, string> = {
  personal: "✓",
  purchase: "🛒",
  payment: "🧾",
  family: "⌂",
  school: "✎",
  business: "▣",
  health: "♥",
  vehicle: "◆",
};

const categoryLabels: Record<string, string> = {
  personal: "Personal",
  purchase: "Compra",
  payment: "Pago",
  family: "Familia",
  school: "Escuela",
  business: "Negocio",
  health: "Salud",
  vehicle: "Vehículo",
};

const confidenceLabels: Record<CaptureProposal["confidence"], string> = {
  high: "Coincidencia alta",
  medium: "Coincidencia probable",
  low: "Necesito tu confirmación",
};

function getErrorMessage(payload: ApiErrorPayload | null) {
  if (Array.isArray(payload?.message)) {
    return payload.message.join(". ");
  }

  return payload?.message ?? payload?.error ?? "Ocurrió un error en Yaleka";
}

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/orion/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("Yaleka respondió con información que no se pudo leer");
    }
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(sessionExpiredEvent));
    }

    const errorPayload = payload as ApiErrorPayload | null;
    throw new ApiRequestError(
      getErrorMessage(errorPayload),
      response.status,
      errorPayload,
    );
  }

  return payload as T;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin horario fijo";
  }

  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function displaySpaceName(space: Space, allSpaces: Space[]) {
  const normalizedName = space.name.trim().toLocaleLowerCase("es-MX");
  const matches = allSpaces.filter(
    (candidate) =>
      candidate.type === space.type &&
      candidate.name.trim().toLocaleLowerCase("es-MX") === normalizedName,
  );

  if (matches.length < 2) {
    return space.name;
  }

  const position = matches.findIndex((candidate) => candidate.id === space.id);
  return `${space.name} · espacio ${Math.max(0, position) + 1}`;
}

function recurrenceDisplayText(task: LifeTask) {
  const recurrence = task.recurrence;

  if (!recurrence) {
    return null;
  }

  if (recurrence.status === "finished" && activeStatuses.has(task.status)) {
    return "Última ocasión";
  }

  const shortDailySeries = Boolean(
    recurrence.frequency === "daily" &&
    recurrence.interval === 1 &&
    recurrence.endsAt &&
    new Date(recurrence.endsAt).getTime() -
      new Date(recurrence.startsAt).getTime() <=
      48 * 60 * 60_000,
  );
  const label = shortDailySeries
    ? "2 ocasiones"
    : (recurrenceLabels[recurrence.frequency] ?? "Recurrente");

  return recurrence.status === "cancelled" ? `${label} · detenida` : label;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function tomorrowAtNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function reminderLabel(minutes: number) {
  if (minutes === 0) {
    return "A la hora";
  }

  if (minutes === 1440) {
    return "1 día antes";
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hora" : "horas"} antes`;
  }

  return `${minutes} min antes`;
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

function formatVoiceText(value: string) {
  const protectedText = value.replace(/punto de venta/gi, "PUNTO_DE_VENTA");
  const formatted = protectedText
    .replace(/\bpunto y aparte\b/gi, ".\n\n")
    .replace(/\bnuevo párrafo\b|\bnuevo parrafo\b/gi, "\n\n")
    .replace(/\bnueva línea\b|\bnueva linea\b/gi, "\n")
    .replace(/\bpunto y coma\b/gi, ";")
    .replace(/\bdos puntos\b/gi, ":")
    .replace(/\bsigno de interrogación\b|\bsigno de interrogacion\b/gi, "?")
    .replace(/\bsigno de admiración\b|\bsigno de admiracion\b/gi, "!")
    .replace(/\bcoma\b/gi, ",")
    .replace(/\bpunto\b/gi, ".")
    .replace(/PUNTO_DE_VENTA/g, "punto de venta")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?=[^\s\n])/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const bulletCommand = formatted.match(
    /^pon(?:me)?(?: esto)? en viñetas\s*:?[ \t]*/i,
  );

  if (!bulletCommand) {
    return formatted;
  }

  const content = formatted.slice(bulletCommand[0].length);
  const paragraphBreak = content.indexOf("\n\n");
  const listContent =
    paragraphBreak >= 0 ? content.slice(0, paragraphBreak) : content;
  const remaining =
    paragraphBreak >= 0 ? content.slice(paragraphBreak + 2).trim() : "";
  const items = listContent
    .split(/[,;]|\.(?=\s|$)/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length < 2) {
    return formatted;
  }

  return [items.map((item) => `- ${item}`).join("\n"), remaining]
    .filter(Boolean)
    .join("\n\n");
}

function personalizeGreeting(greeting: string, preferredName: string) {
  const trimmedName = preferredName.trim() || "Usuario";
  return greeting.includes(",")
    ? `${greeting.slice(0, greeting.indexOf(","))}, ${trimmedName}`
    : `${greeting}, ${trimmedName}`;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfCalendarWeek(value: Date) {
  const start = startOfLocalDay(value);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

function getCalendarRange(value: Date, mode: "week" | "month") {
  if (mode === "week") {
    const from = startOfCalendarWeek(value);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }

  const monthStart = new Date(value.getFullYear(), value.getMonth(), 1);
  const from = startOfCalendarWeek(monthStart);
  const to = new Date(from);
  to.setDate(to.getDate() + 42);
  return { from, to };
}

function calendarDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function listCalendarDays(from: Date, to: Date) {
  const days: Date[] = [];
  const cursor = new Date(from);

  while (cursor < to) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}

export function LifeWorkspace({ currentUser }: { currentUser: CurrentUser }) {
  const router = useRouter();
  const userId = currentUser.id;
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [tasks, setTasks] = useState<LifeTask[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [view, setView] = useState<"active" | "completed">("active");
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [processingReminderId, setProcessingReminderId] = useState("");
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState<Date>();
  const [showSpaceForm, setShowSpaceForm] = useState(false);
  const [spaceForm, setSpaceForm] = useState({
    name: "",
    description: "",
    type: "",
  });
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    category: "personal",
    priority: "normal",
    dueAt: "",
    estimatedMinutes: "30",
    userId: "",
    recurrenceFrequency: "",
    recurrenceInterval: "1",
    recurrenceEndsAt: "",
    reminderMinutesBefore: "",
  });
  const [memberForm, setMemberForm] = useState({
    email: "",
    role: "member",
  });
  const [savingSpace, setSavingSpace] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [briefing, setBriefing] = useState<DailyBriefing>();
  const [loadingBriefing, setLoadingBriefing] = useState(true);
  const [businessMode, setBusinessMode] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState(false);
  const [captureMode, setCaptureMode] = useState<"task" | "text">("task");
  const [captureText, setCaptureText] = useState("");
  const [captureProposal, setCaptureProposal] = useState<CaptureProposal>();
  const [captureSpaceId, setCaptureSpaceId] = useState("");
  const [interpretingCapture, setInterpretingCapture] = useState(false);
  const [savingCapture, setSavingCapture] = useState(false);
  const [captureNotice, setCaptureNotice] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [spacesError, setSpacesError] = useState("");
  const [preparingAgenda, setPreparingAgenda] = useState(false);
  const prepareLock = useRef(false);
  const [captureActionTargetId, setCaptureActionTargetId] = useState("");
  const [captureActionWholeSeries, setCaptureActionWholeSeries] =
    useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning>();
  const [recentCreation, setRecentCreation] = useState<RecentCreation>();
  const [listening, setListening] = useState(false);
  const [readingTasks, setReadingTasks] = useState(false);
  const [assistantPreference, setAssistantPreference] =
    useState<AssistantPreference>({
      preferredName: currentUser.name.trim().split(/\s+/)[0] || "Usuario",
      automaticLocale: true,
      voiceLocale: "es-MX",
      voiceName: null,
      voiceRate: 0.95,
    });
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [savingVoiceSettings, setSavingVoiceSettings] = useState(false);
  const [voiceSettingsNotice, setVoiceSettingsNotice] = useState("");
  const [showAgenda, setShowAgenda] = useState(false);
  const [agendaMode, setAgendaMode] = useState<"week" | "month">("week");
  const [agendaAnchor, setAgendaAnchor] = useState(() => new Date());
  const [agendaTasks, setAgendaTasks] = useState<LifeTask[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [agendaError, setAgendaError] = useState("");
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [appInstalled, setAppInstalled] = useState(false);
  const [deviceNotice, setDeviceNotice] = useState("");
  const [selectedArea, setSelectedArea] = useState<OrionAreaKind | null>(null);
  const [areaFilter, setAreaFilter] = useState<OrionAreaKind | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseTextRef = useRef("");
  const voiceFinalTextRef = useRef("");
  const notifyingRef = useRef(false);

  const activeSpace = spaces.find((space) => space.id === selectedSpaceId);
  const currentMembership = activeSpace?.members.find(
    (member) => member.user.id === userId,
  );
  const canEdit = Boolean(
    currentMembership && currentMembership.role !== "viewer",
  );
  const canManageMembers = Boolean(
    activeSpace?.type !== "personal" &&
    ["owner", "admin"].includes(currentMembership?.role ?? ""),
  );
  const writableSpaces = spaces.filter((space) =>
    space.members.some(
      (member) => member.user.id === userId && member.role !== "viewer",
    ),
  );
  const duplicateSpaceNames = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; type: string; count: number }
    >();

    for (const space of spaces) {
      const key = `${space.type}:${space.name.trim().toLocaleLowerCase("es-MX")}`;
      const current = groups.get(key);
      groups.set(key, {
        name: space.name,
        type: space.type,
        count: (current?.count ?? 0) + 1,
      });
    }

    return [...groups.values()].filter((group) => group.count > 1);
  }, [spaces]);
  const agendaRange = useMemo(
    () => getCalendarRange(agendaAnchor, agendaMode),
    [agendaAnchor, agendaMode],
  );
  const agendaDays = useMemo(
    () => listCalendarDays(agendaRange.from, agendaRange.to),
    [agendaRange],
  );
  const agendaTasksByDay = useMemo(() => {
    const grouped = new Map<string, LifeTask[]>();

    for (const task of agendaTasks) {
      if (!task.dueAt) continue;
      const key = calendarDateKey(task.dueAt);
      grouped.set(key, [...(grouped.get(key) ?? []), task]);
    }

    return grouped;
  }, [agendaTasks]);

  const refreshSpaces = useCallback(async () => {
    if (!userId) {
      setLoadingSpaces(false);
      return;
    }

    try {
      setSpacesError("");
      const nextSpaces = await apiRequest<Space[]>("space");
      setSpaces(nextSpaces);
      setSelectedSpaceId((current) =>
        current && nextSpaces.some((space) => space.id === current)
          ? current
          : (nextSpaces[0]?.id ?? ""),
      );
      setError("");
    } catch (loadError) {
      setSpacesError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar tus espacios",
      );
    } finally {
      setLoadingSpaces(false);
    }
  }, [userId]);

  const refreshTasks = useCallback(
    async (silent = false) => {
      if (!selectedSpaceId || !userId) {
        setTasks([]);
        return;
      }

      if (!silent) {
        setLoadingTasks(true);
      }

      try {
        const nextTasks = await apiRequest<LifeTask[]>(
          `task/space/${encodeURIComponent(selectedSpaceId)}`,
        );
        setTasks(nextTasks);
        setLastSync(new Date());
        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron sincronizar las tareas",
        );
      } finally {
        if (!silent) {
          setLoadingTasks(false);
        }
      }
    },
    [selectedSpaceId, userId],
  );

  const refreshReminders = useCallback(async () => {
    if (!userId) {
      setReminders([]);
      return;
    }

    try {
      const nextReminders = await apiRequest<ReminderItem[]>("reminder");
      setReminders(nextReminders);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar tus recordatorios",
      );
    }
  }, [userId]);

  const refreshBriefing = useCallback(async () => {
    if (!userId) {
      setBriefing(undefined);
      setLoadingBriefing(false);
      return;
    }

    try {
      const nextBriefing = await apiRequest<DailyBriefing>("briefing/today");
      setBriefing(nextBriefing);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo preparar el resumen de hoy",
      );
    } finally {
      setLoadingBriefing(false);
    }
  }, [userId]);

  const refreshAssistantPreference = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      const preference = await apiRequest<AssistantPreference>(
        "assistant-preference",
      );
      setAssistantPreference(preference);
    } catch {
      setVoiceSettingsNotice(
        "Yaleka usará la voz recomendada del dispositivo hasta que guardes tu preferencia.",
      );
    }
  }, [userId]);

  const refreshAgenda = useCallback(async () => {
    if (!userId) {
      setAgendaTasks([]);
      return;
    }

    setLoadingAgenda(true);
    setAgendaError("");

    try {
      const query = new URLSearchParams({
        from: agendaRange.from.toISOString(),
        to: agendaRange.to.toISOString(),
      });
      const nextTasks = await apiRequest<LifeTask[]>(`task/agenda?${query}`);
      setAgendaTasks(nextTasks);
    } catch (loadError) {
      setAgendaError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar la agenda",
      );
    } finally {
      setLoadingAgenda(false);
    }
  }, [agendaRange, userId]);

  useEffect(() => {
    const redirectToLogin = () => {
      router.replace("/login");
      router.refresh();
    };

    window.addEventListener(sessionExpiredEvent, redirectToLogin);

    return () =>
      window.removeEventListener(sessionExpiredEvent, redirectToLogin);
  }, [router]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshSpaces();
    }, 0);

    return () => window.clearTimeout(initialLoad);
  }, [refreshSpaces]);

  useEffect(() => {
    if (!selectedSpaceId) {
      return;
    }

    const initialLoad = window.setTimeout(() => {
      void refreshTasks();
    }, 0);

    const interval = window.setInterval(() => {
      void refreshTasks(true);
    }, 5000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [refreshTasks, selectedSpaceId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshReminders();
    }, 0);
    const interval = window.setInterval(() => {
      void refreshReminders();
    }, 30_000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [refreshReminders]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshBriefing();
    }, 0);
    const interval = window.setInterval(() => {
      void refreshBriefing();
    }, 60_000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [refreshBriefing]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshAssistantPreference();
    }, 0);

    return () => window.clearTimeout(initialLoad);
  }, [refreshAssistantPreference]);

  useEffect(() => {
    if (!showAgenda) return;

    const loadAgenda = window.setTimeout(() => {
      void refreshAgenda();
    }, 0);

    return () => window.clearTimeout(loadAgenda);
  }, [refreshAgenda, showAgenda, recentCreation]);

  useEffect(() => {
    const syncInstalledState = window.setTimeout(() => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in window.navigator &&
          Boolean(
            (window.navigator as Navigator & { standalone?: boolean })
              .standalone,
          ));
      setAppInstalled(standalone);
    }, 0);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setAppInstalled(true);
      setInstallPrompt(null);
      setDeviceNotice("La aplicación quedó instalada en este dispositivo.");
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.clearTimeout(syncInstalledState);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    const syncNotificationState = window.setTimeout(() => {
      if (!("Notification" in window)) {
        setNotificationPermission("unsupported");
        setNotificationsEnabled(false);
        return;
      }

      setNotificationPermission(Notification.permission);
      setNotificationsEnabled(
        Notification.permission === "granted" &&
          window.localStorage.getItem(`orion-notifications-${userId}`) ===
            "enabled",
      );
    }, 0);

    return () => window.clearTimeout(syncNotificationState);
  }, [userId]);

  useEffect(() => {
    if (
      !notificationsEnabled ||
      notificationPermission !== "granted" ||
      notifyingRef.current ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const due = reminders.filter(
      (reminder) =>
        reminder.urgency === "due" &&
        new Date(reminder.remindAt).getTime() <= Date.now(),
    );
    if (due.length === 0) return;

    const storageKey = `orion-notified-reminders-${userId}`;
    let previous: string[] = [];
    try {
      previous = JSON.parse(
        window.localStorage.getItem(storageKey) ?? "[]",
      ) as string[];
    } catch {
      previous = [];
    }
    const notified = new Set(previous);
    const pending = due.filter(
      (reminder) => !notified.has(`${reminder.id}:${reminder.remindAt}`),
    );
    if (pending.length === 0) return;

    notifyingRef.current = true;
    void navigator.serviceWorker.ready
      .then(async (registration) => {
        await registration.showNotification("Tienes algo pendiente", {
          body:
            pending.length === 1
              ? "Abre Mi día para revisar tu recordatorio."
              : `Abre Mi día para revisar ${pending.length} recordatorios.`,
          icon: "/app-icon-192.png",
          badge: "/app-icon-192.png",
          tag: "orion-due-reminders",
          data: { url: "/life" },
        });

        for (const reminder of pending) {
          notified.add(`${reminder.id}:${reminder.remindAt}`);
        }
        window.localStorage.setItem(
          storageKey,
          JSON.stringify([...notified].slice(-100)),
        );
      })
      .catch(() => undefined)
      .finally(() => {
        notifyingRef.current = false;
      });
  }, [notificationPermission, notificationsEnabled, reminders, userId]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      return;
    }

    const refreshVoices = () =>
      setAvailableVoices(window.speechSynthesis.getVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);

    return () =>
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        refreshVoices,
      );
  }, []);

  useEffect(() => {
    window.speechSynthesis?.cancel();

    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    };
  }, [selectedSpaceId]);

  const visibleTasks = useMemo(() => {
    const filteredByStatus = tasks.filter((task) =>
      view === "active"
        ? activeStatuses.has(task.status)
        : task.status === "completed" || task.status === "cancelled",
    );
    const filtered =
      areaFilter && ["health", "government", "community"].includes(areaFilter)
        ? filteredByStatus.filter((task) => task.category === areaFilter)
        : filteredByStatus;

    return [...filtered].sort((left, right) => {
      if (!left.dueAt && !right.dueAt) {
        return right.id.localeCompare(left.id);
      }

      if (!left.dueAt) {
        return 1;
      }

      if (!right.dueAt) {
        return -1;
      }

      return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    });
  }, [areaFilter, tasks, view]);

  const activeCount = tasks.filter((task) =>
    activeStatuses.has(task.status),
  ).length;
  const inProgressCount = tasks.filter(
    (task) => task.status === "in_progress",
  ).length;
  const completedCount = tasks.filter(
    (task) => task.status === "completed",
  ).length;
  const dueReminders = reminders.filter(
    (reminder) => reminder.urgency === "due",
  );
  const upcomingReminders = reminders.filter(
    (reminder) => reminder.urgency === "upcoming",
  );

  function rememberDuplicate(
    requestError: unknown,
    payload: TaskCreatePayload,
    source: "capture" | "form",
    destinationName: string,
  ) {
    if (
      !(requestError instanceof ApiRequestError) ||
      !requestError.payload?.code ||
      !requestError.payload.similarTasks?.length
    ) {
      return false;
    }

    setDuplicateWarning({
      code: requestError.payload.code,
      message: requestError.message,
      similarTasks: requestError.payload.similarTasks,
      payload,
      source,
      destinationName,
    });
    return true;
  }

  function registerCreation(task: LifeTask, destinationName: string) {
    setRecentCreation({
      task,
      destinationName,
      undone: false,
      restored: false,
    });
    setDuplicateWarning(undefined);
  }

  async function createSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!spaceForm.name.trim()) {
      setError("Escribe un nombre para el espacio");
      return;
    }

    if (!spaceForm.type) {
      setError(
        "Elige si el espacio es personal, familiar, de negocio o escolar",
      );
      return;
    }

    const existingPersonal =
      spaceForm.type === "personal"
        ? spaces.find(
            (space) => space.type === "personal" && space.status === "active",
          )
        : undefined;

    if (existingPersonal) {
      setSelectedSpaceId(existingPersonal.id);
      setCaptureNotice(
        `Ya tienes el espacio personal ${existingPersonal.name}; Yaleka lo seleccionó en lugar de duplicarlo.`,
      );
      setShowSpaceForm(false);
      return;
    }

    setSavingSpace(true);
    setError("");

    try {
      const space = await apiRequest<Space>("space", {
        method: "POST",
        body: JSON.stringify({
          name: spaceForm.name.trim(),
          description: spaceForm.description.trim() || undefined,
          type: spaceForm.type,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
      });

      setSpaces((current) =>
        current.some((candidate) => candidate.id === space.id)
          ? current
          : [...current, space],
      );
      setSelectedSpaceId(space.id);
      setSpaceForm({
        name: "",
        description: "",
        type: "",
      });
      setShowSpaceForm(false);
      setCaptureNotice(
        space.reused
          ? `Ya existía el espacio personal ${space.name}; Yaleka lo reutilizó.`
          : `Espacio creado: ${space.name}`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo crear el espacio",
      );
    } finally {
      setSavingSpace(false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSpace || !taskForm.title.trim()) {
      setError("Selecciona un espacio y escribe la tarea");
      return;
    }

    if (taskForm.recurrenceFrequency && !taskForm.dueAt) {
      setError("Elige la primera fecha y hora para poder repetir la tarea");
      return;
    }

    if (taskForm.reminderMinutesBefore.length > 0 && !taskForm.dueAt) {
      setError("Elige fecha y hora para poder crear el recordatorio");
      return;
    }

    setSavingTask(true);
    setError("");
    setDuplicateWarning(undefined);

    const payload: TaskCreatePayload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || undefined,
      category: taskForm.category,
      priority: taskForm.priority,
      dueAt: taskForm.dueAt
        ? new Date(taskForm.dueAt).toISOString()
        : undefined,
      estimatedMinutes: taskForm.estimatedMinutes
        ? Number(taskForm.estimatedMinutes)
        : undefined,
      userId: taskForm.userId || undefined,
      spaceId: activeSpace.id,
      recurrenceFrequency: taskForm.recurrenceFrequency || undefined,
      recurrenceInterval: taskForm.recurrenceFrequency
        ? Number(taskForm.recurrenceInterval)
        : undefined,
      recurrenceEndsAt: taskForm.recurrenceEndsAt
        ? new Date(`${taskForm.recurrenceEndsAt}T23:59:59`).toISOString()
        : undefined,
      reminderMinutesBefore:
        taskForm.reminderMinutesBefore.length > 0
          ? Number(taskForm.reminderMinutesBefore)
          : undefined,
    };

    try {
      const createdTask = await apiRequest<LifeTask>("task", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      registerCreation(createdTask, activeSpace.name);

      setTaskForm({
        title: "",
        description: "",
        category: "personal",
        priority: "normal",
        dueAt: "",
        estimatedMinutes: "30",
        userId: "",
        recurrenceFrequency: "",
        recurrenceInterval: "1",
        recurrenceEndsAt: "",
        reminderMinutesBefore: "",
      });
      setView("active");
      await refreshTasks(true);
      await refreshReminders();
      await refreshSpaces();
    } catch (saveError) {
      if (!rememberDuplicate(saveError, payload, "form", activeSpace.name)) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "No se pudo guardar la tarea",
        );
      }
    } finally {
      setSavingTask(false);
    }
  }

  async function preparePersonalAgenda() {
    if (prepareLock.current) return;
    prepareLock.current = true;
    setPreparingAgenda(true);
    setCaptureError("");
    try {
      // Reconsultar antes de crear evita duplicados al reintentar después de una respuesta perdida.
      const current = await apiRequest<Space[]>("space");
      let destination = current.find((space) =>
        space.members.some(
          (member) => member.user.id === userId && member.role !== "viewer",
        ),
      );
      if (!destination)
        destination = await apiRequest<Space>("space", {
          method: "POST",
          body: JSON.stringify({
            name: "Mi agenda",
            type: "personal",
            timezone:
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              "America/Mexico_City",
          }),
        });
      setSpaces(
        current.some((space) => space.id === destination!.id)
          ? current
          : [...current, destination],
      );
      setSelectedSpaceId(destination.id);
      setSpacesError("");
      setLoadingSpaces(false);
      setCaptureNotice(
        "Tu agenda está lista. Ahora pulsa Preparar actividad para revisar tu instrucción.",
      );
    } catch (e) {
      setCaptureError(
        e instanceof Error
          ? e.message
          : "No se pudo preparar tu agenda. Tu instrucción sigue aquí.",
      );
    } finally {
      prepareLock.current = false;
      setPreparingAgenda(false);
    }
  }

  async function interpretCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (interpretingCapture || savingCapture) return;
    if (writableSpaces.length === 0) {
      setCaptureError(
        "Primero prepara tu agenda con el botón que aparece junto a tu instrucción.",
      );
      return;
    }
    if (!captureText.trim()) {
      setCaptureError(
        "Escribe una tarea corta para que Yaleka pueda organizarla",
      );
      return;
    }

    setInterpretingCapture(true);
    setCaptureNotice("");
    setCaptureError("");

    try {
      const proposal = await apiRequest<CaptureProposal>("capture/interpret", {
        method: "POST",
        body: JSON.stringify({
          message: captureText.trim(),
          activeSpaceId: canEdit ? selectedSpaceId : undefined,
        }),
      });

      setCaptureProposal(proposal);
      setCaptureSpaceId(proposal.suggestedSpace.id);
      setCaptureActionTargetId(
        proposal.actionProposal?.recommendedTaskId ??
          (proposal.actionProposal?.matches.length === 1
            ? proposal.actionProposal.matches[0].id
            : ""),
      );
      setCaptureActionWholeSeries(
        proposal.actionProposal?.scope === "series" ||
          proposal.actionProposal?.scope === "today_and_tomorrow",
      );
    } catch (captureError) {
      setCaptureError(
        captureError instanceof Error
          ? captureError.message
          : "Yaleka no pudo interpretar el mensaje",
      );
    } finally {
      setInterpretingCapture(false);
    }
  }

  async function confirmCapture(acceptTemporalProposal = false) {
    if (!captureProposal || !captureSpaceId) {
      return;
    }

    const destination = writableSpaces.find(
      (space) => space.id === captureSpaceId,
    );

    if (!destination) {
      setCaptureError("Selecciona un espacio en el que puedas crear tareas");
      return;
    }

    if (captureProposal.needsTemporalConfirmation && !acceptTemporalProposal) {
      completeCaptureDetails();
      setCaptureError(
        "Yaleka necesita que revises la fecha y la hora antes de guardar.",
      );
      return;
    }

    setSavingCapture(true);
    setCaptureError("");
    setDuplicateWarning(undefined);

    const payload: TaskCreatePayload = {
      title: captureProposal.title.trim(),
      category: captureProposal.category,
      priority: "normal",
      estimatedMinutes: 30,
      spaceId: destination.id,
      dueAt: captureProposal.dueAt ?? undefined,
      recurrenceFrequency: captureProposal.recurrenceFrequency ?? undefined,
      recurrenceInterval: captureProposal.recurrenceInterval ?? undefined,
      recurrenceEndsAt: captureProposal.recurrenceEndsAt ?? undefined,
      reminderMinutesBefore: captureProposal.reminderMinutesBefore ?? undefined,
    };

    try {
      const createdTask = await apiRequest<LifeTask>("task", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      registerCreation(createdTask, destination.name);
      setSelectedSpaceId(destination.id);
      setCaptureText("");
      setCaptureProposal(undefined);
      setCaptureSpaceId("");
      setCaptureNotice(
        `Actividad guardada en ${destination.name}${createdTask.dueAt ? " · " + new Date(createdTask.dueAt).toLocaleString("es-MX") : " · Sin fecha: aparece en pendientes, no en el calendario"}`,
      );
      if (createdTask.dueAt) {
        setAgendaTasks((current) => [
          ...current.filter((t) => t.id !== createdTask.id),
          createdTask,
        ]);
        setAgendaAnchor(new Date(createdTask.dueAt));
        setShowAgenda(true);
      }
      setView("active");
      await refreshSpaces();

      if (destination.id === selectedSpaceId) {
        await refreshTasks(true);
      }
    } catch (captureError) {
      if (
        !rememberDuplicate(captureError, payload, "capture", destination.name)
      ) {
        setCaptureError(
          captureError instanceof Error
            ? captureError.message
            : "No se pudo crear la tarea desde la captura rápida",
        );
      }
    } finally {
      setSavingCapture(false);
    }
  }

  async function confirmCaptureAction() {
    const action = captureProposal?.actionProposal;
    const target = action?.matches.find(
      (match) => match.id === captureActionTargetId,
    );

    if (!action || !target) {
      setError("Elige la tarea exacta antes de continuar");
      return;
    }

    if (action.intent === "find") {
      setSelectedSpaceId(target.spaceId ?? selectedSpaceId);
      setView("active");
      setCaptureProposal(undefined);
      setCaptureActionTargetId("");
      window.setTimeout(() => {
        document.getElementById(`task-${target.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 600);
      return;
    }

    setSavingCapture(true);
    setError("");

    try {
      if (
        action.intent === "cancel" &&
        captureActionWholeSeries &&
        target.recurrenceId
      ) {
        await apiRequest(`task/${target.id}/recurrence/cancel`, {
          method: "POST",
        });
        await apiRequest(`task/${target.id}/cancel`, {
          method: "POST",
        });
      } else {
        const endpoint =
          action.intent === "cancel"
            ? `task/${target.id}/cancel`
            : `task/${target.id}/complete`;

        await apiRequest(endpoint, {
          method: "POST",
          body: action.intent === "complete" ? JSON.stringify({}) : undefined,
        });
      }

      setSelectedSpaceId(target.spaceId ?? selectedSpaceId);
      setCaptureText("");
      setCaptureProposal(undefined);
      setCaptureSpaceId("");
      setCaptureActionTargetId("");
      setCaptureActionWholeSeries(false);
      setCaptureNotice(
        action.intent === "complete"
          ? `Marcaste como terminada: ${target.title}`
          : captureActionWholeSeries && target.recurrenceId
            ? `Cancelaste esta tarea y sus próximas repeticiones: ${target.title}`
            : target.recurrenceId && target.recurrence?.status === "finished"
              ? `Cancelaste la última ocasión: ${target.title}`
              : target.recurrenceId
                ? `Cancelaste solo esta ocasión. Las próximas se conservan: ${target.title}`
                : `Cancelaste la tarea: ${target.title}`,
      );
      await refreshSpaces();
      await refreshTasks(true);
      await refreshReminders();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "No se pudo realizar la acción sobre la tarea",
      );
    } finally {
      setSavingCapture(false);
    }
  }

  function completeCaptureDetails() {
    if (!captureProposal || !captureSpaceId) {
      return;
    }

    setSelectedSpaceId(captureSpaceId);
    setTaskForm((current) => ({
      ...current,
      title: captureProposal.title,
      category: captureProposal.category,
      dueAt: toLocalDateTimeInput(captureProposal.dueAt),
      recurrenceFrequency: captureProposal.recurrenceFrequency ?? "",
      recurrenceInterval: String(captureProposal.recurrenceInterval ?? 1),
      recurrenceEndsAt: captureProposal.recurrenceEndsAt
        ? toLocalDateTimeInput(captureProposal.recurrenceEndsAt).slice(0, 10)
        : "",
      reminderMinutesBefore:
        captureProposal.reminderMinutesBefore === null
          ? ""
          : String(captureProposal.reminderMinutesBefore),
    }));
    setCaptureProposal(undefined);
    setCaptureText("");
    setCaptureNotice("Completa la fecha, el aviso o la repetición");
    window.setTimeout(() => {
      document
        .getElementById("orion-life-task-form")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  function getEffectiveVoiceLocale() {
    if (
      assistantPreference.automaticLocale &&
      typeof navigator !== "undefined" &&
      navigator.language
    ) {
      return navigator.language;
    }

    return assistantPreference.voiceLocale || "es-MX";
  }

  function getSelectedVoice(locale = getEffectiveVoiceLocale()) {
    const savedVoice = availableVoices.find(
      (voice) => voice.name === assistantPreference.voiceName,
    );

    if (savedVoice) {
      return savedVoice;
    }

    const normalizedLocale = locale.toLocaleLowerCase();
    const language = normalizedLocale.split("-")[0];
    return (
      availableVoices.find(
        (voice) => voice.lang.toLocaleLowerCase() === normalizedLocale,
      ) ??
      availableVoices.find(
        (voice) => voice.lang.toLocaleLowerCase().split("-")[0] === language,
      )
    );
  }

  function prepareUtterance(message: string) {
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = getEffectiveVoiceLocale();
    utterance.rate = assistantPreference.voiceRate;
    const voice = getSelectedVoice(utterance.lang);
    if (voice) {
      utterance.voice = voice;
    }
    return utterance;
  }

  function testAssistantVoice() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceSettingsNotice(
        "Este navegador no puede reproducir una voz de prueba.",
      );
      return;
    }

    const preferredName =
      assistantPreference.preferredName?.trim() || "Usuario";
    const utterance = prepareUtterance(
      `Hola ${preferredName}. Soy Yaleka. Esta es la voz que usaré para acompañarte.`,
    );
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setVoiceSettingsNotice(
      "Reproduciendo la prueba. Puedes cambiarla y escuchar otra vez.",
    );
  }

  async function saveAssistantPreference() {
    setSavingVoiceSettings(true);
    setVoiceSettingsNotice("");

    try {
      const savedPreference = await apiRequest<AssistantPreference>(
        "assistant-preference",
        {
          method: "PATCH",
          body: JSON.stringify(assistantPreference),
        },
      );
      setAssistantPreference(savedPreference);
      setVoiceSettingsNotice(
        "Preferencia guardada. Yaleka ya la usará al leer y escuchar.",
      );
      setError("");
    } catch (saveError) {
      setVoiceSettingsNotice(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la preferencia de voz.",
      );
    } finally {
      setSavingVoiceSettings(false);
    }
  }

  function startVoiceCapture() {
    if (typeof window === "undefined") {
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const voiceWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setError(
        "Este navegador no permite dictado directo. Puedes usar el micrófono del teclado o escribir la tarea.",
      );
      return;
    }

    const recognition = new Recognition();
    recognition.lang = getEffectiveVoiceLocale();
    recognition.continuous = true;
    recognition.interimResults = true;
    voiceBaseTextRef.current = captureText.trim();
    voiceFinalTextRef.current = "";
    recognition.onresult = (event) => {
      let interimText = "";

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();

        if (!transcript) continue;

        if (result.isFinal) {
          voiceFinalTextRef.current =
            `${voiceFinalTextRef.current} ${transcript}`.trim();
        } else {
          interimText = `${interimText} ${transcript}`.trim();
        }
      }

      const dictated = `${voiceFinalTextRef.current} ${interimText}`.trim();
      const prepared =
        captureMode === "text" ? formatVoiceText(dictated) : dictated;
      const combined = [voiceBaseTextRef.current, prepared]
        .filter(Boolean)
        .join(captureMode === "text" ? "\n" : " ");

      setCaptureText(combined);
      setCaptureProposal(undefined);
      setCaptureNotice(
        captureMode === "text"
          ? "Sigo escuchando. Di “nuevo párrafo”, “coma” o “punto”."
          : "Sigo escuchando. Detén el micrófono cuando termines.",
      );
      setError("");
    };
    recognition.onerror = () => {
      setError(
        "No se pudo escuchar con claridad. Intenta otra vez o escribe la tarea.",
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setCaptureNotice(
        captureMode === "text"
          ? "Dictado listo para revisar y copiar."
          : "Dictado listo. Revisa el texto y toca Organizar.",
      );
    };

    recognitionRef.current = recognition;
    setListening(true);
    setError("");
    recognition.start();
  }

  async function copyPreparedText() {
    if (!captureText.trim()) {
      setError("Primero dicta o escribe el texto que deseas preparar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(formatVoiceText(captureText));
      setCaptureText((current) => formatVoiceText(current));
      setCaptureNotice(
        "Texto ordenado y copiado. Ya puedes pegarlo donde quieras.",
      );
      setError("");
    } catch {
      setError(
        "No se pudo copiar automáticamente. Selecciona el texto y cópialo.",
      );
    }
  }

  function readMyDay() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Este navegador no puede leer las tareas en voz alta.");
      return;
    }

    if (readingTasks) {
      window.speechSynthesis.cancel();
      setReadingTasks(false);
      return;
    }

    const briefingTasks = [
      ...(briefing?.overdue.tasks ?? []),
      ...(briefing?.today.tasks ?? []),
    ].slice(0, 10);
    const preferredName =
      assistantPreference.preferredName?.trim() || "Usuario";
    const message = briefing
      ? [
          `${personalizeGreeting(briefing.greeting, preferredName)}.`,
          briefing.today.count > 0
            ? `Hoy tienes ${briefing.today.count} ${briefing.today.count === 1 ? "actividad" : "actividades"}.`
            : "Hoy no tienes actividades con horario.",
          briefing.overdue.count > 0
            ? `Hay ${briefing.overdue.count} ${briefing.overdue.count === 1 ? "pendiente atrasado" : "pendientes atrasados"}.`
            : null,
          ...briefingTasks.map(
            (task, index) =>
              `${index + 1}: ${task.title}. ${formatDate(task.dueAt)}. ${task.space ? `En ${task.space.name}.` : ""}`,
          ),
          briefing.business.lowStockProducts.length > 0
            ? `En el negocio hay ${briefing.business.lowStockProducts.length} productos con poca existencia.`
            : null,
          ...briefing.suggestions
            .filter((suggestion) => suggestion.kind === "sales")
            .map((suggestion) => suggestion.title),
        ]
          .filter(Boolean)
          .join(" ")
      : `En ${activeSpace?.name ?? "este espacio"} todavía estoy preparando tu resumen.`;
    const utterance = prepareUtterance(message);
    utterance.onend = () => setReadingTasks(false);
    utterance.onerror = () => setReadingTasks(false);

    window.speechSynthesis.cancel();
    setReadingTasks(true);
    window.speechSynthesis.speak(utterance);
  }

  async function createSimilarAnyway() {
    if (!duplicateWarning || duplicateWarning.code === "DUPLICATE_TASK") {
      return;
    }

    setSavingTask(duplicateWarning.source === "form");
    setSavingCapture(duplicateWarning.source === "capture");
    setError("");

    try {
      const createdTask = await apiRequest<LifeTask>("task", {
        method: "POST",
        body: JSON.stringify({
          ...duplicateWarning.payload,
          allowSimilar: true,
        }),
      });
      const destinationId = duplicateWarning.payload.spaceId;
      const source = duplicateWarning.source;

      registerCreation(createdTask, duplicateWarning.destinationName);
      setSelectedSpaceId(destinationId);
      setView("active");

      if (source === "capture") {
        setCaptureText("");
        setCaptureProposal(undefined);
        setCaptureSpaceId("");
      } else {
        setTaskForm({
          title: "",
          description: "",
          category: "personal",
          priority: "normal",
          dueAt: "",
          estimatedMinutes: "30",
          userId: "",
          recurrenceFrequency: "",
          recurrenceInterval: "1",
          recurrenceEndsAt: "",
          reminderMinutesBefore: "",
        });
      }

      await refreshTasks(true);
      await refreshReminders();
      await refreshSpaces();
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "No se pudo crear la tarea",
      );
    } finally {
      setSavingTask(false);
      setSavingCapture(false);
    }
  }

  function openSimilarTask(task: SimilarTask) {
    setSelectedSpaceId(task.spaceId ?? selectedSpaceId);
    setView("active");
    setDuplicateWarning(undefined);
    window.setTimeout(() => {
      document.getElementById(`task-${task.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 600);
  }

  async function addDetailToSimilarTask(task: SimilarTask) {
    const note = window.prompt(
      `Agrega un dato a “${task.title}”. No se creará otra tarea:`,
    );

    if (!note?.trim()) {
      return;
    }

    setProcessingId(task.id);
    setError("");

    try {
      await apiRequest<LifeTask>(`task/${encodeURIComponent(task.id)}/note`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() }),
      });
      setDuplicateWarning(undefined);
      setCaptureNotice("El dato se agregó a la tarea existente.");
      await refreshTasks(true);
    } catch (noteError) {
      setError(
        noteError instanceof Error
          ? noteError.message
          : "No se pudo agregar el dato",
      );
    } finally {
      setProcessingId("");
    }
  }

  async function undoRecentCreation() {
    if (!recentCreation || recentCreation.undone) {
      return;
    }

    const task = recentCreation.task;
    setProcessingId(task.id);
    setError("");

    try {
      if (task.recurrence?.status === "active") {
        await apiRequest<LifeTask>(
          `task/${encodeURIComponent(task.id)}/recurrence/cancel`,
          { method: "POST", body: JSON.stringify({}) },
        );
      }

      const cancelled = await apiRequest<LifeTask>(
        `task/${encodeURIComponent(task.id)}/cancel`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setRecentCreation((current) =>
        current
          ? {
              ...current,
              task: cancelled,
              undone: true,
              restored: false,
            }
          : current,
      );
      await refreshTasks(true);
      await refreshReminders();
    } catch (undoError) {
      setError(
        undoError instanceof Error
          ? undoError.message
          : "No se pudo deshacer la tarea",
      );
    } finally {
      setProcessingId("");
    }
  }

  async function restoreRecentCreation() {
    if (!recentCreation?.undone) {
      return;
    }

    setProcessingId(recentCreation.task.id);
    setError("");

    try {
      const restored = await apiRequest<LifeTask>(
        `task/${encodeURIComponent(recentCreation.task.id)}/reopen`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setRecentCreation({
        ...recentCreation,
        task: restored,
        undone: false,
        restored: true,
      });
      await refreshTasks(true);
      await refreshReminders();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "No se pudo restaurar la tarea",
      );
    } finally {
      setProcessingId("");
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSpace || !memberForm.email.trim()) {
      return;
    }

    setSavingMember(true);
    setError("");

    try {
      const updatedSpace = await apiRequest<Space>(
        `space/${encodeURIComponent(activeSpace.id)}/member`,
        {
          method: "POST",
          body: JSON.stringify({
            email: memberForm.email.trim(),
            role: memberForm.role,
          }),
        },
      );

      setSpaces((current) =>
        current.map((space) =>
          space.id === updatedSpace.id ? updatedSpace : space,
        ),
      );
      setMemberForm({
        email: "",
        role: "member",
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo agregar a la persona",
      );
    } finally {
      setSavingMember(false);
    }
  }

  async function runTaskAction(
    taskId: string,
    action: "claim" | "complete" | "postpone" | "reopen" | "cancel",
    extra?: Record<string, unknown>,
  ) {
    setProcessingId(taskId);
    setError("");

    try {
      await apiRequest<LifeTask>(
        `task/${encodeURIComponent(taskId)}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...extra,
          }),
        },
      );
      await refreshTasks(true);
      await refreshReminders();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "No se pudo actualizar la tarea",
      );
      await refreshTasks(true);
      await refreshReminders();
    } finally {
      setProcessingId("");
    }
  }

  async function runReminderAction(
    reminderId: string,
    action: "snooze" | "acknowledge",
    minutes?: number,
  ) {
    setProcessingReminderId(reminderId);
    setError("");

    try {
      await apiRequest<ReminderItem>(
        `reminder/${encodeURIComponent(reminderId)}/${action}`,
        {
          method: "POST",
          body: JSON.stringify(action === "snooze" ? { minutes } : {}),
        },
      );
      await refreshReminders();
      await refreshTasks(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "No se pudo actualizar el recordatorio",
      );
      await refreshReminders();
    } finally {
      setProcessingReminderId("");
    }
  }

  async function stopRecurrence(task: LifeTask) {
    const confirmed = window.confirm(
      `¿Dejar de repetir “${task.title}”? La tarea actual se conservará.`,
    );

    if (!confirmed) {
      return;
    }

    setProcessingId(task.id);
    setError("");

    try {
      await apiRequest<LifeTask>(
        `task/${encodeURIComponent(task.id)}/recurrence/cancel`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      await refreshTasks(true);
      await refreshReminders();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "No se pudo detener la repetición",
      );
    } finally {
      setProcessingId("");
    }
  }

  async function logout() {
    setLoggingOut(true);

    try {
      await apiRequest<null>("auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  function openAgenda() {
    setAgendaAnchor(new Date());
    setAgendaError("");
    setShowAgenda(true);
  }

  function moveAgenda(direction: -1 | 1) {
    setAgendaAnchor((current) => {
      const next = new Date(current);
      if (agendaMode === "week") {
        next.setDate(next.getDate() + direction * 7);
      } else {
        next.setMonth(next.getMonth() + direction, 1);
      }
      return next;
    });
  }

  function openAgendaTask(task: LifeTask) {
    setExpandedTasks(true);
    if (task.space?.id) {
      setSelectedSpaceId(task.space.id);
    }
    setAreaFilter(null);
    setView("active");
    setShowAgenda(false);
    window.setTimeout(() => {
      document.getElementById(`task-${task.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 500);
  }

  async function installApplication() {
    setDeviceNotice("");

    if (appInstalled) {
      setDeviceNotice("La aplicación ya está instalada en este dispositivo.");
      return;
    }

    if (!installPrompt) {
      setDeviceNotice(
        "Abre el menú del navegador y elige “Instalar aplicación” o “Agregar a pantalla de inicio”.",
      );
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeviceNotice(
        "Instalación aceptada. Ya puedes abrir Mi día como una app.",
      );
      setInstallPrompt(null);
    } else {
      setDeviceNotice(
        "No se instaló. Puedes intentarlo de nuevo cuando quieras.",
      );
    }
  }

  async function enableNotifications() {
    setDeviceNotice("");

    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setDeviceNotice("Este navegador no permite avisos de la aplicación.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      window.localStorage.setItem(`orion-notifications-${userId}`, "enabled");
      setNotificationsEnabled(true);
      setDeviceNotice(
        "Avisos activados. Solo mostraremos recordatorios importantes.",
      );
      return;
    }

    window.localStorage.setItem(`orion-notifications-${userId}`, "disabled");
    setNotificationsEnabled(false);
    setDeviceNotice(
      permission === "denied"
        ? "Los avisos están bloqueados. Puedes habilitarlos desde los permisos del navegador."
        : "No se activaron los avisos.",
    );
  }

  function disableNotifications() {
    window.localStorage.setItem(`orion-notifications-${userId}`, "disabled");
    setNotificationsEnabled(false);
    setDeviceNotice(
      "Avisos pausados en Yaleka. El permiso del navegador no fue modificado.",
    );
  }

  async function testNotification() {
    setDeviceNotice("");

    if (
      notificationPermission !== "granted" ||
      !notificationsEnabled ||
      !("serviceWorker" in navigator)
    ) {
      setDeviceNotice(
        "Primero activa los avisos para poder enviar una prueba.",
      );
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Avisos listos", {
        body: "Yaleka puede recordarte lo importante sin mostrar información privada.",
        icon: "/app-icon-192.png",
        badge: "/app-icon-192.png",
        tag: "orion-notification-test",
        data: { url: "/life" },
      });
      setDeviceNotice("Aviso de prueba enviado.");
    } catch {
      setDeviceNotice(
        "El navegador no pudo mostrar la prueba en este momento.",
      );
    }
  }

  const briefingTasks = briefing
    ? [...briefing.overdue.tasks, ...briefing.today.tasks]
    : [];
  const overdueTaskIds = new Set(
    briefing?.overdue.tasks.map((task) => task.id) ?? [],
  );
  const todayLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const capitalizedTodayLabel =
    todayLabel.charAt(0).toLocaleUpperCase("es-MX") + todayLabel.slice(1);

  const countBriefingArea = (kind: OrionAreaKind) => {
    if (kind === "health") {
      return briefingTasks.filter((task) => task.category === "health").length;
    }

    if (kind === "government" || kind === "community") {
      return briefingTasks.filter((task) => task.category === kind).length;
    }

    const spaceType = kind === "school" ? "school" : kind;
    return briefingTasks.filter((task) => task.space?.type === spaceType)
      .length;
  };

  const areaCards: Array<{
    kind: OrionAreaKind;
    label: string;
    detail: string;
    color: string;
    background: string;
  }> = [
    {
      kind: "family",
      label: "Familia",
      detail: `${countBriefingArea("family")} ${countBriefingArea("family") === 1 ? "pendiente" : "pendientes"}`,
      color: "text-blue-600",
      background: "bg-blue-50",
    },
    {
      kind: "business",
      label: "Negocio",
      detail:
        briefing && briefing.business.lowStockProducts.length > 0
          ? `${briefing.business.lowStockProducts.length} por revisar`
          : "Todo en orden",
      color: "text-teal-600",
      background: "bg-teal-50",
    },
    {
      kind: "school",
      label: "Educación",
      detail: `${countBriefingArea("school")} ${countBriefingArea("school") === 1 ? "recordatorio" : "recordatorios"}`,
      color: "text-orange-500",
      background: "bg-orange-50",
    },
    {
      kind: "health",
      label: "Salud",
      detail:
        countBriefingArea("health") > 0
          ? `${countBriefingArea("health")} por atender`
          : "Sin alertas",
      color: "text-sky-600",
      background: "bg-sky-50",
    },
    {
      kind: "government",
      label: "Gobierno",
      detail:
        countBriefingArea("government") > 0
          ? `${countBriefingArea("government")} trámite pendiente`
          : "Sin trámites",
      color: "text-indigo-700",
      background: "bg-indigo-50",
    },
    {
      kind: "community",
      label: "Comunidad",
      detail:
        countBriefingArea("community") > 0
          ? `${countBriefingArea("community")} oportunidad`
          : "Todo tranquilo",
      color: "text-cyan-700",
      background: "bg-cyan-50",
    },
  ];

  function openArea(kind: OrionAreaKind) {
    setSelectedArea(kind);
    setError("");
  }

  function getAreaSpace(kind: OrionAreaKind) {
    if (["health", "government", "community"].includes(kind)) {
      return spaces.find((space) => space.type === "personal");
    }

    return spaces.find((space) => space.type === kind);
  }

  function prepareMissingAreaSpace(kind: OrionAreaKind) {
    const isPrivateArea = ["health", "government", "community"].includes(kind);
    const type = isPrivateArea ? "personal" : kind;
    const label = orionAreaGuides[kind].label;

    setSpaceForm({
      name: isPrivateArea ? "Mi vida" : `Mi espacio de ${label}`,
      description: isPrivateArea
        ? "Pendientes privados de mi vida"
        : `Actividades y seguimiento de ${label.toLocaleLowerCase("es-MX")}`,
      type,
    });
    setShowSpaceForm(true);
    setSelectedArea(null);
    setCaptureNotice(
      isPrivateArea
        ? "Primero crea Mi vida. Ahí Yaleka protegerá esta información."
        : `Primero crea tu espacio de ${label}. Después podrás agregar personas autorizadas.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function prepareAreaTask(kind: OrionAreaKind, action: OrionAreaAction) {
    if (action.href) {
      setSelectedArea(null);
      router.push(action.href);
      return;
    }

    const targetSpace = getAreaSpace(kind);
    if (!targetSpace) {
      prepareMissingAreaSpace(kind);
      return;
    }

    setSelectedSpaceId(targetSpace.id);
    setAreaFilter(null);
    setView("active");
    setTaskForm((current) => ({
      ...current,
      title: action.taskTitle ?? action.title,
      description: "",
      category: kind,
      priority: action.priority ?? "normal",
      dueAt: "",
      reminderMinutesBefore: "",
    }));
    setSelectedArea(null);
    setCaptureNotice(
      `Yaleka preparó “${action.title}”. Agrega fecha o aviso y confirma para guardarlo.`,
    );
    setError("");
    window.setTimeout(() => {
      document.getElementById("orion-life-task-form")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 350);
  }

  function viewAreaTasks(kind: OrionAreaKind) {
    const targetSpace = getAreaSpace(kind);
    if (!targetSpace) {
      prepareMissingAreaSpace(kind);
      return;
    }

    setSelectedSpaceId(targetSpace.id);
    setAreaFilter(
      ["health", "government", "community"].includes(kind) ? kind : null,
    );
    setView("active");
    setSelectedArea(null);
    setCaptureNotice("");
    window.setTimeout(() => {
      document.getElementById("orion-life-workspace")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 350);
  }

  function dictateInArea(kind: OrionAreaKind) {
    const targetSpace = getAreaSpace(kind);
    if (!targetSpace) {
      prepareMissingAreaSpace(kind);
      return;
    }

    setSelectedSpaceId(targetSpace.id);
    setAreaFilter(null);
    setCaptureMode("task");
    setCaptureText("");
    setCaptureProposal(undefined);
    setTaskForm((current) => ({ ...current, category: kind }));
    setSelectedArea(null);
    setCaptureNotice(
      `Listo para ${orionAreaGuides[kind].label}. Toca “Empezar a dictar” y Yaleka organizará la actividad.`,
    );
    window.setTimeout(() => {
      document.getElementById("orion-captura")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 350);
  }

  return (
    <main className="min-h-screen bg-[#061426] text-slate-100">
      <header className="border-b border-white/10 bg-[#07182b]/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <OrionBrandMark className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">
                Mi día
              </p>
              <h1 className="truncate text-xl font-bold text-white">Mi día</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              title="Yaleka actualiza la información automáticamente"
              className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-200 xl:inline-flex"
            >
              <span className="mr-2 h-2 w-2 rounded-full bg-emerald-400" />
              Mi día
            </span>
            <button
              type="button"
              onClick={() =>
                document.getElementById("recordatorios")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
              title="Ver recordatorios"
              aria-label={`Ver ${dueReminders.length} recordatorios`}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border transition ${
                dueReminders.length > 0
                  ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
                  : "border-white/10 bg-white/5 text-slate-300"
              }`}
            >
              <span aria-hidden="true">♢</span>
              {dueReminders.length > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                  {dueReminders.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSpaceForm((current) => !current);
                setCaptureNotice("");
                setError("");
              }}
              className="hidden rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 sm:block"
            >
              + Espacio
            </button>
            <div className="group relative">
              <button
                type="button"
                title={`${currentUser.name} · ${currentUser.email}`}
                aria-label="Opciones de usuario"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-blue-600 text-sm font-black text-white shadow-lg shadow-cyan-950/40"
              >
                {currentUser.name.trim().charAt(0).toLocaleUpperCase("es-MX") ||
                  "U"}
              </button>
              <div className="pointer-events-none absolute right-0 top-12 z-20 w-52 translate-y-1 rounded-2xl border border-white/10 bg-[#0b1d33] p-3 opacity-0 shadow-2xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
                <p className="truncate text-sm font-semibold text-white">
                  {currentUser.name}
                </p>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {currentUser.email}
                </p>
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={() => void logout()}
                  className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
                >
                  {loggingOut ? "Cerrando…" : "Cerrar sesión"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {error ? (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <p>{error}</p>
            <button type="button" onClick={() => setError("")}>
              ×
            </button>
          </div>
        ) : null}

        <section
          id="orion-captura"
          className="mb-6 overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/10 via-slate-900 to-violet-400/10 p-5 shadow-xl shadow-cyan-950/10"
        >
          <div
            className="mb-4 flex gap-2"
            role="group"
            aria-label="Contexto del asistente"
          >
            <button
              type="button"
              aria-pressed={!businessMode}
              onClick={() => setBusinessMode(false)}
              className="rounded-xl border border-cyan-300/30 px-4 py-2"
            >
              Mi día y textos
            </button>
            <button
              type="button"
              aria-pressed={businessMode}
              onClick={() => {
                recognitionRef.current?.stop();
                setBusinessMode(true);
              }}
              className="rounded-xl border border-cyan-300/30 px-4 py-2"
            >
              Mi negocio
            </button>
          </div>
          {businessMode ? (
            <BusinessAssistantWorkspace
              userName={currentUser.name}
              companyId={currentUser.companyId}
              userId={currentUser.id}
              embedded
            />
          ) : (
            <>
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-xl">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                    Asistente Yaleka
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-white">
                    ¿Qué quieres resolver?
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Escribe lo que necesitas, revisa la fecha y la hora, y
                    confirma para guardarlo en tu agenda.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    disabled={interpretingCapture || savingCapture}
                    onClick={startVoiceCapture}
                    title={
                      listening
                        ? "Detener y conservar todo lo que ya se escuchó"
                        : "Escuchar de manera continua hasta que tú lo detengas"
                    }
                    className={`rounded-xl border px-3 py-2 font-semibold disabled:text-slate-500 ${
                      listening
                        ? "border-red-400/40 bg-red-400/10 text-red-200 hover:bg-red-400/20"
                        : "border-cyan-400/30 bg-slate-950/60 text-cyan-200 hover:bg-cyan-400/10"
                    }`}
                  >
                    {listening ? "■ Detener dictado" : "🎤 Empezar a dictar"}
                  </button>
                  <button
                    type="button"
                    disabled
                    title="La lectura de fotografías llegará después de validar la clasificación"
                    className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-500"
                  >
                    📷 Foto · siguiente
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-2 rounded-2xl border border-slate-700 bg-slate-950/50 p-1.5 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={listening || interpretingCapture || savingCapture}
                  onClick={() => {
                    setCaptureMode("task");
                    setCaptureProposal(undefined);
                    setCaptureNotice("");
                  }}
                  className={`rounded-xl px-4 py-3 text-left text-sm transition ${
                    captureMode === "task"
                      ? "bg-cyan-400 font-bold text-slate-950"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Crear actividad
                  <span className="mt-1 block text-xs font-normal opacity-75">
                    Yaleka reconoce fecha, aviso y espacio.
                  </span>
                </button>
                <button
                  type="button"
                  disabled={listening || interpretingCapture || savingCapture}
                  onClick={() => {
                    setCaptureMode("text");
                    setCaptureProposal(undefined);
                    setCaptureNotice("");
                  }}
                  className={`rounded-xl px-4 py-3 text-left text-sm transition ${
                    captureMode === "text"
                      ? "bg-violet-400 font-bold text-slate-950"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Preparar texto
                  <span className="mt-1 block text-xs font-normal opacity-75">
                    Dicta párrafos y puntuación; después copia.
                  </span>
                </button>
              </div>

              <form
                onSubmit={(event) => {
                  if (captureMode === "text") {
                    event.preventDefault();
                    void copyPreparedText();
                    return;
                  }

                  void interpretCapture(event);
                }}
                className="mt-5 flex flex-col gap-3 lg:flex-row"
              >
                <textarea
                  aria-label="Instrucción para mi agenda"
                  value={captureText}
                  maxLength={captureMode === "text" ? 3000 : 500}
                  disabled={interpretingCapture || savingCapture}
                  onChange={(event) => {
                    setCaptureText(event.target.value);
                    setCaptureError("");
                    setCaptureProposal(undefined);
                    setCaptureNotice("");
                    setCaptureActionTargetId("");
                    setCaptureActionWholeSeries(false);
                  }}
                  rows={captureMode === "text" ? 5 : 2}
                  placeholder={
                    captureMode === "text"
                      ? "Ejemplo: Pon esto en viñetas… Nuevo párrafo… Quedo a la espera…"
                      : "Ejemplo: recuérdame pagar la luz mañana a las 9"
                  }
                  className="min-h-14 min-w-0 flex-1 resize-y rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-base outline-none focus:border-cyan-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={
                    interpretingCapture ||
                    savingCapture ||
                    !captureText.trim() ||
                    (captureMode === "task" && writableSpaces.length === 0)
                  }
                  className={`min-h-14 rounded-2xl px-6 font-bold text-slate-950 disabled:bg-slate-700 disabled:text-slate-500 ${
                    captureMode === "text"
                      ? "bg-violet-400 hover:bg-violet-300"
                      : "bg-cyan-400 hover:bg-cyan-300"
                  }`}
                >
                  {captureMode === "text"
                    ? "Ordenar y copiar"
                    : interpretingCapture
                      ? "Organizando…"
                      : "Preparar actividad"}
                </button>
              </form>

              {captureMode === "task" &&
                (loadingSpaces ||
                  spacesError ||
                  writableSpaces.length === 0) && (
                  <div
                    className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100"
                    role="status"
                  >
                    <p>
                      {loadingSpaces
                        ? "Cargando tu agenda…"
                        : spacesError
                          ? "No pudimos consultar tu agenda. " + spacesError
                          : "Todavía no tienes una agenda editable. Puedes preparar tu agenda personal sin cambiar tus otros espacios."}
                    </p>
                    {!loadingSpaces && (
                      <button
                        type="button"
                        disabled={preparingAgenda}
                        onClick={() => void preparePersonalAgenda()}
                        className="mt-3 min-h-11 rounded-xl bg-amber-200 px-4 py-2 font-bold text-slate-950 disabled:opacity-50"
                      >
                        {preparingAgenda
                          ? "Preparando…"
                          : spacesError
                            ? "Reintentar y preparar agenda"
                            : "Preparar mi agenda"}
                      </button>
                    )}
                  </div>
                )}
              {captureError && (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100"
                >
                  {captureError}
                </p>
              )}
              {captureMode === "task" &&
                !captureProposal &&
                writableSpaces.length > 0 && (
                  <p className="mt-3 text-sm text-slate-300">
                    Paso 1: preparar · Paso 2: revisar y guardar. Escribir aquí
                    todavía no crea la actividad.
                  </p>
                )}
              {captureMode === "text" ? (
                <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-400/5 px-4 py-3 text-xs leading-5 text-violet-100/75">
                  Puedes decir: “coma”, “punto”, “dos puntos”, “nueva línea” o
                  “nuevo párrafo”. También entiende “pon esto en viñetas”.
                  Yaleka conserva el texto en esta pantalla y no lo envía hasta
                  que tú elijas otra acción.
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {(captureMode === "text"
                  ? [
                      "Enviar catálogo coma revisar precios coma llamar mañana punto",
                      "Pon esto en viñetas dos puntos enviar catálogo coma revisar precios coma llamar mañana punto",
                      "Buenos días punto nuevo párrafo Quedo a la espera de su respuesta punto",
                    ]
                  : [
                      "Comprar leche para la casa",
                      "Pedir refrescos al proveedor",
                      "Hablar con el padre de familia de Juan",
                      "Cancelar la tarea de hoy de apagar el servidor",
                    ]
                ).map((example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={interpretingCapture || savingCapture}
                    onClick={() => {
                      setCaptureText(example);
                      setCaptureProposal(undefined);
                      setCaptureNotice("");
                    }}
                    className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))}
              </div>

              {captureNotice ? (
                <p
                  role="status"
                  className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
                >
                  ✓ {captureNotice}
                </p>
              ) : null}

              {captureProposal ? (
                <div className="mt-5 rounded-3xl border border-violet-400/30 bg-slate-950/70 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
                        {captureProposal.actionProposal
                          ? "Orden reconocida por Yaleka"
                          : "Propuesta de Yaleka"}
                      </p>
                      <p className="mt-2 text-sm text-slate-400">
                        {captureProposal.actionProposal
                          ? "Confirmación humana requerida"
                          : confidenceLabels[captureProposal.confidence]}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        captureProposal.actionProposal
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                          : captureProposal.needsSpaceConfirmation
                            ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                            : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                      }`}
                    >
                      {captureProposal.actionProposal
                        ? "No crea otra tarea"
                        : captureProposal.needsSpaceConfirmation
                          ? "Confirma el destino"
                          : "Destino reconocido"}
                    </span>
                  </div>

                  {captureProposal.actionProposal ? (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">
                          {captureProposal.actionProposal.intent === "cancel"
                            ? "Cancelar una tarea existente"
                            : captureProposal.actionProposal.intent ===
                                "complete"
                              ? "Terminar una tarea existente"
                              : "Buscar una tarea existente"}
                        </p>
                        <p className="mt-2 text-sm text-amber-50">
                          {captureProposal.actionProposal.message}
                        </p>
                        <p className="mt-2 text-xs text-amber-100/70">
                          Yaleka no creará una tarea nueva con esta orden.
                        </p>
                      </div>

                      {captureProposal.actionProposal.matches.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            ¿Te refieres a esta tarea?
                          </p>
                          {captureProposal.actionProposal.matches.map(
                            (match) => (
                              <label
                                key={match.id}
                                className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${
                                  captureActionTargetId === match.id
                                    ? "border-cyan-400/60 bg-cyan-400/10"
                                    : "border-slate-700 bg-slate-900/70 hover:border-slate-600"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="capture-action-target"
                                  checked={captureActionTargetId === match.id}
                                  disabled={savingCapture}
                                  onChange={() => {
                                    setCaptureActionTargetId(match.id);
                                    setCaptureActionWholeSeries(
                                      captureProposal.actionProposal?.scope ===
                                        "series" ||
                                        captureProposal.actionProposal
                                          ?.scope === "today_and_tomorrow",
                                    );
                                  }}
                                  className="mt-1"
                                />
                                <span className="min-w-0">
                                  <span className="block font-semibold text-slate-100">
                                    {match.title}
                                  </span>
                                  <span className="mt-1 block text-xs text-slate-400">
                                    {match.dueAt
                                      ? formatDate(match.dueAt)
                                      : "Sin horario fijo"}{" "}
                                    · {match.space?.name ?? "Espacio privado"}
                                    {match.recurrenceId ? " · Se repite" : ""}
                                  </span>
                                </span>
                              </label>
                            ),
                          )}
                        </div>
                      ) : null}

                      {captureProposal.actionProposal.intent === "cancel" &&
                      captureProposal.actionProposal.matches.some(
                        (match) =>
                          match.id === captureActionTargetId &&
                          Boolean(match.recurrenceId) &&
                          match.recurrence?.status !== "finished",
                      ) ? (
                        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                          <p className="text-sm font-semibold text-slate-200">
                            Esta tarea forma parte de una repetición
                          </p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              disabled={savingCapture}
                              onClick={() => setCaptureActionWholeSeries(false)}
                              className={`rounded-xl border px-3 py-2 text-sm ${
                                !captureActionWholeSeries
                                  ? "border-cyan-400 bg-cyan-400/10 text-cyan-100"
                                  : "border-slate-700 text-slate-400"
                              }`}
                            >
                              Solo esta ocasión
                              <span className="mt-1 block text-xs opacity-70">
                                Conserva la siguiente
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={savingCapture}
                              onClick={() => setCaptureActionWholeSeries(true)}
                              className={`rounded-xl border px-3 py-2 text-sm ${
                                captureActionWholeSeries
                                  ? "border-red-400 bg-red-400/10 text-red-100"
                                  : "border-slate-700 text-slate-400"
                              }`}
                            >
                              Toda la repetición
                              <span className="mt-1 block text-xs opacity-70">
                                Cancela también las siguientes
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {captureProposal.actionProposal.intent === "cancel" &&
                      captureProposal.actionProposal.matches.some(
                        (match) =>
                          match.id === captureActionTargetId &&
                          Boolean(match.recurrenceId) &&
                          match.recurrence?.status === "finished",
                      ) ? (
                        <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">
                          Esta es la última ocasión de la repetición. No quedan
                          tareas posteriores por cancelar.
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {captureProposal.actionProposal.matches.length > 0 ? (
                          <button
                            type="button"
                            disabled={savingCapture || !captureActionTargetId}
                            onClick={() => void confirmCaptureAction()}
                            className={`rounded-xl px-5 py-2.5 text-sm font-bold disabled:bg-slate-700 disabled:text-slate-500 ${
                              captureProposal.actionProposal.intent === "cancel"
                                ? "bg-red-400 text-slate-950 hover:bg-red-300"
                                : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                            }`}
                          >
                            {savingCapture
                              ? "Procesando…"
                              : captureProposal.actionProposal.intent ===
                                  "cancel"
                                ? "Confirmar cancelación"
                                : captureProposal.actionProposal.intent ===
                                    "complete"
                                  ? "Confirmar como terminada"
                                  : "Abrir tarea"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={savingCapture}
                          onClick={() => {
                            setCaptureProposal(undefined);
                            setCaptureActionTargetId("");
                            setCaptureActionWholeSeries(false);
                          }}
                          className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-900 disabled:opacity-50"
                        >
                          No es ninguna
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_180px]">
                        <label className="text-xs text-slate-500">
                          Tarea
                          <input
                            value={captureProposal.title}
                            maxLength={150}
                            disabled={savingCapture}
                            onChange={(event) =>
                              setCaptureProposal((current) =>
                                current
                                  ? {
                                      ...current,
                                      title: event.target.value,
                                    }
                                  : current,
                              )
                            }
                            className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                          />
                        </label>

                        <label className="text-xs text-slate-500">
                          Espacio
                          <select
                            value={captureSpaceId}
                            disabled={savingCapture}
                            onChange={(event) =>
                              setCaptureSpaceId(event.target.value)
                            }
                            className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm outline-none focus:border-violet-400"
                          >
                            {writableSpaces.map((space) => (
                              <option key={space.id} value={space.id}>
                                {displaySpaceName(space, spaces)} ·{" "}
                                {spaceTypeLabels[space.type] ?? space.type}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="text-xs text-slate-500">
                          Categoría
                          <select
                            value={captureProposal.category}
                            disabled={savingCapture}
                            onChange={(event) =>
                              setCaptureProposal((current) =>
                                current
                                  ? {
                                      ...current,
                                      category: event.target.value,
                                    }
                                  : current,
                              )
                            }
                            className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm outline-none focus:border-cyan-400"
                          >
                            {Object.entries(categoryLabels).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>

                      {captureProposal.requestedSpaceType ? (
                        <p className="mt-3 text-xs text-slate-400">
                          Sector detectado:{" "}
                          <span className="font-semibold text-cyan-200">
                            {spaceTypeLabels[
                              captureProposal.requestedSpaceType
                            ] ?? captureProposal.requestedSpaceType}
                          </span>
                          . El sector no cambia quién puede verla.
                        </p>
                      ) : null}

                      {captureProposal.temporalSummary ? (
                        <div
                          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                            captureProposal.needsTemporalConfirmation
                              ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                              : "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                          }`}
                        >
                          <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">
                            Fecha, aviso y repetición entendidos
                          </p>
                          <p className="mt-1">
                            {captureProposal.temporalSummary}
                          </p>
                        </div>
                      ) : null}

                      {captureProposal.privacyWarning ? (
                        <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                          ⚠ {captureProposal.privacyWarning}
                        </p>
                      ) : null}

                      {captureProposal.destinationWarning ? (
                        <p className="mt-4 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                          {captureProposal.destinationWarning}
                        </p>
                      ) : null}

                      {captureProposal.reasons.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Por qué lo propuso
                          </p>
                          <ul className="mt-2 space-y-1 text-sm text-slate-400">
                            {captureProposal.reasons.map((reason) => (
                              <li key={reason}>• {reason}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            savingCapture || !captureProposal.title.trim()
                          }
                          onClick={() =>
                            void confirmCapture(
                              captureProposal.canUseTemporalProposal,
                            )
                          }
                          className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:bg-slate-700 disabled:text-slate-500"
                        >
                          {savingCapture
                            ? "Guardando…"
                            : captureProposal.canUseTemporalProposal
                              ? "Confirmar horario y crear"
                              : captureProposal.needsTemporalConfirmation
                                ? "Revisar hora propuesta"
                                : "Confirmar y guardar en mi agenda"}
                        </button>
                        <button
                          type="button"
                          disabled={
                            savingCapture || !captureProposal.title.trim()
                          }
                          onClick={completeCaptureDetails}
                          className="rounded-xl border border-cyan-400/30 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-50"
                        >
                          {captureProposal.canUseTemporalProposal
                            ? "Cambiar fecha u hora"
                            : "Agregar fecha o aviso"}
                        </button>
                        <button
                          type="button"
                          disabled={savingCapture}
                          onClick={() => {
                            setCaptureProposal(undefined);
                            setCaptureSpaceId("");
                          }}
                          className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-900 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </section>

        {briefing ? (
          <section className="relative mb-7 overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0d3151] via-[#08233c] to-[#07182b] p-4 shadow-2xl shadow-slate-950/40 sm:p-6 lg:p-8">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />

            <div className="relative">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">
                    <OrionBrandMark className="h-7 w-7" />
                    Yaleka Hoy
                  </div>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">
                    {personalizeGreeting(
                      briefing.greeting,
                      assistantPreference.preferredName ?? "Usuario",
                    )}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-cyan-100/80">
                    Hoy es un buen día para avanzar.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openAgenda}
                    title="Ver tus actividades por semana o por mes"
                    className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    <span aria-hidden="true">▦</span>
                    Agenda
                  </button>
                  <button
                    type="button"
                    disabled={!briefing || loadingBriefing}
                    onClick={readMyDay}
                    title="Yaleka lee el resumen solamente cuando tú lo solicitas"
                    className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-4 py-2.5 text-sm font-bold text-cyan-50 transition hover:bg-cyan-300/20 disabled:opacity-40"
                  >
                    <span aria-hidden="true">{readingTasks ? "■" : "◖"}</span>
                    {readingTasks ? "Detener lectura" : "Leer mi día"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVoiceSettings(true);
                      setVoiceSettingsNotice("");
                    }}
                    title="Elegir cómo habla y escucha Yaleka"
                    className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    <span aria-hidden="true">⚙</span>
                    Voz
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeviceSettings(true);
                      setDeviceNotice("");
                    }}
                    title="Instalar la aplicación y configurar avisos"
                    className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    <span aria-hidden="true">◎</span>
                    App y avisos
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
                <article className="overflow-hidden rounded-3xl bg-white text-[#0b213b] shadow-xl shadow-slate-950/15">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-lg font-black">Hoy</p>
                      <p className="text-xs font-medium capitalize text-slate-500">
                        {capitalizedTodayLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openAgenda}
                      className="rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-100"
                    >
                      Ver agenda →
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 px-5 sm:px-6">
                    {briefingTasks.length > 0 ? (
                      briefingTasks.slice(0, 5).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => {
                            setExpandedTasks(true);
                            if (task.space?.id)
                              setSelectedSpaceId(task.space.id);
                            window.setTimeout(() => {
                              document
                                .getElementById(`task-${task.id}`)
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                            }, 250);
                          }}
                          className="grid w-full grid-cols-[58px_1fr_auto] items-center gap-3 py-3 text-left"
                        >
                          <span
                            className={`text-xs font-black ${
                              overdueTaskIds.has(task.id)
                                ? "text-orange-600"
                                : "text-blue-600"
                            }`}
                          >
                            {new Date(task.dueAt).toLocaleTimeString("es-MX", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="min-w-0">
                            <span className="line-clamp-2 break-words text-sm font-bold text-[#0b213b]">
                              {task.title}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              {task.space?.name ?? "Yaleka"}
                              {overdueTaskIds.has(task.id) ? " · Atrasada" : ""}
                            </span>
                          </span>
                          <span className="text-lg font-bold text-blue-500">
                            ›
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="py-8 text-center">
                        <p className="font-bold text-emerald-600">
                          Todo al día
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          No hay actividades atrasadas ni para hoy.
                        </p>
                      </div>
                    )}
                  </div>
                </article>

                <div className="space-y-4">
                  {briefing.suggestions[0] ? (
                    <article className="rounded-3xl border border-orange-200 bg-[#fff8ed] p-5 text-[#0b213b] shadow-xl shadow-slate-950/10">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-black text-orange-600">
                          !
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-600">
                            Necesita tu atención
                          </p>
                          <h3 className="mt-1 break-words text-sm font-black">
                            {briefing.suggestions[0].title}
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {briefing.suggestions[0].detail}
                          </p>
                          <a
                            href={briefing.suggestions[0].actionHref}
                            className="mt-3 inline-flex rounded-full bg-orange-100 px-3 py-2 text-xs font-black text-orange-700 hover:bg-orange-200"
                          >
                            {briefing.suggestions[0].actionLabel} →
                          </a>
                        </div>
                      </div>
                    </article>
                  ) : (
                    <article className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-5">
                      <p className="font-bold text-emerald-200">
                        Todo está en orden
                      </p>
                      <p className="mt-1 text-xs text-emerald-100/70">
                        Yaleka no encontró alertas importantes.
                      </p>
                    </article>
                  )}

                  {briefing.suggestions.slice(1, 3).map((suggestion) => (
                    <a
                      key={suggestion.id}
                      href={suggestion.actionHref}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-white">
                          {suggestion.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {suggestion.actionLabel}
                        </span>
                      </span>
                      <span className="text-cyan-300">›</span>
                    </a>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  document.getElementById("orion-captura")?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  })
                }
                className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-cyan-200/25 bg-gradient-to-r from-blue-600/80 to-cyan-500/70 px-4 py-3.5 text-left shadow-lg shadow-cyan-950/20 transition hover:brightness-110"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl">
                  ◉
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-white">
                    ¿Qué necesitas?
                  </span>
                  <span className="block truncate text-xs text-cyan-50/80">
                    Pregúntame o dime qué quieres hacer.
                  </span>
                </span>
                <span className="text-xl text-white">›</span>
              </button>
            </div>
          </section>
        ) : loadingBriefing ? (
          <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">
            Yaleka está preparando tu resumen de hoy…
          </div>
        ) : null}

        {recentCreation ? (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {recentCreation.undone
                ? "Tarea cancelada"
                : recentCreation.restored
                  ? "Tarea restaurada"
                  : "Tarea creada"}
              : <strong>{recentCreation.task.title}</strong> en{" "}
              {recentCreation.destinationName}.
              {recentCreation.undone && recentCreation.task.recurrenceId
                ? " La serie repetitiva quedó detenida para evitar nuevas copias."
                : recentCreation.restored &&
                    recentCreation.task.recurrence?.status === "cancelled"
                  ? " La tarea volvió; la serie repetitiva permanece detenida."
                  : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={processingId === recentCreation.task.id}
                onClick={() =>
                  void (recentCreation.undone
                    ? restoreRecentCreation()
                    : undoRecentCreation())
                }
                className="rounded-xl border border-emerald-300/40 px-3 py-2 text-xs font-bold hover:bg-emerald-300/10 disabled:opacity-50"
              >
                {recentCreation.undone ? "Restaurar tarea" : "Deshacer"}
              </button>
              <button
                type="button"
                onClick={() => setRecentCreation(undefined)}
                className="px-2 text-emerald-200/70"
                aria-label="Cerrar aviso"
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        {duplicateWarning ? (
          <section className="mb-5 rounded-3xl border border-amber-400/40 bg-amber-400/10 p-5 text-amber-100">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
              Yaleka evitó una tarea repetida
            </p>
            <h2 className="mt-2 font-bold">{duplicateWarning.message}</h2>
            <div className="mt-4 space-y-3">
              {duplicateWarning.similarTasks.map((task) => (
                <article
                  key={task.id}
                  className="rounded-2xl border border-amber-300/20 bg-slate-950/50 p-4"
                >
                  <p className="font-semibold text-white">{task.title}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDate(task.dueAt)} ·{" "}
                    {statusLabels[task.status] ?? task.status}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openSimilarTask(task)}
                      className="rounded-xl border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Abrir la existente
                    </button>
                    <button
                      type="button"
                      disabled={processingId === task.id}
                      onClick={() => void addDetailToSimilarTask(task)}
                      className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-50"
                    >
                      Agregarle un dato
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {duplicateWarning.code === "SIMILAR_TASK_EXISTS" ? (
                <button
                  type="button"
                  disabled={savingTask || savingCapture}
                  onClick={() => void createSimilarAnyway()}
                  className="rounded-xl bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-200 disabled:opacity-50"
                >
                  Crear otra de todos modos
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setDuplicateWarning(undefined)}
                className="rounded-xl border border-amber-300/30 px-4 py-2 text-xs hover:bg-amber-300/10"
              >
                Cerrar
              </button>
            </div>
          </section>
        ) : null}

        {dueReminders.length > 0 ? (
          <section id="recordatorios" className="mb-6 space-y-3">
            {dueReminders.slice(0, 3).map((reminder) => (
              <article
                key={reminder.id}
                className="rounded-3xl border border-amber-400/40 bg-amber-400/10 p-5 shadow-lg shadow-amber-950/20"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
                      🔔 Recordatorio pendiente
                    </p>
                    <h2 className="mt-2 text-lg font-bold text-white">
                      {reminder.task.title}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {reminder.task.space?.name ?? "Mi día"} ·{" "}
                      {formatDate(reminder.task.dueAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        processingReminderId === reminder.id ||
                        processingId === reminder.task.id
                      }
                      onClick={() =>
                        void runTaskAction(reminder.task.id, "complete")
                      }
                      className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                    >
                      Ya lo hice
                    </button>
                    <button
                      type="button"
                      disabled={processingReminderId === reminder.id}
                      onClick={() =>
                        void runReminderAction(reminder.id, "snooze", 15)
                      }
                      className="rounded-xl border border-amber-400/40 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:opacity-50"
                    >
                      +15 min
                    </button>
                    <button
                      type="button"
                      disabled={processingReminderId === reminder.id}
                      onClick={() =>
                        void runReminderAction(reminder.id, "snooze", 60)
                      }
                      className="rounded-xl border border-amber-400/40 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:opacity-50"
                    >
                      +1 hora
                    </button>
                    <button
                      type="button"
                      disabled={processingReminderId === reminder.id}
                      onClick={() =>
                        void runReminderAction(reminder.id, "acknowledge")
                      }
                      className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-900 disabled:opacity-50"
                    >
                      Ya lo vi
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {dueReminders.length > 3 ? (
              <p className="text-sm text-amber-200">
                Hay {dueReminders.length - 3} recordatorios pendientes más.
              </p>
            ) : null}
          </section>
        ) : null}

        {showSpaceForm || (!loadingSpaces && spaces.length === 0) ? (
          <form
            onSubmit={(event) => void createSpace(event)}
            className="mb-6 rounded-3xl border border-violet-400/30 bg-slate-900 p-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <label className="flex-1 text-sm text-slate-300">
                Nombre del espacio
                <input
                  value={spaceForm.name}
                  onChange={(event) =>
                    setSpaceForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Mi vida, Familia Bernabé, Mi negocio…"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-violet-400"
                />
              </label>

              <label className="text-sm text-slate-300 lg:w-52">
                Tipo
                <select
                  value={spaceForm.type}
                  onChange={(event) =>
                    setSpaceForm((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-violet-400"
                >
                  <option value="" disabled>
                    Elige el tipo
                  </option>
                  <option value="personal">Personal</option>
                  <option value="family">Familia</option>
                  <option value="business">Negocio</option>
                  <option value="school">Escuela</option>
                </select>
                {spaces.some(
                  (space) =>
                    space.type === "personal" && space.status === "active",
                ) ? (
                  <span className="mt-2 block text-xs text-slate-500">
                    Ya tienes un espacio personal. Si eliges Personal, Yaleka
                    abrirá el existente.
                  </span>
                ) : null}
              </label>

              <button
                type="submit"
                disabled={savingSpace}
                className="h-12 rounded-xl bg-violet-400 px-6 font-bold text-slate-950 hover:bg-violet-300 disabled:bg-slate-700"
              >
                {savingSpace ? "Creando…" : "Crear espacio"}
              </button>
            </div>
          </form>
        ) : null}

        <section className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-bold">Recientes</h2>
          <p className="mt-1 text-xs text-slate-400">
            Tareas del espacio seleccionado. Los demás espacios siguen en tu
            agenda.
          </p>
          <div className="mt-3 space-y-2">
            {tasks.slice(0, 5).map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setExpandedTasks(true);
                  window.setTimeout(
                    () =>
                      document
                        .getElementById(`task-${task.id}`)
                        ?.scrollIntoView({ behavior: "smooth" }),
                    100,
                  );
                }}
                className="block w-full rounded-xl bg-slate-950/40 p-3 text-left text-sm"
              >
                {task.title}
              </button>
            ))}
          </div>
          {!tasks.length ? (
            <p className="mt-3 text-sm text-slate-400">
              Sin tareas recientes en este espacio.
            </p>
          ) : null}
        </section>
        <button
          type="button"
          aria-expanded={expandedTasks}
          onClick={() => setExpandedTasks(!expandedTasks)}
          className="mb-4 rounded-xl border border-white/15 px-4 py-3 text-sm"
        >
          {expandedTasks
            ? "Cerrar organización"
            : "Organizar espacios y tareas"}
        </button>
        <div hidden={!expandedTasks}>
          {loadingSpaces ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
              Cargando Mi día…
            </div>
          ) : spaces.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center">
              <p className="text-lg font-semibold">Crea tu primer espacio</p>
              <p className="mt-2 text-sm text-slate-500">
                Puede ser personal, familiar, escolar o para tu negocio.
              </p>
            </div>
          ) : (
            <>
              <div
                id="orion-life-workspace"
                className="mb-6 scroll-mt-24 flex gap-2 overflow-x-auto pb-2"
              >
                {spaces.map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => {
                      window.speechSynthesis?.cancel();
                      setReadingTasks(false);
                      setAreaFilter(null);
                      setSelectedSpaceId(space.id);
                    }}
                    className={`min-w-max rounded-2xl border px-4 py-3 text-left transition ${
                      selectedSpaceId === space.id
                        ? "border-violet-400/60 bg-violet-400/15"
                        : "border-slate-800 bg-slate-900 hover:border-slate-700"
                    }`}
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {spaceTypeLabels[space.type] ?? space.type}
                    </span>
                    <span className="mt-1 block font-semibold">
                      {displaySpaceName(space, spaces)}
                    </span>
                  </button>
                ))}
              </div>

              {areaFilter ? (
                <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    Mostrando únicamente actividades de{" "}
                    <strong>{orionAreaGuides[areaFilter].label}</strong>{" "}
                    guardadas en tu espacio privado.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAreaFilter(null)}
                    className="w-fit rounded-xl border border-cyan-200/30 px-3 py-2 text-xs font-bold hover:bg-cyan-200/10"
                  >
                    Ver todas
                  </button>
                </div>
              ) : null}

              {duplicateSpaceNames.length > 0 ? (
                <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  Hay espacios con el mismo nombre:{" "}
                  {duplicateSpaceNames
                    .map(
                      (group) =>
                        `${group.name} (${group.count} espacios ${
                          spaceTypeLabels[group.type]?.toLocaleLowerCase(
                            "es-MX",
                          ) ?? group.type
                        })`,
                    )
                    .join(", ")}
                  . Yaleka los numeró para distinguirlos y no combinará sus
                  tareas sin tu autorización.
                </div>
              ) : null}

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="min-w-0">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      ["Pendientes", activeCount, "text-cyan-300"],
                      ["En proceso", inProgressCount, "text-amber-300"],
                      ["Terminadas", completedCount, "text-emerald-300"],
                    ].map(([label, value, color]) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                      >
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className={`mt-2 text-2xl font-bold ${color}`}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">
                      <button
                        type="button"
                        onClick={() => setView("active")}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                          view === "active"
                            ? "bg-cyan-400 text-slate-950"
                            : "text-slate-400"
                        }`}
                      >
                        Por hacer
                      </button>
                      <button
                        type="button"
                        onClick={() => setView("completed")}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                          view === "completed"
                            ? "bg-emerald-400 text-slate-950"
                            : "text-slate-400"
                        }`}
                      >
                        Terminadas
                      </button>
                    </div>

                    <p className="text-xs text-slate-600">
                      {lastSync
                        ? `Actualizado ${lastSync.toLocaleTimeString("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}`
                        : ""}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {loadingTasks ? (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
                        Sincronizando tareas…
                      </div>
                    ) : visibleTasks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-9 text-center">
                        <p className="font-semibold">
                          {view === "active"
                            ? "No hay tareas pendientes"
                            : "Todavía no hay tareas terminadas"}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {view === "active"
                            ? "Agrega una tarea desde el panel derecho."
                            : "Las actividades completadas aparecerán aquí."}
                        </p>
                      </div>
                    ) : (
                      visibleTasks.map((task) => {
                        const overdue =
                          Boolean(task.dueAt) &&
                          new Date(task.dueAt as string).getTime() <
                            (lastSync?.getTime() ?? 0) &&
                          task.status !== "completed";
                        const assignedToAnother =
                          Boolean(task.user) && task.user?.id !== userId;
                        const canTake =
                          canEdit &&
                          activeStatuses.has(task.status) &&
                          !task.claimedBy &&
                          (!assignedToAnother || canManageMembers);
                        const canFinish =
                          canEdit &&
                          activeStatuses.has(task.status) &&
                          (!task.claimedBy ||
                            task.claimedBy.id === userId ||
                            canManageMembers) &&
                          (!assignedToAnother || canManageMembers);
                        const lastActivity = task.activities[0];

                        return (
                          <article
                            key={task.id}
                            id={`task-${task.id}`}
                            className="rounded-3xl border border-slate-800 bg-slate-900 p-5"
                          >
                            <div className="flex items-start gap-4">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-lg text-cyan-300">
                                {categoryIcons[task.category ?? "personal"] ??
                                  "✓"}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <h3 className="font-semibold text-white">
                                      {task.title}
                                    </h3>
                                    {task.description ? (
                                      <p className="mt-1 text-sm leading-6 text-slate-400">
                                        {task.description}
                                      </p>
                                    ) : null}
                                  </div>

                                  <span
                                    className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                                      task.status === "completed"
                                        ? "bg-emerald-500/10 text-emerald-300"
                                        : task.status === "cancelled"
                                          ? "bg-red-500/10 text-red-300"
                                          : task.status === "in_progress"
                                            ? "bg-amber-500/10 text-amber-300"
                                            : "bg-cyan-500/10 text-cyan-300"
                                    }`}
                                  >
                                    {statusLabels[task.status] ?? task.status}
                                  </span>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                                  <span
                                    className={
                                      overdue
                                        ? "text-red-300"
                                        : "text-slate-500"
                                    }
                                  >
                                    {overdue ? "Vencida · " : ""}
                                    {formatDate(task.dueAt)}
                                  </span>
                                  {task.estimatedMinutes ? (
                                    <span className="text-slate-500">
                                      {task.estimatedMinutes} min estimados
                                    </span>
                                  ) : null}
                                  {task.reminder ? (
                                    <span
                                      className={
                                        task.reminder.status === "scheduled"
                                          ? "text-amber-300"
                                          : "text-slate-600"
                                      }
                                    >
                                      🔔{" "}
                                      {reminderLabel(task.reminder.leadMinutes)}
                                    </span>
                                  ) : null}
                                  {task.recurrence ? (
                                    <span
                                      className={
                                        task.recurrence.status === "active"
                                          ? "text-violet-300"
                                          : "text-slate-600"
                                      }
                                    >
                                      ↻ {recurrenceDisplayText(task)}
                                    </span>
                                  ) : null}
                                  {task.claimedBy ? (
                                    <span className="text-amber-300">
                                      {task.claimedBy.name} se está encargando
                                    </span>
                                  ) : task.user ? (
                                    <span className="text-violet-300">
                                      Asignada a {task.user.name}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">
                                      Sin responsable
                                    </span>
                                  )}
                                </div>

                                {lastActivity ? (
                                  <p className="mt-3 text-xs text-slate-600">
                                    {lastActivity.actor?.name ?? "Yaleka"}{" "}
                                    {actionLabels[lastActivity.action] ??
                                      lastActivity.action}
                                    {lastActivity.note
                                      ? `: ${lastActivity.note}`
                                      : ""}
                                  </p>
                                ) : null}

                                <div className="mt-4 flex flex-wrap gap-2">
                                  {canTake ? (
                                    <button
                                      type="button"
                                      disabled={processingId === task.id}
                                      onClick={() =>
                                        void runTaskAction(task.id, "claim")
                                      }
                                      className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
                                    >
                                      Me encargo
                                    </button>
                                  ) : null}

                                  {canFinish ? (
                                    <button
                                      type="button"
                                      disabled={processingId === task.id}
                                      onClick={() =>
                                        void runTaskAction(task.id, "complete")
                                      }
                                      className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                                    >
                                      Marcar terminada
                                    </button>
                                  ) : null}

                                  {canEdit &&
                                  activeStatuses.has(task.status) ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={processingId === task.id}
                                        onClick={() =>
                                          void runTaskAction(
                                            task.id,
                                            "postpone",
                                            {
                                              minutes: 30,
                                            },
                                          )
                                        }
                                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        +30 min
                                      </button>
                                      <button
                                        type="button"
                                        disabled={processingId === task.id}
                                        onClick={() =>
                                          void runTaskAction(
                                            task.id,
                                            "postpone",
                                            {
                                              minutes: 60,
                                            },
                                          )
                                        }
                                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        +1 hora
                                      </button>
                                      <button
                                        type="button"
                                        disabled={processingId === task.id}
                                        onClick={() =>
                                          void runTaskAction(
                                            task.id,
                                            "postpone",
                                            {
                                              until: tomorrowAtNine(),
                                            },
                                          )
                                        }
                                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        Mañana 9:00
                                      </button>
                                      <button
                                        type="button"
                                        disabled={processingId === task.id}
                                        onClick={() => {
                                          const label = task.recurrence
                                            ? "esta ocasión"
                                            : "esta tarea";
                                          if (
                                            window.confirm(
                                              `¿Cancelar ${label}? Podrás restaurarla después.`,
                                            )
                                          ) {
                                            void runTaskAction(
                                              task.id,
                                              "cancel",
                                            );
                                          }
                                        }}
                                        className="rounded-xl border border-red-400/30 px-3 py-2 text-xs text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                                      >
                                        {task.recurrence
                                          ? "Cancelar esta vez"
                                          : "Cancelar"}
                                      </button>
                                    </>
                                  ) : null}

                                  {canEdit &&
                                  (task.status === "completed" ||
                                    task.status === "cancelled") ? (
                                    <button
                                      type="button"
                                      disabled={processingId === task.id}
                                      onClick={() =>
                                        void runTaskAction(task.id, "reopen")
                                      }
                                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                                    >
                                      {task.status === "cancelled"
                                        ? "Restaurar"
                                        : "Reabrir"}
                                    </button>
                                  ) : null}

                                  {canEdit &&
                                  task.recurrence?.status === "active" ? (
                                    <button
                                      type="button"
                                      disabled={processingId === task.id}
                                      onClick={() => void stopRecurrence(task)}
                                      className="rounded-xl border border-violet-400/30 px-3 py-2 text-xs text-violet-200 hover:bg-violet-400/10 disabled:opacity-50"
                                    >
                                      Dejar de repetir
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>

                <aside className="space-y-5">
                  {activeSpace ? (
                    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
                        Nueva tarea
                      </p>
                      <form
                        id="orion-life-task-form"
                        onSubmit={(event) => void createTask(event)}
                        className="mt-4 space-y-3"
                      >
                        <input
                          value={taskForm.title}
                          disabled={!canEdit || savingTask}
                          onChange={(event) =>
                            setTaskForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          placeholder="¿Qué hay que hacer?"
                          className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400 disabled:opacity-50"
                        />

                        <textarea
                          value={taskForm.description}
                          disabled={!canEdit || savingTask}
                          onChange={(event) =>
                            setTaskForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          placeholder="Detalles opcionales"
                          rows={2}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400 disabled:opacity-50"
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={taskForm.category}
                            disabled={!canEdit || savingTask}
                            onChange={(event) =>
                              setTaskForm((current) => ({
                                ...current,
                                category: event.target.value,
                              }))
                            }
                            className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400"
                          >
                            <option value="personal">Personal</option>
                            <option value="purchase">Compra</option>
                            <option value="payment">Pago</option>
                            <option value="family">Familia</option>
                            <option value="school">Escuela</option>
                            <option value="business">Negocio</option>
                            <option value="health">Salud</option>
                            <option value="government">Gobierno</option>
                            <option value="community">Comunidad</option>
                            <option value="vehicle">Vehículo</option>
                          </select>

                          <select
                            value={taskForm.priority}
                            disabled={!canEdit || savingTask}
                            onChange={(event) =>
                              setTaskForm((current) => ({
                                ...current,
                                priority: event.target.value,
                              }))
                            }
                            className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400"
                          >
                            <option value="low">Prioridad baja</option>
                            <option value="normal">Normal</option>
                            <option value="high">Alta</option>
                            <option value="urgent">Urgente</option>
                          </select>
                        </div>

                        <label className="block text-xs text-slate-500">
                          Fecha y hora
                          <input
                            type="datetime-local"
                            value={taskForm.dueAt}
                            disabled={!canEdit || savingTask}
                            onChange={(event) =>
                              setTaskForm((current) => ({
                                ...current,
                                dueAt: event.target.value,
                              }))
                            }
                            className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-300 outline-none focus:border-cyan-400"
                          />
                        </label>

                        <label className="block text-xs text-slate-500">
                          Recordarme
                          <select
                            value={taskForm.reminderMinutesBefore}
                            disabled={!canEdit || savingTask}
                            onChange={(event) =>
                              setTaskForm((current) => ({
                                ...current,
                                reminderMinutesBefore: event.target.value,
                              }))
                            }
                            className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-amber-400"
                          >
                            <option value="">Sin recordatorio</option>
                            <option value="0">A la hora</option>
                            <option value="15">15 minutos antes</option>
                            <option value="30">30 minutos antes</option>
                            <option value="60">1 hora antes</option>
                            <option value="1440">1 día antes</option>
                          </select>
                        </label>

                        <div className="space-y-2">
                          <label className="text-xs text-slate-500">
                            Repetición
                            <select
                              value={taskForm.recurrenceFrequency}
                              disabled={!canEdit || savingTask}
                              onChange={(event) =>
                                setTaskForm((current) => ({
                                  ...current,
                                  recurrenceFrequency: event.target.value,
                                  recurrenceInterval: event.target.value
                                    ? current.recurrenceInterval
                                    : "1",
                                  recurrenceEndsAt: event.target.value
                                    ? current.recurrenceEndsAt
                                    : "",
                                }))
                              }
                              className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-violet-400"
                            >
                              <option value="">No se repite</option>
                              <option value="daily">Cada día</option>
                              <option value="weekly">Cada semana</option>
                              <option value="monthly">Cada mes</option>
                              <option value="yearly">Cada año</option>
                            </select>
                          </label>

                          {taskForm.recurrenceFrequency ? (
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs text-slate-500">
                                Cada cuántas
                                <input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={taskForm.recurrenceInterval}
                                  disabled={!canEdit || savingTask}
                                  onChange={(event) =>
                                    setTaskForm((current) => ({
                                      ...current,
                                      recurrenceInterval: event.target.value,
                                    }))
                                  }
                                  className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-violet-400"
                                />
                              </label>
                              <label className="text-xs text-slate-500">
                                Termina (opcional)
                                <input
                                  type="date"
                                  value={taskForm.recurrenceEndsAt}
                                  disabled={!canEdit || savingTask}
                                  min={taskForm.dueAt.slice(0, 10) || undefined}
                                  onChange={(event) =>
                                    setTaskForm((current) => ({
                                      ...current,
                                      recurrenceEndsAt: event.target.value,
                                    }))
                                  }
                                  className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-300 outline-none focus:border-violet-400"
                                />
                              </label>
                            </div>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs text-slate-500">
                            Minutos estimados
                            <input
                              type="number"
                              min="5"
                              max="1440"
                              step="5"
                              value={taskForm.estimatedMinutes}
                              disabled={!canEdit || savingTask}
                              onChange={(event) =>
                                setTaskForm((current) => ({
                                  ...current,
                                  estimatedMinutes: event.target.value,
                                }))
                              }
                              className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400"
                            />
                          </label>

                          <label className="text-xs text-slate-500">
                            Responsable
                            <select
                              value={taskForm.userId}
                              disabled={!canEdit || savingTask}
                              onChange={(event) =>
                                setTaskForm((current) => ({
                                  ...current,
                                  userId: event.target.value,
                                }))
                              }
                              className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400"
                            >
                              <option value="">Cualquiera</option>
                              {activeSpace.members
                                .filter((member) => member.role !== "viewer")
                                .map((member) => (
                                  <option
                                    key={member.id}
                                    value={member.user.id}
                                  >
                                    {member.user.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>

                        <button
                          type="submit"
                          disabled={!canEdit || savingTask}
                          className="h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700 disabled:text-slate-500"
                        >
                          {savingTask ? "Guardando…" : "Agregar a Mi día"}
                        </button>
                      </form>
                    </section>
                  ) : null}

                  {upcomingReminders.length > 0 ? (
                    <section className="rounded-3xl border border-amber-400/20 bg-slate-900 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                        Próximos avisos
                      </p>
                      <div className="mt-4 space-y-3">
                        {upcomingReminders.slice(0, 4).map((reminder) => (
                          <div
                            key={reminder.id}
                            className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3"
                          >
                            <p className="text-sm font-semibold text-slate-200">
                              {reminder.task.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              🔔 {formatDate(reminder.remindAt)} ·{" "}
                              {reminder.task.space?.name ?? "Mi día"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {activeSpace ? (
                    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
                            {activeSpace.type === "personal"
                              ? "Privado"
                              : "Compartido"}
                          </p>
                          <h2 className="mt-1 font-semibold">
                            {activeSpace.name}
                          </h2>
                        </div>
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                          {activeSpace.members.length}
                        </span>
                      </div>

                      <div className="mt-4 flex -space-x-2">
                        {activeSpace.members.map((member) => (
                          <div
                            key={member.id}
                            title={`${member.user.name} · ${member.role}`}
                            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-900 bg-violet-400 text-xs font-bold text-slate-950"
                          >
                            {initials(member.user.name)}
                          </div>
                        ))}
                      </div>

                      {canManageMembers ? (
                        <form
                          onSubmit={(event) => void addMember(event)}
                          className="mt-5 space-y-2 border-t border-slate-800 pt-5"
                        >
                          <p className="text-xs text-slate-500">
                            Agregar una cuenta existente de Yaleka
                          </p>
                          <input
                            type="email"
                            value={memberForm.email}
                            disabled={savingMember}
                            onChange={(event) =>
                              setMemberForm((current) => ({
                                ...current,
                                email: event.target.value,
                              }))
                            }
                            placeholder="correo@ejemplo.com"
                            className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-violet-400"
                          />
                          <div className="grid grid-cols-[1fr_auto] gap-2">
                            <select
                              value={memberForm.role}
                              disabled={savingMember}
                              onChange={(event) =>
                                setMemberForm((current) => ({
                                  ...current,
                                  role: event.target.value,
                                }))
                              }
                              className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-violet-400"
                            >
                              <option value="member">Puede completar</option>
                              <option value="admin">Administrador</option>
                              <option value="viewer">Solo lectura</option>
                            </select>
                            <button
                              type="submit"
                              disabled={savingMember}
                              className="rounded-xl border border-violet-400/40 px-4 text-sm font-semibold text-violet-200 hover:bg-violet-400/10 disabled:opacity-50"
                            >
                              Agregar
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </section>
                  ) : null}
                </aside>
              </div>
            </>
          )}
        </div>
      </div>

      {showAgenda ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="orion-agenda-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/85 p-0 backdrop-blur-sm sm:items-center sm:p-5"
        >
          <section className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-t-[2rem] border border-cyan-300/20 bg-[#081a2e] p-4 shadow-2xl sm:rounded-[2rem] sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">
                  Todo en un solo lugar
                </p>
                <h2
                  id="orion-agenda-title"
                  className="mt-1 text-2xl font-black text-white"
                >
                  Mi agenda
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Reúne Familia, Negocio, Educación y tus demás espacios sin
                  mezclarlos.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar agenda"
                onClick={() => setShowAgenda(false)}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-xl text-slate-300 hover:bg-white/10 sm:static"
              >
                ×
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveAgenda(-1)}
                  aria-label="Periodo anterior"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white hover:bg-white/10"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaAnchor(new Date())}
                  className="h-10 rounded-xl border border-white/10 px-4 text-sm font-bold text-white hover:bg-white/10"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => moveAgenda(1)}
                  aria-label="Periodo siguiente"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white hover:bg-white/10"
                >
                  ›
                </button>
              </div>

              <p className="text-center text-sm font-black capitalize text-white sm:text-base">
                {agendaMode === "week"
                  ? `${agendaRange.from.toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                    })} – ${new Date(
                      agendaRange.to.getTime() - 1,
                    ).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : agendaAnchor.toLocaleDateString("es-MX", {
                      month: "long",
                      year: "numeric",
                    })}
              </p>

              <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-slate-950 p-1">
                {(["week", "month"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAgendaMode(mode)}
                    className={`rounded-lg px-4 py-2 text-xs font-black transition ${
                      agendaMode === mode
                        ? "bg-cyan-400 text-slate-950"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {mode === "week" ? "Semana" : "Mes"}
                  </button>
                ))}
              </div>
            </div>

            {agendaError ? (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                <span>{agendaError}</span>
                <button
                  type="button"
                  onClick={() => void refreshAgenda()}
                  className="font-black"
                >
                  Reintentar
                </button>
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/30">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-7 border-b border-white/10 bg-white/5">
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
                    (day) => (
                      <div
                        key={day}
                        className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400"
                      >
                        {day}
                      </div>
                    ),
                  )}
                </div>

                <div className="grid grid-cols-7">
                  {agendaDays.map((day) => {
                    const key = calendarDateKey(day);
                    const dayTasks = agendaTasksByDay.get(key) ?? [];
                    const today = key === calendarDateKey(new Date());
                    const outsideMonth =
                      agendaMode === "month" &&
                      day.getMonth() !== agendaAnchor.getMonth();

                    return (
                      <article
                        key={key}
                        className={`min-h-36 border-b border-r border-white/10 p-2 ${
                          outsideMonth ? "bg-slate-950/35" : "bg-[#0b1d33]/70"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-black ${
                              today
                                ? "bg-cyan-400 text-slate-950"
                                : outsideMonth
                                  ? "text-slate-600"
                                  : "text-slate-300"
                            }`}
                          >
                            {day.getDate()}
                          </span>
                          {dayTasks.length > 0 ? (
                            <span className="text-[10px] font-bold text-cyan-300">
                              {dayTasks.length}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 space-y-1.5">
                          {dayTasks
                            .slice(0, agendaMode === "week" ? 5 : 3)
                            .map((task) => (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => openAgendaTask(task)}
                                title={`${task.title} · ${task.space?.name ?? "Mi día"}`}
                                className="block w-full rounded-lg border border-cyan-300/15 bg-cyan-300/10 px-2 py-2 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/15"
                              >
                                <span className="block text-[10px] font-black text-cyan-200">
                                  {task.dueAt
                                    ? new Date(task.dueAt).toLocaleTimeString(
                                        "es-MX",
                                        {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        },
                                      )
                                    : "Sin hora"}
                                </span>
                                <span className="mt-0.5 line-clamp-2 block text-xs font-bold text-white">
                                  {task.title}
                                </span>
                                <span className="mt-1 block truncate text-[10px] text-slate-400">
                                  {task.space?.name ?? "Mi día"}
                                </span>
                              </button>
                            ))}
                          {dayTasks.length > (agendaMode === "week" ? 5 : 3) ? (
                            <p className="px-1 text-[10px] font-bold text-slate-400">
                              +
                              {dayTasks.length -
                                (agendaMode === "week" ? 5 : 3)}{" "}
                              más
                            </p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <p>
                {loadingAgenda
                  ? "Actualizando agenda…"
                  : `${agendaTasks.length} ${agendaTasks.length === 1 ? "actividad activa" : "actividades activas"} en este periodo.`}
              </p>
              <button
                type="button"
                disabled={loadingAgenda}
                onClick={() => void refreshAgenda()}
                className="w-fit font-black text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
              >
                Actualizar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedArea ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="orion-area-title"
          className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-5"
        >
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-white/10 bg-[#0b1d33] p-5 shadow-2xl sm:rounded-[2rem] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                    areaCards.find((area) => area.kind === selectedArea)
                      ?.background ?? "bg-cyan-50"
                  } ${
                    areaCards.find((area) => area.kind === selectedArea)
                      ?.color ?? "text-cyan-700"
                  }`}
                >
                  <OrionAreaIcon kind={selectedArea} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">
                    Yaleka te guía
                  </p>
                  <h2
                    id="orion-area-title"
                    className="mt-1 text-2xl font-black text-white"
                  >
                    {orionAreaGuides[selectedArea].label}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {orionAreaGuides[selectedArea].description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cerrar opciones del área"
                onClick={() => setSelectedArea(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-xl text-slate-300 hover:bg-white/10"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {orionAreaGuides[selectedArea].actions.map((action) => (
                <button
                  key={action.title}
                  type="button"
                  onClick={() => prepareAreaTask(selectedArea, action)}
                  className="group rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-300/10"
                >
                  <span className="block text-sm font-black text-white">
                    {action.title}
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-slate-400 group-hover:text-slate-300">
                    {action.description}
                  </span>
                  <span className="mt-4 block text-xs font-bold text-cyan-300">
                    {action.href ? "Abrir →" : "Preparar →"}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
                Privacidad clara
              </p>
              <p className="mt-2 text-sm leading-6 text-emerald-50/80">
                {orionAreaGuides[selectedArea].privacy}
              </p>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => dictateInArea(selectedArea)}
                className="h-12 rounded-xl bg-cyan-400 font-black text-slate-950 hover:bg-cyan-300"
              >
                🎤 Dictar una actividad
              </button>
              <button
                type="button"
                onClick={() => viewAreaTasks(selectedArea)}
                className="h-12 rounded-xl border border-cyan-300/30 font-bold text-cyan-100 hover:bg-cyan-300/10"
              >
                Ver pendientes de {orionAreaGuides[selectedArea].label}
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-slate-500">
              Yaleka prepara la acción; tú revisas y confirmas antes de
              guardarla.
            </p>
          </section>
        </div>
      ) : null}

      {showDeviceSettings ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="orion-device-settings-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-5"
        >
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-cyan-300/20 bg-[#0b1d33] p-5 shadow-2xl sm:rounded-[2rem] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">
                  Acceso más cómodo
                </p>
                <h2
                  id="orion-device-settings-title"
                  className="mt-2 text-2xl font-black text-white"
                >
                  Aplicación y avisos
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Tú decides si instalas Mi día y si permites recordatorios en
                  este dispositivo.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar aplicación y avisos"
                onClick={() => setShowDeviceSettings(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-xl text-slate-300 hover:bg-white/10"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <article className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-400/15 text-xl text-blue-200">
                  ◫
                </span>
                <h3 className="mt-4 font-black text-white">
                  Abrir como aplicación
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Agrega un acceso directo y úsala con una pantalla limpia, sin
                  buscar la dirección cada vez.
                </p>
                <p
                  className={`mt-4 text-xs font-bold ${appInstalled ? "text-emerald-300" : "text-slate-300"}`}
                >
                  {appInstalled
                    ? "✓ Instalada en este dispositivo"
                    : "Disponible según tu navegador"}
                </p>
                <button
                  type="button"
                  onClick={() => void installApplication()}
                  className="mt-4 h-11 w-full rounded-xl border border-blue-300/30 font-black text-blue-100 hover:bg-blue-300/10"
                >
                  {appInstalled ? "Ver estado" : "Instalar aplicación"}
                </button>
              </article>

              <article className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-xl text-amber-200">
                  ♢
                </span>
                <h3 className="mt-4 font-black text-white">
                  Avisos importantes
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Los avisos usan un mensaje general; el detalle privado se
                  consulta después de iniciar sesión.
                </p>
                <p
                  className={`mt-4 text-xs font-bold ${
                    notificationsEnabled ? "text-emerald-300" : "text-slate-300"
                  }`}
                >
                  {notificationPermission === "unsupported"
                    ? "No disponible en este navegador"
                    : notificationsEnabled
                      ? "✓ Avisos activados"
                      : notificationPermission === "denied"
                        ? "Bloqueados por el navegador"
                        : "Avisos desactivados"}
                </p>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      notificationsEnabled
                        ? disableNotifications()
                        : void enableNotifications()
                    }
                    className="h-11 rounded-xl border border-amber-300/30 font-black text-amber-100 hover:bg-amber-300/10"
                  >
                    {notificationsEnabled ? "Pausar avisos" : "Activar avisos"}
                  </button>
                  <button
                    type="button"
                    disabled={!notificationsEnabled}
                    onClick={() => void testNotification()}
                    className="h-10 rounded-xl text-xs font-bold text-cyan-300 hover:bg-white/5 disabled:text-slate-600"
                  >
                    Enviar aviso de prueba
                  </button>
                </div>
              </article>
            </div>

            {deviceNotice ? (
              <p className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
                {deviceNotice}
              </p>
            ) : null}

            <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
                Sin promesas engañosas
              </p>
              <p className="mt-2 text-xs leading-5 text-emerald-50/80">
                En esta etapa los avisos funcionan mientras el navegador
                mantiene activa la aplicación. Para garantizar avisos con todo
                cerrado se agregará después el envío seguro desde el servidor.
              </p>
            </div>
          </section>
        </div>
      ) : null}

      {showVoiceSettings ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="orion-voice-settings-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-5"
        >
          <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] border border-cyan-300/20 bg-[#0b1d33] p-5 shadow-2xl sm:rounded-[2rem] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">
                  Asistente personal
                </p>
                <h2
                  id="orion-voice-settings-title"
                  className="mt-2 text-2xl font-black text-white"
                >
                  Voz de Yaleka
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Esta configuración se usa al tocar “Leer mi día” y al dictar.
                  Yaleka nunca hablará sin que tú se lo pidas.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar configuración de voz"
                onClick={() => {
                  window.speechSynthesis?.cancel();
                  setShowVoiceSettings(false);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-xl text-slate-300 hover:bg-white/10"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <label className="block text-sm font-semibold text-slate-200">
                ¿Cómo quieres que Yaleka te llame?
                <input
                  value={assistantPreference.preferredName ?? ""}
                  maxLength={80}
                  onChange={(event) =>
                    setAssistantPreference((current) => ({
                      ...current,
                      preferredName: event.target.value,
                    }))
                  }
                  placeholder="Por ejemplo: Yazmín"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
                <input
                  type="checkbox"
                  checked={assistantPreference.automaticLocale}
                  onChange={(event) =>
                    setAssistantPreference((current) => ({
                      ...current,
                      automaticLocale: event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 accent-cyan-400"
                />
                <span>
                  <span className="block text-sm font-bold text-white">
                    Adaptar la voz a este dispositivo
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    Recomendado. Yaleka usa automáticamente el idioma y región
                    del teléfono o computadora.
                  </span>
                </span>
              </label>

              {!assistantPreference.automaticLocale ? (
                <label className="block text-sm font-semibold text-slate-200">
                  Idioma y región
                  <select
                    value={assistantPreference.voiceLocale}
                    onChange={(event) =>
                      setAssistantPreference((current) => ({
                        ...current,
                        voiceLocale: event.target.value,
                        voiceName: null,
                      }))
                    }
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-white outline-none focus:border-cyan-400"
                  >
                    {voiceLocaleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block text-sm font-semibold text-slate-200">
                Voz disponible en este dispositivo
                <select
                  value={assistantPreference.voiceName ?? ""}
                  onChange={(event) =>
                    setAssistantPreference((current) => ({
                      ...current,
                      voiceName: event.target.value || null,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-white outline-none focus:border-cyan-400"
                >
                  <option value="">Voz recomendada automáticamente</option>
                  {availableVoices
                    .filter((voice) => {
                      const language = getEffectiveVoiceLocale()
                        .toLocaleLowerCase()
                        .split("-")[0];
                      return (
                        voice.lang.toLocaleLowerCase().split("-")[0] ===
                        language
                      );
                    })
                    .map((voice) => (
                      <option
                        key={`${voice.name}-${voice.lang}`}
                        value={voice.name}
                      >
                        {voice.name} · {voice.lang}
                      </option>
                    ))}
                </select>
                <span className="mt-2 block text-xs leading-5 text-slate-500">
                  Las voces pertenecen a tu dispositivo. Si usas otro, Yaleka
                  elegirá una equivalente de la misma región.
                </span>
              </label>

              <label className="block text-sm font-semibold text-slate-200">
                Velocidad · {assistantPreference.voiceRate.toFixed(2)}×
                <input
                  type="range"
                  min="0.7"
                  max="1.3"
                  step="0.05"
                  value={assistantPreference.voiceRate}
                  onChange={(event) =>
                    setAssistantPreference((current) => ({
                      ...current,
                      voiceRate: Number(event.target.value),
                    }))
                  }
                  className="mt-3 w-full accent-cyan-400"
                />
                <span className="mt-1 flex justify-between text-xs font-normal text-slate-500">
                  <span>Más pausada</span>
                  <span>Normal</span>
                  <span>Más rápida</span>
                </span>
              </label>
            </div>

            {voiceSettingsNotice ? (
              <p className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
                {voiceSettingsNotice}
              </p>
            ) : null}

            <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_1.2fr]">
              <button
                type="button"
                onClick={testAssistantVoice}
                className="h-12 rounded-xl border border-cyan-300/30 font-bold text-cyan-100 hover:bg-cyan-300/10"
              >
                ▶ Escuchar prueba
              </button>
              <button
                type="button"
                disabled={savingVoiceSettings}
                onClick={() => void saveAssistantPreference()}
                className="h-12 rounded-xl bg-cyan-400 font-black text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700 disabled:text-slate-400"
              >
                {savingVoiceSettings ? "Guardando…" : "Guardar mi voz"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

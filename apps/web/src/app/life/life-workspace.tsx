'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

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
  user: UserSummary | null;
  createdBy: UserSummary | null;
  claimedBy: UserSummary | null;
  completedBy: UserSummary | null;
  activities: TaskActivity[];
};

type ReminderItem = TaskReminderSummary & {
  originalRemindAt: string;
  urgency: 'due' | 'upcoming';
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
  intent: 'create' | 'cancel' | 'complete' | 'find';
  title: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  reasons: string[];
  sensitive: boolean;
  privacyWarning: string | null;
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
  recurrenceFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  recurrenceInterval: number | null;
  recurrenceEndsAt: string | null;
  reminderMinutesBefore: number | null;
  temporalSummary: string | null;
  needsTemporalConfirmation: boolean;
  canUseTemporalProposal: boolean;
  actionProposal: {
    intent: 'cancel' | 'complete' | 'find';
    query: string;
    scope:
      | 'today'
      | 'tomorrow'
      | 'today_and_tomorrow'
      | 'series'
      | 'unspecified';
    recommendedTaskId: string | null;
    message: string;
    matches: Array<{
      id: string;
      title: string;
      status: string;
      dueAt: string | null;
      spaceId: string | null;
      recurrenceId: string | null;
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
  code?: 'DUPLICATE_TASK' | 'SIMILAR_TASK_EXISTS';
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
  code: 'DUPLICATE_TASK' | 'SIMILAR_TASK_EXISTS';
  message: string;
  similarTasks: SimilarTask[];
  payload: TaskCreatePayload;
  source: 'capture' | 'form';
  destinationName: string;
};

type RecentCreation = {
  task: LifeTask;
  destinationName: string;
  undone: boolean;
  restored?: boolean;
};

type SpeechRecognitionResultEvent = {
  results: {
    0?: {
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
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: ApiErrorPayload | null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const sessionExpiredEvent = 'orion-session-expired';

const activeStatuses = new Set([
  'pending',
  'assigned',
  'in_progress',
  'postponed',
]);

const spaceTypeLabels: Record<string, string> = {
  personal: 'Personal',
  family: 'Familia',
  business: 'Negocio',
  school: 'Escuela',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  in_progress: 'En proceso',
  postponed: 'Pospuesta',
  completed: 'Terminada',
  cancelled: 'Cancelada',
};

const actionLabels: Record<string, string> = {
  created: 'creó la tarea',
  claimed: 'se encargó de la tarea',
  completed: 'terminó la tarea',
  cancelled: 'canceló la tarea',
  note_added: 'agregó un dato',
  postponed: 'pospuso la tarea',
  reopened: 'reabrió la tarea',
  recurrence_generated: 'preparó la siguiente repetición',
  recurrence_cancelled: 'detuvo las siguientes repeticiones',
  cancelled_with_recurrence: 'canceló una repetición futura',
  reminder_snoozed: 'pospuso el recordatorio',
  reminder_acknowledged: 'confirmó que vio el recordatorio',
};

const recurrenceLabels: Record<string, string> = {
  daily: 'Cada día',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
  yearly: 'Cada año',
};

const categoryIcons: Record<string, string> = {
  personal: '✓',
  purchase: '🛒',
  payment: '🧾',
  family: '⌂',
  school: '✎',
  business: '▣',
  health: '♥',
  vehicle: '◆',
};

const categoryLabels: Record<string, string> = {
  personal: 'Personal',
  purchase: 'Compra',
  payment: 'Pago',
  family: 'Familia',
  school: 'Escuela',
  business: 'Negocio',
  health: 'Salud',
  vehicle: 'Vehículo',
};

const confidenceLabels: Record<CaptureProposal['confidence'], string> = {
  high: 'Coincidencia alta',
  medium: 'Coincidencia probable',
  low: 'Necesito tu confirmación',
};

function getErrorMessage(payload: ApiErrorPayload | null) {
  if (Array.isArray(payload?.message)) {
    return payload.message.join('. ');
  }

  return payload?.message ?? payload?.error ?? 'Ocurrió un error en ORION';
}

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/orion/${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('ORION respondió con información que no se pudo leer');
    }
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
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
    return 'Sin horario fijo';
  }

  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function tomorrowAtNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function reminderLabel(minutes: number) {
  if (minutes === 0) {
    return 'A la hora';
  }

  if (minutes === 1440) {
    return '1 día antes';
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'} antes`;
  }

  return `${minutes} min antes`;
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function LifeWorkspace({ currentUser }: { currentUser: CurrentUser }) {
  const router = useRouter();
  const userId = currentUser.id;
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [tasks, setTasks] = useState<LifeTask[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [view, setView] = useState<'active' | 'completed'>('active');
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [processingId, setProcessingId] = useState('');
  const [processingReminderId, setProcessingReminderId] = useState('');
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<Date>();
  const [showSpaceForm, setShowSpaceForm] = useState(false);
  const [spaceForm, setSpaceForm] = useState({
    name: '',
    description: '',
    type: 'personal',
  });
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    category: 'personal',
    priority: 'normal',
    dueAt: '',
    estimatedMinutes: '30',
    userId: '',
    recurrenceFrequency: '',
    recurrenceInterval: '1',
    recurrenceEndsAt: '',
    reminderMinutesBefore: '',
  });
  const [memberForm, setMemberForm] = useState({
    email: '',
    role: 'member',
  });
  const [savingSpace, setSavingSpace] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [captureProposal, setCaptureProposal] = useState<CaptureProposal>();
  const [captureSpaceId, setCaptureSpaceId] = useState('');
  const [interpretingCapture, setInterpretingCapture] = useState(false);
  const [savingCapture, setSavingCapture] = useState(false);
  const [captureNotice, setCaptureNotice] = useState('');
  const [captureActionTargetId, setCaptureActionTargetId] = useState('');
  const [captureActionWholeSeries, setCaptureActionWholeSeries] =
    useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning>();
  const [recentCreation, setRecentCreation] = useState<RecentCreation>();
  const [listening, setListening] = useState(false);
  const [readingTasks, setReadingTasks] = useState(false);

  const activeSpace = spaces.find((space) => space.id === selectedSpaceId);
  const currentMembership = activeSpace?.members.find(
    (member) => member.user.id === userId,
  );
  const canEdit = Boolean(
    currentMembership && currentMembership.role !== 'viewer',
  );
  const canManageMembers = Boolean(
    activeSpace?.type !== 'personal' &&
      ['owner', 'admin'].includes(currentMembership?.role ?? ''),
  );
  const writableSpaces = spaces.filter((space) =>
    space.members.some(
      (member) => member.user.id === userId && member.role !== 'viewer',
    ),
  );

  const refreshSpaces = useCallback(async () => {
    if (!userId) {
      setLoadingSpaces(false);
      return;
    }

    try {
      const nextSpaces = await apiRequest<Space[]>('space');
      setSpaces(nextSpaces);
      setSelectedSpaceId((current) =>
        current && nextSpaces.some((space) => space.id === current)
          ? current
          : (nextSpaces[0]?.id ?? ''),
      );
      setError('');
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar tus espacios',
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
        setError('');
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No se pudieron sincronizar las tareas',
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
      const nextReminders = await apiRequest<ReminderItem[]>('reminder');
      setReminders(nextReminders);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar tus recordatorios',
      );
    }
  }, [userId]);

  useEffect(() => {
    const redirectToLogin = () => {
      router.replace('/login');
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
    window.speechSynthesis?.cancel();

    return () => window.speechSynthesis?.cancel();
  }, [selectedSpaceId]);

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) =>
      view === 'active'
        ? activeStatuses.has(task.status)
        : task.status === 'completed' || task.status === 'cancelled',
    );

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
  }, [tasks, view]);

  const activeCount = tasks.filter((task) => activeStatuses.has(task.status)).length;
  const inProgressCount = tasks.filter(
    (task) => task.status === 'in_progress',
  ).length;
  const completedCount = tasks.filter(
    (task) => task.status === 'completed',
  ).length;
  const dueReminders = reminders.filter(
    (reminder) => reminder.urgency === 'due',
  );
  const upcomingReminders = reminders.filter(
    (reminder) => reminder.urgency === 'upcoming',
  );

  function rememberDuplicate(
    requestError: unknown,
    payload: TaskCreatePayload,
    source: 'capture' | 'form',
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
      setError('Escribe un nombre para el espacio');
      return;
    }

    setSavingSpace(true);
    setError('');

    try {
      const space = await apiRequest<Space>('space', {
        method: 'POST',
        body: JSON.stringify({
          name: spaceForm.name.trim(),
          description: spaceForm.description.trim() || undefined,
          type: spaceForm.type,
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        }),
      });

      setSpaces((current) => [...current, space]);
      setSelectedSpaceId(space.id);
      setSpaceForm({
        name: '',
        description: '',
        type: 'personal',
      });
      setShowSpaceForm(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo crear el espacio',
      );
    } finally {
      setSavingSpace(false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSpace || !taskForm.title.trim()) {
      setError('Selecciona un espacio y escribe la tarea');
      return;
    }

    if (taskForm.recurrenceFrequency && !taskForm.dueAt) {
      setError('Elige la primera fecha y hora para poder repetir la tarea');
      return;
    }

    if (taskForm.reminderMinutesBefore.length > 0 && !taskForm.dueAt) {
      setError('Elige fecha y hora para poder crear el recordatorio');
      return;
    }

    setSavingTask(true);
    setError('');
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
      const createdTask = await apiRequest<LifeTask>('task', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      registerCreation(createdTask, activeSpace.name);

      setTaskForm({
        title: '',
        description: '',
        category: 'personal',
        priority: 'normal',
        dueAt: '',
        estimatedMinutes: '30',
        userId: '',
        recurrenceFrequency: '',
        recurrenceInterval: '1',
        recurrenceEndsAt: '',
        reminderMinutesBefore: '',
      });
      setView('active');
      await refreshTasks(true);
      await refreshReminders();
      await refreshSpaces();
    } catch (saveError) {
      if (!rememberDuplicate(saveError, payload, 'form', activeSpace.name)) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : 'No se pudo guardar la tarea',
        );
      }
    } finally {
      setSavingTask(false);
    }
  }

  async function interpretCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!captureText.trim()) {
      setError('Escribe una tarea corta para que ORION pueda organizarla');
      return;
    }

    setInterpretingCapture(true);
    setCaptureNotice('');
    setError('');

    try {
      const proposal = await apiRequest<CaptureProposal>('capture/interpret', {
        method: 'POST',
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
            : ''),
      );
      setCaptureActionWholeSeries(
        proposal.actionProposal?.scope === 'series' ||
          proposal.actionProposal?.scope === 'today_and_tomorrow',
      );
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : 'ORION no pudo interpretar el mensaje',
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
      setError('Selecciona un espacio en el que puedas crear tareas');
      return;
    }

    if (
      captureProposal.needsTemporalConfirmation &&
      !acceptTemporalProposal
    ) {
      completeCaptureDetails();
      setError(
        'ORION necesita que revises la fecha y la hora antes de guardar.',
      );
      return;
    }

    setSavingCapture(true);
    setError('');
    setDuplicateWarning(undefined);

    const payload: TaskCreatePayload = {
      title: captureProposal.title.trim(),
      category: captureProposal.category,
      priority: 'normal',
      estimatedMinutes: 30,
      spaceId: destination.id,
      dueAt: captureProposal.dueAt ?? undefined,
      recurrenceFrequency:
        captureProposal.recurrenceFrequency ?? undefined,
      recurrenceInterval:
        captureProposal.recurrenceInterval ?? undefined,
      recurrenceEndsAt: captureProposal.recurrenceEndsAt ?? undefined,
      reminderMinutesBefore:
        captureProposal.reminderMinutesBefore ?? undefined,
    };

    try {
      const createdTask = await apiRequest<LifeTask>('task', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      registerCreation(createdTask, destination.name);
      setSelectedSpaceId(destination.id);
      setCaptureText('');
      setCaptureProposal(undefined);
      setCaptureSpaceId('');
      setCaptureNotice(`Tarea guardada en ${destination.name}`);
      setView('active');
      await refreshSpaces();

      if (destination.id === selectedSpaceId) {
        await refreshTasks(true);
      }
    } catch (captureError) {
      if (
        !rememberDuplicate(
          captureError,
          payload,
          'capture',
          destination.name,
        )
      ) {
        setError(
          captureError instanceof Error
            ? captureError.message
            : 'No se pudo crear la tarea desde la captura rápida',
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
      setError('Elige la tarea exacta antes de continuar');
      return;
    }

    if (action.intent === 'find') {
      setSelectedSpaceId(target.spaceId ?? selectedSpaceId);
      setView('active');
      setCaptureProposal(undefined);
      setCaptureActionTargetId('');
      window.setTimeout(() => {
        document.getElementById(`task-${target.id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 600);
      return;
    }

    setSavingCapture(true);
    setError('');

    try {
      if (
        action.intent === 'cancel' &&
        captureActionWholeSeries &&
        target.recurrenceId
      ) {
        await apiRequest(`task/${target.id}/recurrence/cancel`, {
          method: 'POST',
        });
        await apiRequest(`task/${target.id}/cancel`, {
          method: 'POST',
        });
      } else {
        const endpoint =
          action.intent === 'cancel'
            ? `task/${target.id}/cancel`
            : `task/${target.id}/complete`;

        await apiRequest(endpoint, {
          method: 'POST',
          body:
            action.intent === 'complete' ? JSON.stringify({}) : undefined,
        });
      }

      setSelectedSpaceId(target.spaceId ?? selectedSpaceId);
      setCaptureText('');
      setCaptureProposal(undefined);
      setCaptureSpaceId('');
      setCaptureActionTargetId('');
      setCaptureActionWholeSeries(false);
      setCaptureNotice(
        action.intent === 'complete'
          ? `Marcaste como terminada: ${target.title}`
          : captureActionWholeSeries && target.recurrenceId
            ? `Cancelaste esta tarea y sus próximas repeticiones: ${target.title}`
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
          : 'No se pudo realizar la acción sobre la tarea',
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
      recurrenceFrequency: captureProposal.recurrenceFrequency ?? '',
      recurrenceInterval: String(captureProposal.recurrenceInterval ?? 1),
      recurrenceEndsAt: captureProposal.recurrenceEndsAt
        ? toLocalDateTimeInput(captureProposal.recurrenceEndsAt).slice(0, 10)
        : '',
      reminderMinutesBefore:
        captureProposal.reminderMinutesBefore === null
          ? ''
          : String(captureProposal.reminderMinutesBefore),
    }));
    setCaptureProposal(undefined);
    setCaptureText('');
    setCaptureNotice('Completa la fecha, el aviso o la repetición');
    window.setTimeout(() => {
      document
        .getElementById('orion-life-task-form')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  function startVoiceCapture() {
    if (typeof window === 'undefined') {
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
        'Este navegador no permite dictado directo. Puedes usar el micrófono del teclado o escribir la tarea.',
      );
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'es-MX';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();

      if (transcript) {
        setCaptureText(transcript);
        setCaptureProposal(undefined);
        setCaptureNotice('Dictado listo. Revisa el texto y toca Organizar.');
        setError('');
      }
    };
    recognition.onerror = () => {
      setError(
        'No se pudo escuchar con claridad. Intenta otra vez o escribe la tarea.',
      );
    };
    recognition.onend = () => setListening(false);

    setListening(true);
    setError('');
    recognition.start();
  }

  function readMyDay() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setError('Este navegador no puede leer las tareas en voz alta.');
      return;
    }

    if (readingTasks) {
      window.speechSynthesis.cancel();
      setReadingTasks(false);
      return;
    }

    const activeTasks = tasks
      .filter((task) => activeStatuses.has(task.status))
      .sort((left, right) => {
        if (!left.dueAt) return 1;
        if (!right.dueAt) return -1;
        return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
      })
      .slice(0, 12);
    const message =
      activeTasks.length === 0
        ? `En ${activeSpace?.name ?? 'este espacio'} no tienes tareas pendientes.`
        : `En ${activeSpace?.name ?? 'este espacio'} tienes ${activeTasks.length} tareas. ${activeTasks
            .map(
              (task, index) =>
                `${index + 1}: ${task.title}. ${
                  task.dueAt ? formatDate(task.dueAt) : 'Sin horario fijo'
                }.`,
            )
            .join(' ')}`;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'es-MX';
    utterance.rate = 0.95;
    utterance.onend = () => setReadingTasks(false);
    utterance.onerror = () => setReadingTasks(false);

    window.speechSynthesis.cancel();
    setReadingTasks(true);
    window.speechSynthesis.speak(utterance);
  }

  async function createSimilarAnyway() {
    if (!duplicateWarning || duplicateWarning.code === 'DUPLICATE_TASK') {
      return;
    }

    setSavingTask(duplicateWarning.source === 'form');
    setSavingCapture(duplicateWarning.source === 'capture');
    setError('');

    try {
      const createdTask = await apiRequest<LifeTask>('task', {
        method: 'POST',
        body: JSON.stringify({
          ...duplicateWarning.payload,
          allowSimilar: true,
        }),
      });
      const destinationId = duplicateWarning.payload.spaceId;
      const source = duplicateWarning.source;

      registerCreation(createdTask, duplicateWarning.destinationName);
      setSelectedSpaceId(destinationId);
      setView('active');

      if (source === 'capture') {
        setCaptureText('');
        setCaptureProposal(undefined);
        setCaptureSpaceId('');
      } else {
        setTaskForm({
          title: '',
          description: '',
          category: 'personal',
          priority: 'normal',
          dueAt: '',
          estimatedMinutes: '30',
          userId: '',
          recurrenceFrequency: '',
          recurrenceInterval: '1',
          recurrenceEndsAt: '',
          reminderMinutesBefore: '',
        });
      }

      await refreshTasks(true);
      await refreshReminders();
      await refreshSpaces();
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : 'No se pudo crear la tarea',
      );
    } finally {
      setSavingTask(false);
      setSavingCapture(false);
    }
  }

  function openSimilarTask(task: SimilarTask) {
    setSelectedSpaceId(task.spaceId ?? selectedSpaceId);
    setView('active');
    setDuplicateWarning(undefined);
    window.setTimeout(() => {
      document.getElementById(`task-${task.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
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
    setError('');

    try {
      await apiRequest<LifeTask>(`task/${encodeURIComponent(task.id)}/note`, {
        method: 'POST',
        body: JSON.stringify({ note: note.trim() }),
      });
      setDuplicateWarning(undefined);
      setCaptureNotice('El dato se agregó a la tarea existente.');
      await refreshTasks(true);
    } catch (noteError) {
      setError(
        noteError instanceof Error
          ? noteError.message
          : 'No se pudo agregar el dato',
      );
    } finally {
      setProcessingId('');
    }
  }

  async function undoRecentCreation() {
    if (!recentCreation || recentCreation.undone) {
      return;
    }

    const task = recentCreation.task;
    setProcessingId(task.id);
    setError('');

    try {
      if (task.recurrence?.status === 'active') {
        await apiRequest<LifeTask>(
          `task/${encodeURIComponent(task.id)}/recurrence/cancel`,
          { method: 'POST', body: JSON.stringify({}) },
        );
      }

      const cancelled = await apiRequest<LifeTask>(
        `task/${encodeURIComponent(task.id)}/cancel`,
        { method: 'POST', body: JSON.stringify({}) },
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
          : 'No se pudo deshacer la tarea',
      );
    } finally {
      setProcessingId('');
    }
  }

  async function restoreRecentCreation() {
    if (!recentCreation?.undone) {
      return;
    }

    setProcessingId(recentCreation.task.id);
    setError('');

    try {
      const restored = await apiRequest<LifeTask>(
        `task/${encodeURIComponent(recentCreation.task.id)}/reopen`,
        { method: 'POST', body: JSON.stringify({}) },
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
          : 'No se pudo restaurar la tarea',
      );
    } finally {
      setProcessingId('');
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSpace || !memberForm.email.trim()) {
      return;
    }

    setSavingMember(true);
    setError('');

    try {
      const updatedSpace = await apiRequest<Space>(
        `space/${encodeURIComponent(activeSpace.id)}/member`,
        {
          method: 'POST',
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
        email: '',
        role: 'member',
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo agregar a la persona',
      );
    } finally {
      setSavingMember(false);
    }
  }

  async function runTaskAction(
    taskId: string,
    action: 'claim' | 'complete' | 'postpone' | 'reopen' | 'cancel',
    extra?: Record<string, unknown>,
  ) {
    setProcessingId(taskId);
    setError('');

    try {
      await apiRequest<LifeTask>(
        `task/${encodeURIComponent(taskId)}/${action}`,
        {
          method: 'POST',
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
          : 'No se pudo actualizar la tarea',
      );
      await refreshTasks(true);
      await refreshReminders();
    } finally {
      setProcessingId('');
    }
  }

  async function runReminderAction(
    reminderId: string,
    action: 'snooze' | 'acknowledge',
    minutes?: number,
  ) {
    setProcessingReminderId(reminderId);
    setError('');

    try {
      await apiRequest<ReminderItem>(
        `reminder/${encodeURIComponent(reminderId)}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify(
            action === 'snooze' ? { minutes } : {},
          ),
        },
      );
      await refreshReminders();
      await refreshTasks(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'No se pudo actualizar el recordatorio',
      );
      await refreshReminders();
    } finally {
      setProcessingReminderId('');
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
    setError('');

    try {
      await apiRequest<LifeTask>(
        `task/${encodeURIComponent(task.id)}/recurrence/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      await refreshTasks(true);
      await refreshReminders();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'No se pudo detener la repetición',
      );
    } finally {
      setProcessingId('');
    }
  }

  async function logout() {
    setLoggingOut(true);

    try {
      await apiRequest<null>('auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95 px-5 py-5 backdrop-blur lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
              ORION Life
            </p>
            <h1 className="mt-1 text-2xl font-bold">Mi día</h1>
            <p className="mt-1 text-sm text-slate-500">
              Una sola lista para organizar, compartir y terminar lo importante.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 text-right">
              <p className="text-xs font-semibold text-slate-200">
                {currentUser.name}
              </p>
              <p className="text-[11px] text-slate-500">
                {currentUser.email}
              </p>
            </div>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300">
              ● Sincronización cada 5 segundos
            </span>
            <span
              className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                dueReminders.length > 0
                  ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                  : 'border-slate-700 bg-slate-900 text-slate-400'
              }`}
            >
              🔔 {dueReminders.length}{' '}
              {dueReminders.length === 1
                ? 'recordatorio'
                : 'recordatorios'}
            </span>
            <button
              type="button"
              disabled={!activeSpace}
              onClick={readMyDay}
              title="Lee solo los títulos y horarios del espacio seleccionado"
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-40"
            >
              {readingTasks ? '■ Detener lectura' : '🔊 Leer mi día'}
            </button>
            <button
              type="button"
              onClick={() => setShowSpaceForm((current) => !current)}
              className="rounded-xl border border-violet-400/40 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-400/20"
            >
              + Nuevo espacio
            </button>
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => void logout()}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
            >
              {loggingOut ? 'Cerrando…' : 'Salir'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        {error ? (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <p>{error}</p>
            <button type="button" onClick={() => setError('')}>
              ×
            </button>
          </div>
        ) : null}

        {recentCreation ? (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {recentCreation.undone
                ? 'Tarea cancelada'
                : recentCreation.restored
                  ? 'Tarea restaurada'
                  : 'Tarea creada'}
              :{' '}
              <strong>{recentCreation.task.title}</strong> en{' '}
              {recentCreation.destinationName}.
              {recentCreation.undone && recentCreation.task.recurrenceId
                ? ' La serie repetitiva quedó detenida para evitar nuevas copias.'
                : recentCreation.restored &&
                    recentCreation.task.recurrence?.status === 'cancelled'
                  ? ' La tarea volvió; la serie repetitiva permanece detenida.'
                : ''}
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
                {recentCreation.undone ? 'Restaurar tarea' : 'Deshacer'}
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
              ORION evitó una tarea repetida
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
                    {formatDate(task.dueAt)} ·{' '}
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
              {duplicateWarning.code === 'SIMILAR_TASK_EXISTS' ? (
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
          <section className="mb-6 space-y-3">
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
                      {reminder.task.space?.name ?? 'ORION Life'} ·{' '}
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
                        void runTaskAction(reminder.task.id, 'complete')
                      }
                      className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                    >
                      Ya lo hice
                    </button>
                    <button
                      type="button"
                      disabled={processingReminderId === reminder.id}
                      onClick={() =>
                        void runReminderAction(reminder.id, 'snooze', 15)
                      }
                      className="rounded-xl border border-amber-400/40 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:opacity-50"
                    >
                      +15 min
                    </button>
                    <button
                      type="button"
                      disabled={processingReminderId === reminder.id}
                      onClick={() =>
                        void runReminderAction(reminder.id, 'snooze', 60)
                      }
                      className="rounded-xl border border-amber-400/40 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:opacity-50"
                    >
                      +1 hora
                    </button>
                    <button
                      type="button"
                      disabled={processingReminderId === reminder.id}
                      onClick={() =>
                        void runReminderAction(reminder.id, 'acknowledge')
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
                  <option value="personal">Personal</option>
                  <option value="family">Familia</option>
                  <option value="business">Negocio</option>
                  <option value="school">Escuela</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={savingSpace}
                className="h-12 rounded-xl bg-violet-400 px-6 font-bold text-slate-950 hover:bg-violet-300 disabled:bg-slate-700"
              >
                {savingSpace ? 'Creando…' : 'Crear espacio'}
              </button>
            </div>
          </form>
        ) : null}

        <section className="mb-6 overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/10 via-slate-900 to-violet-400/10 p-5 shadow-xl shadow-cyan-950/10">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                Captura rápida universal
              </p>
              <h2 className="mt-2 text-xl font-bold text-white">
                Dile a ORION
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Escribe algo corto. ORION propondrá si pertenece a tu vida
                personal, familia, escuela, negocio o un espacio particular.
              </p>
            </div>

            <div className="flex gap-2 text-xs">
              <button
                type="button"
                disabled={listening || interpretingCapture || savingCapture}
                onClick={startVoiceCapture}
                title="El micrófono se activa solo durante este dictado"
                className="rounded-xl border border-cyan-400/30 bg-slate-950/60 px-3 py-2 text-cyan-200 hover:bg-cyan-400/10 disabled:text-slate-500"
              >
                {listening ? '🎤 Escuchando…' : '🎤 Dictar tarea'}
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

          <form
            onSubmit={(event) => void interpretCapture(event)}
            className="mt-5 flex flex-col gap-3 lg:flex-row"
          >
            <input
              value={captureText}
              maxLength={500}
              disabled={interpretingCapture || savingCapture}
              onChange={(event) => {
                setCaptureText(event.target.value);
                setCaptureProposal(undefined);
                setCaptureNotice('');
                setCaptureActionTargetId('');
                setCaptureActionWholeSeries(false);
              }}
              placeholder="Ejemplo: comprar leche para la casa"
              className="h-14 min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 text-base outline-none focus:border-cyan-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={
                interpretingCapture ||
                savingCapture ||
                !captureText.trim() ||
                writableSpaces.length === 0
              }
              className="h-14 rounded-2xl bg-cyan-400 px-6 font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700 disabled:text-slate-500"
            >
              {interpretingCapture ? 'Organizando…' : 'Organizar'}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              'Comprar leche para la casa',
              'Pedir refrescos al proveedor',
              'Hablar con el padre de familia de Juan',
              'Cancelar la tarea de hoy de apagar el servidor',
            ].map((example) => (
              <button
                key={example}
                type="button"
                disabled={interpretingCapture || savingCapture}
                onClick={() => {
                  setCaptureText(example);
                  setCaptureProposal(undefined);
                  setCaptureNotice('');
                }}
                className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
              >
                {example}
              </button>
            ))}
          </div>

          {captureNotice ? (
            <p className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              ✓ {captureNotice}
            </p>
          ) : null}

          {captureProposal ? (
            <div className="mt-5 rounded-3xl border border-violet-400/30 bg-slate-950/70 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
                    {captureProposal.actionProposal
                      ? 'Orden reconocida por ORION'
                      : 'Propuesta de ORION'}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {captureProposal.actionProposal
                      ? 'Confirmación humana requerida'
                      : confidenceLabels[captureProposal.confidence]}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    captureProposal.actionProposal
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                      : captureProposal.needsSpaceConfirmation
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                      : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                  }`}
                >
                  {captureProposal.actionProposal
                    ? 'No crea otra tarea'
                    : captureProposal.needsSpaceConfirmation
                    ? 'Confirma el destino'
                    : 'Destino reconocido'}
                </span>
              </div>

              {captureProposal.actionProposal ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">
                      {captureProposal.actionProposal.intent === 'cancel'
                        ? 'Cancelar una tarea existente'
                        : captureProposal.actionProposal.intent === 'complete'
                          ? 'Terminar una tarea existente'
                          : 'Buscar una tarea existente'}
                    </p>
                    <p className="mt-2 text-sm text-amber-50">
                      {captureProposal.actionProposal.message}
                    </p>
                    <p className="mt-2 text-xs text-amber-100/70">
                      ORION no creará una tarea nueva con esta orden.
                    </p>
                  </div>

                  {captureProposal.actionProposal.matches.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        ¿Te refieres a esta tarea?
                      </p>
                      {captureProposal.actionProposal.matches.map((match) => (
                        <label
                          key={match.id}
                          className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${
                            captureActionTargetId === match.id
                              ? 'border-cyan-400/60 bg-cyan-400/10'
                              : 'border-slate-700 bg-slate-900/70 hover:border-slate-600'
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
                                  'series' ||
                                  captureProposal.actionProposal?.scope ===
                                    'today_and_tomorrow',
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
                                : 'Sin horario fijo'}{' '}
                              · {match.space?.name ?? 'Espacio privado'}
                              {match.recurrenceId ? ' · Se repite' : ''}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}

                  {captureProposal.actionProposal.intent === 'cancel' &&
                  captureProposal.actionProposal.matches.some(
                    (match) =>
                      match.id === captureActionTargetId &&
                      Boolean(match.recurrenceId),
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
                              ? 'border-cyan-400 bg-cyan-400/10 text-cyan-100'
                              : 'border-slate-700 text-slate-400'
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
                              ? 'border-red-400 bg-red-400/10 text-red-100'
                              : 'border-slate-700 text-slate-400'
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

                  <div className="flex flex-wrap gap-2">
                    {captureProposal.actionProposal.matches.length > 0 ? (
                      <button
                        type="button"
                        disabled={savingCapture || !captureActionTargetId}
                        onClick={() => void confirmCaptureAction()}
                        className={`rounded-xl px-5 py-2.5 text-sm font-bold disabled:bg-slate-700 disabled:text-slate-500 ${
                          captureProposal.actionProposal.intent === 'cancel'
                            ? 'bg-red-400 text-slate-950 hover:bg-red-300'
                            : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                        }`}
                      >
                        {savingCapture
                          ? 'Procesando…'
                          : captureProposal.actionProposal.intent === 'cancel'
                            ? 'Confirmar cancelación'
                            : captureProposal.actionProposal.intent ===
                                'complete'
                              ? 'Confirmar como terminada'
                              : 'Abrir tarea'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={savingCapture}
                      onClick={() => {
                        setCaptureProposal(undefined);
                        setCaptureActionTargetId('');
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
                    onChange={(event) => setCaptureSpaceId(event.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm outline-none focus:border-violet-400"
                  >
                    {writableSpaces.map((space) => (
                      <option key={space.id} value={space.id}>
                        {space.name} ·{' '}
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
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {captureProposal.temporalSummary ? (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                    captureProposal.needsTemporalConfirmation
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
                      : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">
                    Fecha, aviso y repetición entendidos
                  </p>
                  <p className="mt-1">{captureProposal.temporalSummary}</p>
                </div>
              ) : null}

              {captureProposal.privacyWarning ? (
                <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  ⚠ {captureProposal.privacyWarning}
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
                  disabled={savingCapture || !captureProposal.title.trim()}
                  onClick={() =>
                    void confirmCapture(captureProposal.canUseTemporalProposal)
                  }
                  className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:bg-slate-700 disabled:text-slate-500"
                >
                  {savingCapture
                    ? 'Guardando…'
                    : captureProposal.canUseTemporalProposal
                      ? 'Confirmar horario y crear'
                      : captureProposal.needsTemporalConfirmation
                      ? 'Revisar hora propuesta'
                      : 'Crear tarea'}
                </button>
                <button
                  type="button"
                  disabled={savingCapture || !captureProposal.title.trim()}
                  onClick={completeCaptureDetails}
                  className="rounded-xl border border-cyan-400/30 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-50"
                >
                  {captureProposal.canUseTemporalProposal
                    ? 'Cambiar fecha u hora'
                    : 'Agregar fecha o aviso'}
                </button>
                <button
                  type="button"
                  disabled={savingCapture}
                  onClick={() => {
                    setCaptureProposal(undefined);
                    setCaptureSpaceId('');
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
        </section>

        {loadingSpaces ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            Cargando ORION Life…
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
            <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
              {spaces.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => {
                    window.speechSynthesis?.cancel();
                    setReadingTasks(false);
                    setSelectedSpaceId(space.id);
                  }}
                  className={`min-w-max rounded-2xl border px-4 py-3 text-left transition ${
                    selectedSpaceId === space.id
                      ? 'border-violet-400/60 bg-violet-400/15'
                      : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {spaceTypeLabels[space.type] ?? space.type}
                  </span>
                  <span className="mt-1 block font-semibold">{space.name}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['Pendientes', activeCount, 'text-cyan-300'],
                    ['En proceso', inProgressCount, 'text-amber-300'],
                    ['Terminadas', completedCount, 'text-emerald-300'],
                  ].map(([label, value, color]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                    >
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">
                    <button
                      type="button"
                      onClick={() => setView('active')}
                      className={`rounded-lg px-4 py-2 text-sm font-medium ${
                        view === 'active'
                          ? 'bg-cyan-400 text-slate-950'
                          : 'text-slate-400'
                      }`}
                    >
                      Por hacer
                    </button>
                    <button
                      type="button"
                      onClick={() => setView('completed')}
                      className={`rounded-lg px-4 py-2 text-sm font-medium ${
                        view === 'completed'
                          ? 'bg-emerald-400 text-slate-950'
                          : 'text-slate-400'
                      }`}
                    >
                      Terminadas
                    </button>
                  </div>

                  <p className="text-xs text-slate-600">
                    {lastSync
                      ? `Actualizado ${lastSync.toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}`
                      : ''}
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
                        {view === 'active'
                          ? 'No hay tareas pendientes'
                          : 'Todavía no hay tareas terminadas'}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {view === 'active'
                          ? 'Agrega una tarea desde el panel derecho.'
                          : 'Las actividades completadas aparecerán aquí.'}
                      </p>
                    </div>
                  ) : (
                    visibleTasks.map((task) => {
                      const overdue =
                        Boolean(task.dueAt) &&
                        new Date(task.dueAt as string).getTime() <
                          (lastSync?.getTime() ?? 0) &&
                        task.status !== 'completed';
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
                              {categoryIcons[task.category ?? 'personal'] ?? '✓'}
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
                                    task.status === 'completed'
                                      ? 'bg-emerald-500/10 text-emerald-300'
                                      : task.status === 'cancelled'
                                        ? 'bg-red-500/10 text-red-300'
                                      : task.status === 'in_progress'
                                        ? 'bg-amber-500/10 text-amber-300'
                                        : 'bg-cyan-500/10 text-cyan-300'
                                  }`}
                                >
                                  {statusLabels[task.status] ?? task.status}
                                </span>
                              </div>

                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                                <span className={overdue ? 'text-red-300' : 'text-slate-500'}>
                                  {overdue ? 'Vencida · ' : ''}
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
                                      task.reminder.status === 'scheduled'
                                        ? 'text-amber-300'
                                        : 'text-slate-600'
                                    }
                                  >
                                    🔔{' '}
                                    {reminderLabel(
                                      task.reminder.leadMinutes,
                                    )}
                                  </span>
                                ) : null}
                                {task.recurrence ? (
                                  <span
                                    className={
                                      task.recurrence.status === 'active'
                                        ? 'text-violet-300'
                                        : 'text-slate-600'
                                    }
                                  >
                                    ↻{' '}
                                    {recurrenceLabels[
                                      task.recurrence.frequency
                                    ] ?? 'Recurrente'}
                                    {task.recurrence.status === 'cancelled'
                                      ? ' · detenida'
                                      : task.recurrence.status === 'finished'
                                        ? ' · finalizada'
                                      : ''}
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
                                  <span className="text-slate-500">Sin responsable</span>
                                )}
                              </div>

                              {lastActivity ? (
                                <p className="mt-3 text-xs text-slate-600">
                                  {lastActivity.actor?.name ?? 'ORION'}{' '}
                                  {actionLabels[lastActivity.action] ?? lastActivity.action}
                                  {lastActivity.note ? `: ${lastActivity.note}` : ''}
                                </p>
                              ) : null}

                              <div className="mt-4 flex flex-wrap gap-2">
                                {canTake ? (
                                  <button
                                    type="button"
                                    disabled={processingId === task.id}
                                    onClick={() =>
                                      void runTaskAction(task.id, 'claim')
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
                                      void runTaskAction(task.id, 'complete')
                                    }
                                    className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                                  >
                                    Marcar terminada
                                  </button>
                                ) : null}

                                {canEdit && activeStatuses.has(task.status) ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={processingId === task.id}
                                      onClick={() =>
                                        void runTaskAction(task.id, 'postpone', {
                                          minutes: 30,
                                        })
                                      }
                                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                                    >
                                      +30 min
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingId === task.id}
                                      onClick={() =>
                                        void runTaskAction(task.id, 'postpone', {
                                          minutes: 60,
                                        })
                                      }
                                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                                    >
                                      +1 hora
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingId === task.id}
                                      onClick={() =>
                                        void runTaskAction(task.id, 'postpone', {
                                          until: tomorrowAtNine(),
                                        })
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
                                          ? 'esta ocasión'
                                          : 'esta tarea';
                                        if (
                                          window.confirm(
                                            `¿Cancelar ${label}? Podrás restaurarla después.`,
                                          )
                                        ) {
                                          void runTaskAction(task.id, 'cancel');
                                        }
                                      }}
                                      className="rounded-xl border border-red-400/30 px-3 py-2 text-xs text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                                    >
                                      {task.recurrence
                                        ? 'Cancelar esta vez'
                                        : 'Cancelar'}
                                    </button>
                                  </>
                                ) : null}

                                {canEdit &&
                                (task.status === 'completed' ||
                                  task.status === 'cancelled') ? (
                                  <button
                                    type="button"
                                    disabled={processingId === task.id}
                                    onClick={() =>
                                      void runTaskAction(task.id, 'reopen')
                                    }
                                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                                  >
                                    {task.status === 'cancelled'
                                      ? 'Restaurar'
                                      : 'Reabrir'}
                                  </button>
                                ) : null}

                                {canEdit &&
                                task.recurrence?.status === 'active' ? (
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
                                  : '1',
                                recurrenceEndsAt: event.target.value
                                  ? current.recurrenceEndsAt
                                  : '',
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
                              .filter((member) => member.role !== 'viewer')
                              .map((member) => (
                                <option key={member.id} value={member.user.id}>
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
                        {savingTask ? 'Guardando…' : 'Agregar a Mi día'}
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
                            🔔 {formatDate(reminder.remindAt)} ·{' '}
                            {reminder.task.space?.name ?? 'ORION Life'}
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
                          {activeSpace.type === 'personal'
                            ? 'Privado'
                            : 'Compartido'}
                        </p>
                        <h2 className="mt-1 font-semibold">{activeSpace.name}</h2>
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
                          Agregar una cuenta existente de ORION
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
    </main>
  );
}

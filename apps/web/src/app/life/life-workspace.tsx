'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

type UserSummary = {
  id: string;
  name: string;
  email?: string;
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
  user: UserSummary | null;
  createdBy: UserSummary | null;
  claimedBy: UserSummary | null;
  completedBy: UserSummary | null;
  activities: TaskActivity[];
};

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
};

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
  postponed: 'pospuso la tarea',
  reopened: 'reabrió la tarea',
};

const categoryIcons: Record<string, string> = {
  personal: '✓',
  purchase: '🛒',
  payment: '🧾',
  family: '⌂',
  school: '✎',
  business: '▣',
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
    throw new Error(getErrorMessage(payload as ApiErrorPayload | null));
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

export function LifeWorkspace({
  companyId,
  userId,
}: {
  companyId: string;
  userId: string;
}) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [tasks, setTasks] = useState<LifeTask[]>([]);
  const [view, setView] = useState<'active' | 'completed'>('active');
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [processingId, setProcessingId] = useState('');
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
  });
  const [memberForm, setMemberForm] = useState({
    email: '',
    role: 'member',
  });
  const [savingSpace, setSavingSpace] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingMember, setSavingMember] = useState(false);

  const activeSpace = spaces.find((space) => space.id === selectedSpaceId);
  const currentMembership = activeSpace?.members.find(
    (member) => member.user.id === userId,
  );
  const canEdit = Boolean(
    currentMembership && currentMembership.role !== 'viewer',
  );
  const canManageMembers = ['owner', 'admin'].includes(
    currentMembership?.role ?? '',
  );

  const refreshSpaces = useCallback(async () => {
    if (!userId) {
      setLoadingSpaces(false);
      return;
    }

    try {
      const nextSpaces = await apiRequest<Space[]>(
        `space/user/${encodeURIComponent(userId)}`,
      );
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
          `task/space/${encodeURIComponent(selectedSpaceId)}?actorUserId=${encodeURIComponent(userId)}`,
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

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) =>
      view === 'active'
        ? activeStatuses.has(task.status)
        : task.status === 'completed',
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
          companyId,
          ownerUserId: userId,
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

    setSavingTask(true);
    setError('');

    try {
      await apiRequest<LifeTask>('task', {
        method: 'POST',
        body: JSON.stringify({
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
          companyId: activeSpace.companyId,
          userId: taskForm.userId || undefined,
          spaceId: activeSpace.id,
          createdById: userId,
        }),
      });

      setTaskForm({
        title: '',
        description: '',
        category: 'personal',
        priority: 'normal',
        dueAt: '',
        estimatedMinutes: '30',
        userId: '',
      });
      setView('active');
      await refreshTasks(true);
      await refreshSpaces();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo guardar la tarea',
      );
    } finally {
      setSavingTask(false);
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
            actorUserId: userId,
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
    action: 'claim' | 'complete' | 'postpone' | 'reopen',
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
            actorUserId: userId,
            ...extra,
          }),
        },
      );
      await refreshTasks(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'No se pudo actualizar la tarea',
      );
      await refreshTasks(true);
    } finally {
      setProcessingId('');
    }
  }

  if (!companyId || !userId) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
        <section className="mx-auto max-w-2xl rounded-3xl border border-amber-500/30 bg-amber-500/10 p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
            ORION Life
          </p>
          <h1 className="mt-3 text-2xl font-bold">Falta conectar tu identidad</h1>
          <p className="mt-3 text-sm leading-6 text-amber-100/80">
            Configura ORION_COMPANY_ID y ORION_AUTHORIZED_USER_ID en
            .env.local para separar correctamente tus espacios y tareas.
          </p>
        </section>
      </main>
    );
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
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300">
              ● Sincronización cada 5 segundos
            </span>
            <button
              type="button"
              onClick={() => setShowSpaceForm((current) => !current)}
              className="rounded-xl border border-violet-400/40 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-400/20"
            >
              + Nuevo espacio
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
                  onClick={() => setSelectedSpaceId(space.id)}
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
                                  </>
                                ) : null}

                                {canEdit && task.status === 'completed' ? (
                                  <button
                                    type="button"
                                    disabled={processingId === task.id}
                                    onClick={() =>
                                      void runTaskAction(task.id, 'reopen')
                                    }
                                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                                  >
                                    Reabrir
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

                {activeSpace ? (
                  <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
                          Compartido
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

import { cookies } from 'next/headers';
import { requireBusinessSession } from '../../lib/yalika-business-session';
type HealthResponse = {
  name: string;
  status: string;
  version: string;
};

type Incident = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  severity: string;
  status: string;
  occurredAt: string;
  resolvedAt: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
};

type OperationsToday = {
  date: string;
  summary: {
    total: number;
    urgent: number;
    high: number;
    normal: number;
    completed: number;
  };
  urgent: Task[];
  high: Task[];
  normal: Task[];
  completed: Task[];
};

async function getApi<T>(path: string): Promise<T | null> {
  const apiUrl =
    process.env.YALIKA_API_URL ?? 'http://localhost:3000';

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      cache: 'no-store',
      headers: { cookie: (await cookies()).toString() },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getIncidentStatus(status: string) {
  if (status === 'resolved') {
    return {
      label: 'Resuelto',
      className:
        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    };
  }

  if (status === 'in_progress') {
    return {
      label: 'En proceso',
      className:
        'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
  }

  return {
    label: 'Abierto',
    className:
      'bg-red-500/10 text-red-400 border-red-500/20',
  };
}

export default async function Home() {
  await requireBusinessSession();
  const [health, incidents, operations] =
    await Promise.all([
      getApi<HealthResponse>('/health'),
      getApi<Incident[]>('/incident'),
      getApi<OperationsToday>('/operations/today'),
    ]);

  const incidentList = incidents ?? [];

  const activeIncidents = incidentList.filter(
    (incident) =>
      incident.status === 'open' ||
      incident.status === 'in_progress',
  ).length;

  const resolvedIncidents = incidentList.filter(
    (incident) => incident.status === 'resolved',
  ).length;

  const recentIncidents = incidentList.slice(0, 5);

  const apiOnline = health?.status === 'online';

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-10 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 text-sm font-semibold tracking-[0.3em] text-cyan-400">
              Yalika
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              Centro de Operaciones
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Estado general de la operación en tiempo real.
            </p>
          </div>

          <div
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm ${
              apiOnline
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                apiOnline
                  ? 'bg-emerald-400'
                  : 'bg-red-400'
              }`}
            />

            {apiOnline
              ? `Yalika API online · ${health?.version ?? ''}`
              : 'Yalika API sin conexión'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">
              Incidentes activos
            </p>

            <p className="mt-3 text-4xl font-semibold">
              {activeIncidents}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Abiertos o en proceso
            </p>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">
              Incidentes resueltos
            </p>

            <p className="mt-3 text-4xl font-semibold">
              {resolvedIncidents}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Procesos cerrados correctamente
            </p>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">
              Operaciones de hoy
            </p>

            <p className="mt-3 text-4xl font-semibold">
              {operations?.summary.total ?? 0}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Tareas registradas
            </p>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">
              Completadas
            </p>

            <p className="mt-3 text-4xl font-semibold">
              {operations?.summary.completed ?? 0}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Tareas terminadas hoy
            </p>
          </article>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-6 py-5">
              <h2 className="font-semibold">
                Incidentes recientes
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Últimos eventos registrados por Yalika.
              </p>
            </div>

            <div>
              {recentIncidents.length === 0 ? (
                <div className="px-6 py-10 text-sm text-slate-500">
                  No hay incidentes registrados.
                </div>
              ) : (
                recentIncidents.map((incident) => {
                  const status = getIncidentStatus(
                    incident.status,
                  );

                  return (
                    <div
                      key={incident.id}
                      className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-5 last:border-b-0"
                    >
                      <div>
                        <p className="font-medium">
                          {incident.title}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {incident.category ??
                            'Sin categoría'}{' '}
                          · {incident.severity}
                        </p>
                      </div>

                      <span
                        className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-6 py-5">
              <h2 className="font-semibold">
                Prioridades de hoy
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Trabajo pendiente según prioridad.
              </p>
            </div>

            <div className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  Urgentes
                </span>

                <span className="text-xl font-semibold">
                  {operations?.summary.urgent ?? 0}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  Prioridad alta
                </span>

                <span className="text-xl font-semibold">
                  {operations?.summary.high ?? 0}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  Prioridad normal
                </span>

                <span className="text-xl font-semibold">
                  {operations?.summary.normal ?? 0}
                </span>
              </div>

              <div className="border-t border-slate-800 pt-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    Completadas
                  </span>

                  <span className="text-xl font-semibold text-emerald-400">
                    {operations?.summary.completed ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
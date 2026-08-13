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

async function getIncidents(): Promise<Incident[]> {
  const apiUrl =
    process.env.ORION_API_URL ?? 'http://localhost:3000';

  try {
    const response = await fetch(`${apiUrl}/incident`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as Incident[];
  } catch {
    return [];
  }
}

function getStatus(status: string) {
  if (status === 'resolved') {
    return {
      label: 'Resuelto',
      className:
        'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    };
  }

  if (status === 'in_progress') {
    return {
      label: 'En proceso',
      className:
        'border-amber-500/20 bg-amber-500/10 text-amber-400',
    };
  }

  return {
    label: 'Abierto',
    className:
      'border-red-500/20 bg-red-500/10 text-red-400',
  };
}

function getSeverity(severity: string) {
  if (severity === 'high') {
    return 'Alta';
  }

  if (severity === 'medium') {
    return 'Media';
  }

  if (severity === 'low') {
    return 'Baja';
  }

  return severity;
}

export default async function IncidentsPage() {
  const incidents = await getIncidents();

  const open = incidents.filter(
    (incident) => incident.status === 'open',
  ).length;

  const inProgress = incidents.filter(
    (incident) => incident.status === 'in_progress',
  ).length;

  const resolved = incidents.filter(
    (incident) => incident.status === 'resolved',
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-8">
      <header className="mb-8">
        <p className="text-sm font-medium text-cyan-400">
          ORION / Incidentes
        </p>

        <h1 className="mt-2 text-3xl font-semibold">
          Incidentes
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Seguimiento de problemas detectados en la operación.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Total
          </p>

          <p className="mt-2 text-3xl font-semibold">
            {incidents.length}
          </p>
        </article>

        <article className="rounded-2xl border border-red-500/20 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Abiertos
          </p>

          <p className="mt-2 text-3xl font-semibold text-red-400">
            {open}
          </p>
        </article>

        <article className="rounded-2xl border border-amber-500/20 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            En proceso
          </p>

          <p className="mt-2 text-3xl font-semibold text-amber-400">
            {inProgress}
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-500/20 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Resueltos
          </p>

          <p className="mt-2 text-3xl font-semibold text-emerald-400">
            {resolved}
          </p>
        </article>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-6 py-5">
          <h2 className="font-semibold">
            Registro de incidentes
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Información obtenida directamente de ORION API.
          </p>
        </div>

        {incidents.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No se encontraron incidentes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4">
                    Incidente
                  </th>

                  <th className="px-6 py-4">
                    Categoría
                  </th>

                  <th className="px-6 py-4">
                    Severidad
                  </th>

                  <th className="px-6 py-4">
                    Estado
                  </th>

                  <th className="px-6 py-4">
                    Fecha
                  </th>
                </tr>
              </thead>

              <tbody>
                {incidents.map((incident) => {
                  const status = getStatus(
                    incident.status,
                  );

                  const date = new Intl.DateTimeFormat(
                    'es-MX',
                    {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    },
                  ).format(
                    new Date(incident.occurredAt),
                  );

                  return (
                    <tr
                      key={incident.id}
                      className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/30"
                    >
                      <td className="px-6 py-5">
                        <p className="font-medium text-slate-100">
                          {incident.title}
                        </p>

                        <p className="mt-1 max-w-md text-sm text-slate-500">
                          {incident.description ??
                            'Sin descripción'}
                        </p>
                      </td>

                      <td className="px-6 py-5 text-sm text-slate-300">
                        {incident.category ??
                          'Sin categoría'}
                      </td>

                      <td className="px-6 py-5 text-sm text-slate-300">
                        {getSeverity(
                          incident.severity,
                        )}
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-sm text-slate-400">
                        {date}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
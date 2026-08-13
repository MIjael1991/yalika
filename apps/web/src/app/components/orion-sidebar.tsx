import Link from 'next/link';

const menu = [
  {
    name: 'Dashboard',
    href: '/',
  },
  {
    name: 'Operaciones',
    href: '/operations',
  },
  {
    name: 'Incidentes',
    href: '/incidents',
  },
  {
    name: 'Experiencias',
    href: '/experiences',
  },
  {
    name: 'Empresas',
    href: '/companies',
  },
  {
    name: 'Usuarios',
    href: '/users',
  },
  {
    name: 'Sitios Web',
    href: '/sites',
  },
];

export function OrionSidebar() {
  return (
    <aside className="min-h-screen w-64 border-r border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 px-6 py-6">
        <p className="text-xs font-semibold tracking-[0.35em] text-cyan-400">
          ORION
        </p>

        <h2 className="mt-2 text-lg font-semibold text-white">
          Intelligence Platform
        </h2>
      </div>

      <nav className="p-4">
        <p className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-500">
          Navegación
        </p>

        <div className="space-y-1">
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-xl px-3 py-3 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
            >
              {item.name}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mx-4 mt-8 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs text-slate-500">
          Estado del sistema
        </p>

        <div className="mt-2 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />

          <span className="text-sm text-slate-300">
            ORION activo
          </span>
        </div>
      </div>
    </aside>
  );
}
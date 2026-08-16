'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const menu = [
  {
    label: 'Ventas',
    items: [
      {
        name: 'Punto de venta',
        href: '/pos',
        badge: 'POS',
      },
    ],
  },
  {
    label: 'Operación',
    items: [
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
    ],
  },
  {
    label: 'Administración',
    items: [
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
    ],
  },
];

export function OrionSidebar() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="font-semibold tracking-[0.28em] text-cyan-400">
          ORION
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="rounded-lg px-3 py-2 text-slate-300">
            Inicio
          </Link>
          <Link href="/pos" className="rounded-lg bg-cyan-400 px-3 py-2 font-semibold text-slate-950">
            Venta
          </Link>
        </nav>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-800 bg-slate-950 lg:flex">
        <div className="border-b border-slate-800 px-6 py-6">
          <p className="text-xs font-semibold tracking-[0.35em] text-cyan-400">
            ORION
          </p>

          <h2 className="mt-2 text-lg font-semibold text-white">
            Business Platform
          </h2>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          {menu.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {group.label}
              </p>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const active =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between rounded-xl px-3 py-3 text-sm transition ${
                        active
                          ? 'bg-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-950/20'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <span>{item.name}</span>

                      {'badge' in item && item.badge ? (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            active
                              ? 'bg-slate-950/15 text-slate-950'
                              : 'bg-cyan-400/10 text-cyan-400'
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
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
    </>
  );
}

'use client';

import Link from 'next/link';

import {
  ReservationPolicyForm,
  type ReservationPolicy,
} from '../apartados/reservation-policy-form';
import type { TeamMember } from '../equipo/team-workspace';

const PERMISSION_LABELS: Record<string, string> = {
  returns: 'Devoluciones y cambios',
  refunds: 'Reembolsos',
  discounts: 'Descuentos a mano',
  reports: 'Reportes',
  catalog: 'Agregar productos',
};

function labelsOf(member: TeamMember) {
  const fixed = (member.permissions ?? [])
    .filter((permission) => PERMISSION_LABELS[permission])
    .map((permission) => PERMISSION_LABELS[permission]);
  const items = (member.permissions ?? []).filter((permission) => permission.startsWith('returns_item:')).length;
  return items ? [...fixed, `${items} artículo${items === 1 ? '' : 's'} autorizado${items === 1 ? '' : 's'}`] : fixed;
}

const card = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-5';
const linkButton =
  'inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 hover:border-cyan-400/50';

export function AjustesWorkspace({
  companyId,
  initialPolicy,
  cashiers,
  activePromotions,
  promoSiteReady,
  teamError,
}: {
  companyId: string;
  initialPolicy: ReservationPolicy;
  cashiers: TeamMember[];
  activePromotions: number;
  promoSiteReady: boolean;
  teamError: boolean;
}) {
  const promoQrOn = activePromotions > 0 && promoSiteReady;

  return (
    <main className="min-h-screen bg-[#07101f] text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/70 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
              Yalika / Punto de venta
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Ajustes</h1>
            <p className="mt-1 text-sm text-slate-400">
              Todo lo que el administrador decide en un solo lugar.
            </p>
          </div>
          <Link href="/pos" className={linkButton}>
            ← Regresar a Punto de venta
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1100px] gap-5 p-4 md:p-6 lg:grid-cols-2">
        <section aria-labelledby="ajustes-pedidos" className="lg:row-span-2">
          <p id="ajustes-pedidos" className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            1 · Pedidos en línea (carrito)
          </p>
          <ReservationPolicyForm companyId={companyId} initialPolicy={initialPolicy} />
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Cuando están activos, tu página deja que el cliente aparte sus productos y los pase a recoger. Cada
            pedido aparece en Apartados con el nombre y el teléfono de la persona y su fecha límite de recogida.
          </p>
          <Link href="/pos/apartados" className={`${linkButton} mt-3`}>
            Ver apartados
          </Link>
        </section>

        <section aria-labelledby="ajustes-cajeros" className={card}>
          <p id="ajustes-cajeros" className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            2 · Cajeros y permisos
          </p>
          {teamError ? (
            <p className="mt-3 text-sm text-amber-200">No se pudo cargar el equipo ahora.</p>
          ) : cashiers.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Todavía no tienes cajeros.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-800">
              {cashiers.map((member) => {
                const labels = labelsOf(member);
                return (
                  <li key={member.id} className="py-3">
                    <p className="font-medium">
                      {member.name}
                      {member.status !== 'active' ? (
                        <span className="ml-2 text-xs text-slate-500">(desactivado)</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {labels.length ? labels.join(' · ') : 'Solo vende y cobra'}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Tú decides, persona por persona, si puede hacer devoluciones, reembolsos, descuentos, ver reportes,
            agregar productos nuevos o devolver solo un artículo cuando no estás.
          </p>
          <Link href="/pos/equipo" className={`${linkButton} mt-3`}>
            Administrar permisos
          </Link>
        </section>

        <section aria-labelledby="ajustes-ticket" className={card}>
          <p id="ajustes-ticket" className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            3 · Ticket
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>✓ Número de venta, fecha, hora y quién atendió</li>
            <li>✓ QR del club de beneficios cuando hay programa de visitas</li>
            <li className={promoQrOn ? '' : 'text-slate-400'}>
              {promoQrOn ? '✓' : '○'} QR de promociones
              {promoQrOn
                ? ` (hay ${activePromotions} vigente${activePromotions === 1 ? '' : 's'})`
                : ' — aparece cuando tengas promociones vigentes y tu página publicada'}
            </li>
          </ul>
          <Link href="/pos/ventas" className={`${linkButton} mt-4`}>
            Ver ventas y reportes
          </Link>
        </section>

        <section aria-labelledby="ajustes-pagina" className={`${card} lg:col-span-2`}>
          <p id="ajustes-pagina" className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            4 · Mi página
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            En tu página, cada producto muestra «Quedan 4» cuando le quedan 5 o menos y «Agotado» cuando ya no hay.
            Lo apartado se resta solo y lo que se vende en la caja se descuenta; el número se actualiza cada vez que alguien abre la página.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/sites/studio" className={linkButton}>
              Diseñar mi página
            </Link>
            <Link href="/pos/inventario" className={linkButton}>
              Inventario y alertas
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

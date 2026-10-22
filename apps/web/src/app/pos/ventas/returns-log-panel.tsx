'use client';

import { useMemo, useState } from 'react';

import type { ReturnSummary } from './sales-history-workspace';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const REASONS: Record<string, string> = {
  customer_changed_mind: 'Cambió de opinión',
  wrong_item: 'Producto equivocado',
  wrong_size_or_color: 'Talla o color incorrecto',
  defective: 'Defectuoso',
  damaged: 'Dañado',
  incomplete: 'Incompleto',
  quality_issue: 'Problema de calidad',
  order_error: 'Error en la venta',
  warranty: 'Garantía',
  other: 'Otro motivo',
};

const STATUS: Record<string, { label: string; tone: string }> = {
  completed: { label: 'Completada', tone: 'bg-emerald-400/15 text-emerald-200' },
  draft: { label: 'Pendiente', tone: 'bg-amber-400/15 text-amber-200' },
  cancelled: { label: 'Cancelada', tone: 'bg-slate-700 text-slate-300' },
};

const FILTERS = [
  ['all', 'Todas'],
  ['completed', 'Completadas'],
  ['draft', 'Pendientes'],
  ['cancelled', 'Canceladas'],
] as const;

const dayKey = (value: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeZone: 'America/Mexico_City' }).format(new Date(value));
const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('es-MX', { timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(value));

function refunded(record: ReturnSummary) {
  return record.refunds
    .filter((refund) => refund.status === 'completed')
    .reduce((total, refund) => total + refund.amount, 0);
}

/** Registro para el administrador: quién devolvió o canceló, qué y a qué hora, por día. */
export function ReturnsLogPanel({ returns }: { returns: ReturnSummary[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [search, setSearch] = useState('');

  const days = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = [...returns]
      .filter((record) => filter === 'all' || record.status === filter)
      .filter((record) =>
        !needle
          ? true
          : [record.returnNumber, record.order?.orderNumber, record.authorizedBy?.name, ...record.refunds.map((r) => r.processedBy?.name)]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(needle),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const groups = new Map<string, ReturnSummary[]>();
    for (const row of rows) {
      const key = dayKey(row.createdAt);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()];
  }, [returns, filter, search]);

  return (
    <section aria-labelledby="registro-devoluciones" className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Registro</p>
          <h2 id="registro-devoluciones" className="mt-1 text-lg font-semibold">
            Devoluciones, cancelaciones y reembolsos
          </h2>
          <p className="mt-1 text-sm text-slate-400">Quién lo hizo, a qué hora y cuánto dinero se devolvió. Lo más reciente primero.</p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Folio, venta o persona…"
          aria-label="Buscar en el registro"
          className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm outline-none focus:border-cyan-400 sm:w-64"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${
              filter === key ? 'bg-cyan-300 text-slate-950' : 'border border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
          No hay movimientos con ese filtro.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {days.map(([day, rows]) => (
            <div key={day}>
              <div className="flex items-baseline justify-between gap-3 border-b border-slate-800 pb-2">
                <h3 className="text-sm font-semibold capitalize text-slate-200">{day}</h3>
                <p className="text-xs text-slate-400">
                  {rows.length} movimiento{rows.length === 1 ? '' : 's'} · devuelto{' '}
                  <span className="font-semibold text-amber-300">{money.format(rows.reduce((t, r) => t + refunded(r), 0))}</span>
                </p>
              </div>
              <ul className="divide-y divide-slate-800">
                {rows.map((record) => {
                  const status = STATUS[record.status] ?? { label: record.status, tone: 'bg-slate-700 text-slate-300' };
                  const refunds = record.refunds.filter((refund) => refund.status === 'completed');
                  return (
                    <li key={record.id} className="grid gap-2 py-3 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-center">
                      <p className="text-sm font-semibold tabular-nums text-slate-300">{timeLabel(record.createdAt)}</p>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {record.type === 'exchange' ? 'Cambio' : 'Devolución'} {record.returnNumber ?? ''}
                          {record.order?.orderNumber ? (
                            <span className="text-slate-500"> · venta {record.order.orderNumber}</span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {record.reason ? `${REASONS[record.reason] ?? record.reason} · ` : ''}
                          Autorizó: {record.authorizedBy?.name ?? '—'}
                          {refunds.length
                            ? ` · Reembolsó: ${[...new Set(refunds.map((refund) => refund.processedBy?.name ?? '—'))].join(', ')}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 sm:justify-end">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
                        <span className="min-w-20 text-right text-sm font-semibold tabular-nums">
                          {refunded(record) > 0 ? money.format(refunded(record)) : record.totalAmount ? money.format(record.totalAmount) : '—'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 text-xs leading-5 text-slate-500">
        Se muestran las últimas 100 devoluciones. Las ventas sin pagar que se vacían en caja no dejan registro de quién fue
        todavía.
      </p>
    </section>
  );
}

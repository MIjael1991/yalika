'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../../../lib/yalika-download';
import {
  methodLabel,
  presetRange,
  rangeToQuery,
  reportPresets,
  reportToCsv,
  type ReportPreset,
  type SalesReport,
} from '../../../lib/yalika-sales-report';
import { salesWorkbook } from '../../../lib/yalika-sales-xlsx';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function errorText(value: unknown) {
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message: unknown }).message;
    return Array.isArray(message) ? message.join('; ') : String(message);
  }
  return 'No fue posible generar el reporte';
}

function dayLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function SalesReportPanel({ companyId }: { companyId: string }) {
  const initial = presetRange('last7');
  const [preset, setPreset] = useState<ReportPreset>('last7');
  const [fromDay, setFromDay] = useState(initial.from);
  const [toDay, setToDay] = useState(initial.to);
  const [report, setReport] = useState<SalesReport>();
  const [shown, setShown] = useState({ from: initial.from, to: initial.to });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);

  const load = useCallback(
    async (from: string, to: string) => {
      const built = rangeToQuery(from, to);
      if ('error' in built) {
        setError(built.error);
        return;
      }

      // Si se pide otro rango antes de que llegue el anterior, gana el último.
      const ticket = ++latest.current;
      setLoading(true);
      setError('');

      try {
        const response = await fetch(
          `/api/yalika/order/company/${encodeURIComponent(companyId)}/report?${built.query}`,
          { cache: 'no-store' },
        );
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) throw new Error(errorText(payload));
        if (ticket !== latest.current) return;
        setReport(payload as SalesReport);
        setShown({ from, to });
      } catch (requestError) {
        if (ticket !== latest.current) return;
        setReport(undefined);
        setError(requestError instanceof Error ? requestError.message : 'No fue posible generar el reporte');
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    },
    [companyId],
  );

  useEffect(() => {
    void load(initial.from, initial.to);
    // Solo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(next: Exclude<ReportPreset, 'custom'>) {
    const range = presetRange(next);
    setPreset(next);
    setFromDay(range.from);
    setToDay(range.to);
    void load(range.from, range.to);
  }

  function download() {
    if (!report) return;
    downloadBlob(
      new Blob([reportToCsv(report, shown.from, shown.to)], { type: 'text/csv;charset=utf-8' }),
      `ventas-${shown.from}_a_${shown.to}.csv`,
    );
  }

  function downloadExcel() {
    if (!report) return;
    try {
      const bytes = salesWorkbook(report, shown.from, shown.to);
      downloadBlob(
        new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `ventas-${shown.from}_a_${shown.to}.xlsx`,
      );
    } catch {
      setError('No fue posible crear el archivo de Excel. Prueba con un rango más corto o descarga el CSV.');
    }
  }

  const maxDay = Math.max(1, ...(report?.byDay.map((day) => day.gross) ?? [0]));
  const t = report?.totals;

  return (
    <section aria-label="Reporte de ventas por fechas" className="mb-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Reporte de ventas por fechas</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Ventas cobradas por completo, menos las devoluciones terminadas en esas fechas. El Excel trae resumen, por día,
            por semana, por mes, cobros por método, tickets, devoluciones y productos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!report || loading}
            className="min-h-11 rounded-xl bg-emerald-400 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-40"
          >
            Descargar Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!report || loading}
            className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm font-semibold text-cyan-300 hover:border-cyan-400 disabled:opacity-40"
          >
            CSV
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {reportPresets.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={preset === item.id}
            onClick={() => choose(item.id)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
              preset === item.id ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPreset('custom');
          void load(fromDay, toDay);
        }}
      >
        <label className="text-xs text-slate-400">
          Desde
          <input
            type="date"
            value={fromDay}
            max={toDay || undefined}
            onChange={(event) => setFromDay(event.target.value)}
            className="mt-1 block h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400">
          Hasta
          <input
            type="date"
            value={toDay}
            min={fromDay || undefined}
            onChange={(event) => setToDay(event.target.value)}
            className="mt-1 block h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white"
          />
        </label>
        <button type="submit" disabled={loading} className="min-h-11 rounded-xl bg-cyan-400 px-5 text-sm font-bold text-slate-950 disabled:opacity-50">
          {loading ? 'Consultando…' : 'Ver reporte'}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {report && t ? (
        <div className={`mt-5 space-y-5 ${loading ? 'opacity-60' : ''}`}>
          {report.ticketsTruncated ? (
            <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              Hay más de 5,000 tickets en estas fechas: los totales están completos, pero el detalle del Excel se corta. Elige un rango más corto.
            </p>
          ) : null}
          <p className="text-xs text-slate-500">
            Del {dayLabel(shown.from)} al {dayLabel(shown.to)} · hora de {report.timeZone}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs text-slate-500">Venta bruta</p>
              <p className="mt-1 text-2xl font-bold text-cyan-300">{money.format(t.gross)}</p>
              <p className="mt-1 text-xs text-slate-500">{t.orders} {t.orders === 1 ? 'venta' : 'ventas'} · {t.units} piezas</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs text-slate-500">Devoluciones</p>
              <p className="mt-1 text-2xl font-bold text-amber-300">−{money.format(t.returnsAmount)}</p>
              <p className="mt-1 text-xs text-slate-500">{t.returns} {t.returns === 1 ? 'devolución' : 'devoluciones'}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-xs text-emerald-200/70">Venta neta</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{money.format(t.net)}</p>
              <p className="mt-1 text-xs text-slate-500">Descuentos otorgados: {money.format(t.discounts)}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs text-slate-500">Ticket promedio</p>
              <p className="mt-1 text-2xl font-bold text-white">{money.format(t.averageTicket)}</p>
              {t.pendingOrders > 0 ? (
                <p className="mt-1 text-xs text-amber-300">Por cobrar: {t.pendingOrders} · {money.format(t.pendingAmount)}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Sin cuentas por cobrar</p>
              )}
            </div>
          </div>

          {t.orders === 0 && t.returns === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400">
              No hay ventas ni devoluciones en estas fechas.
            </p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <h3 className="text-sm font-semibold text-slate-200">Cobrado por método</h3>
                  {report.paymentsByMethod.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">Sin cobros en estas fechas.</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <tbody>
                        {report.paymentsByMethod.map((row) => (
                          <tr key={row.method} className="border-t border-slate-800">
                            <td className="py-2">{methodLabel(row.method)}</td>
                            <td className="py-2 text-right text-slate-500">{row.count}</td>
                            <td className="py-2 text-right font-semibold">{money.format(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {report.exchangeCredit > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Crédito por cambios aplicado: {money.format(report.exchangeCredit)} (no entra como dinero).
                    </p>
                  ) : null}
                  {report.refundsByMethod.length > 0 ? (
                    <>
                      <h3 className="mt-4 text-sm font-semibold text-slate-200">Dinero devuelto</h3>
                      <table className="mt-2 w-full text-sm">
                        <tbody>
                          {report.refundsByMethod.map((row) => (
                            <tr key={row.method} className="border-t border-slate-800">
                              <td className="py-2">{methodLabel(row.method)}</td>
                              <td className="py-2 text-right text-slate-500">{row.count}</td>
                              <td className="py-2 text-right font-semibold text-amber-300">−{money.format(row.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <h3 className="text-sm font-semibold text-slate-200">Más vendidos</h3>
                  {report.topProducts.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">Sin productos vendidos.</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <tbody>
                        {report.topProducts.map((product) => (
                          <tr key={`${product.sku ?? ''}-${product.name}`} className="border-t border-slate-800">
                            <td className="py-2">
                              <span className="block truncate">{product.name}</span>
                              <span className="text-xs text-slate-500">{product.sku ?? 'Sin SKU'}</span>
                            </td>
                            <td className="py-2 text-right text-slate-500">{product.quantity} pzas</td>
                            <td className="py-2 text-right font-semibold">{money.format(product.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="text-sm font-semibold text-slate-200">Por día</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="py-1 text-left font-normal">Día</th>
                        <th className="py-1 text-right font-normal">Ventas</th>
                        <th className="py-1 text-right font-normal">Bruta</th>
                        <th className="py-1 text-right font-normal">Devol.</th>
                        <th className="py-1 text-right font-normal">Neta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byDay.map((day) => (
                        <tr key={day.date} className="border-t border-slate-800">
                          <td className="py-2">
                            <span className="block">{dayLabel(day.date)}</span>
                            <span className="mt-1 block h-1.5 rounded-full bg-slate-800" aria-hidden="true">
                              <span className="block h-1.5 rounded-full bg-cyan-400/70" style={{ width: `${Math.max(2, (day.gross / maxDay) * 100)}%` }} />
                            </span>
                          </td>
                          <td className="py-2 text-right text-slate-400">{day.orders}</td>
                          <td className="py-2 text-right">{money.format(day.gross)}</td>
                          <td className="py-2 text-right text-amber-300">{day.returnsAmount > 0 ? `−${money.format(day.returnsAmount)}` : '—'}</td>
                          <td className="py-2 text-right font-semibold text-emerald-300">{money.format(day.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

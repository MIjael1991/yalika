'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '../../../lib/yalika-download';
import {
  DEFAULT_ALERT_SETTINGS,
  ageLabel,
  alertSections,
  alertsQuery,
  deadlineText,
  filterByCatalog,
  firstSectionWithItems,
  kindLabel,
  normalizeAlertSettings,
  stockWorkbook,
  type AlertItem,
  type SectionId,
  type StockAlertReport,
  type StockAlertSettings,
} from '../../../lib/yalika-stock-alerts';

const STORAGE_KEY = 'yalika.pos.alertas';

const settingFields: Array<{ key: keyof StockAlertSettings; label: string; help: string; min: number; max: number }> = [
  { key: 'slowDays', label: 'Resagado después de', help: 'días sin venderse', min: 7, max: 365 },
  { key: 'newDays', label: 'Nuevo hasta', help: 'días desde que llegó', min: 1, max: 90 },
  { key: 'agedDays', label: 'Viejo después de', help: 'días en inventario', min: 14, max: 730 },
  { key: 'coverDays', label: 'Se agota pronto si alcanza para menos de', help: 'días', min: 1, max: 60 },
  { key: 'deadlineWarnDays', label: 'Avisar la fecha límite con', help: 'días de anticipación', min: 1, max: 90 },
];

const badge: Record<AlertItem['ageBucket'], string> = {
  new: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  recent: 'border-slate-600 bg-slate-800 text-slate-300',
  old: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  very_old: 'border-red-500/40 bg-red-500/10 text-red-200',
};

function errorText(value: unknown) {
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message: unknown }).message;
    return Array.isArray(message) ? message.join('; ') : String(message);
  }
  return 'No fue posible cargar las alertas';
}

function loadSettings(): StockAlertSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeAlertSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_ALERT_SETTINGS;
  }
}

function saveSettings(settings: StockAlertSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* sin almacenamiento: se usan los valores de esta visita */
  }
}

export function StockAlertsPanel({
  companyId,
  catalogs,
  reloadKey,
}: {
  companyId: string;
  catalogs: Array<{ id: string; name: string }>;
  /** Cambia cuando se registra una entrada de mercancía, para refrescar las alertas. */
  reloadKey: number;
}) {
  const [settings, setSettings] = useState<StockAlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [draft, setDraft] = useState<Record<keyof StockAlertSettings, string>>(() => ({
    slowDays: String(DEFAULT_ALERT_SETTINGS.slowDays),
    newDays: String(DEFAULT_ALERT_SETTINGS.newDays),
    agedDays: String(DEFAULT_ALERT_SETTINGS.agedDays),
    coverDays: String(DEFAULT_ALERT_SETTINGS.coverDays),
    deadlineWarnDays: String(DEFAULT_ALERT_SETTINGS.deadlineWarnDays),
  }));
  const [ready, setReady] = useState(false);
  const [report, setReport] = useState<StockAlertReport>();
  const [catalogId, setCatalogId] = useState('');
  const [section, setSection] = useState<SectionId>('out');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const latest = useRef(0);
  const picked = useRef(false);

  // Lo guardado en el dispositivo se lee una sola vez, ya en el navegador.
  useEffect(() => {
    const saved = loadSettings();
    setSettings(saved);
    setDraft({
      slowDays: String(saved.slowDays),
      newDays: String(saved.newDays),
      agedDays: String(saved.agedDays),
      coverDays: String(saved.coverDays),
      deadlineWarnDays: String(saved.deadlineWarnDays),
    });
    setReady(true);
  }, []);

  const load = useCallback(
    async (current: StockAlertSettings) => {
      const ticket = ++latest.current;
      setLoading(true);
      setError('');
      try {
        let timeZone: string | undefined;
        try {
          timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          timeZone = undefined;
        }
        const response = await fetch(
          `/api/yalika/catalog/product/company/${encodeURIComponent(companyId)}/stock-alerts?${alertsQuery(current, timeZone)}`,
          { cache: 'no-store' },
        );
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) throw new Error(errorText(payload));
        if (ticket !== latest.current) return;
        const next = payload as StockAlertReport;
        setReport(next);
        if (!picked.current) setSection(firstSectionWithItems(next));
      } catch (requestError) {
        if (ticket !== latest.current) return;
        setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar las alertas');
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    },
    [companyId],
  );

  useEffect(() => {
    if (ready) void load(settings);
    // Se recarga al abrir, al cambiar las reglas y al registrar una entrada de mercancía.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings, reloadKey]);

  const catalogName = useMemo(() => {
    const names = new Map(catalogs.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (names.get(id) ?? '') : 'Sin negocio asignado');
  }, [catalogs]);

  const view = useMemo(() => (report ? filterByCatalog(report, catalogId) : undefined), [report, catalogId]);
  const filterLabel = catalogId === 'none' ? 'Sin negocio asignado' : (catalogs.find((c) => c.id === catalogId)?.name ?? '');
  const hasUnassigned = useMemo(() => !!report?.byAge.some((item) => !item.catalogId) || !!report?.out.some((item) => !item.catalogId), [report]);

  function applySettings() {
    const next = normalizeAlertSettings(draft);
    picked.current = false;
    saveSettings(next);
    setSettings(next);
    setDraft({
      slowDays: String(next.slowDays),
      newDays: String(next.newDays),
      agedDays: String(next.agedDays),
      coverDays: String(next.coverDays),
      deadlineWarnDays: String(next.deadlineWarnDays),
    });
  }

  function resetSettings() {
    picked.current = false;
    saveSettings(DEFAULT_ALERT_SETTINGS);
    setSettings(DEFAULT_ALERT_SETTINGS);
    setDraft({
      slowDays: String(DEFAULT_ALERT_SETTINGS.slowDays),
      newDays: String(DEFAULT_ALERT_SETTINGS.newDays),
      agedDays: String(DEFAULT_ALERT_SETTINGS.agedDays),
      coverDays: String(DEFAULT_ALERT_SETTINGS.coverDays),
      deadlineWarnDays: String(DEFAULT_ALERT_SETTINGS.deadlineWarnDays),
    });
  }

  function downloadExcel() {
    if (!view) return;
    try {
      const day = new Date().toISOString().slice(0, 10);
      downloadBlob(
        new Blob([stockWorkbook(view, catalogName, filterLabel) as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `alertas-inventario-${day}.xlsx`,
      );
    } catch {
      setError('No fue posible crear el archivo de Excel.');
    }
  }

  const items = view ? view[section] : [];
  const active = alertSections.find((x) => x.id === section);

  return (
    <section aria-label="Alertas del inventario" className="rounded-2xl border border-slate-800 bg-slate-950 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Alertas del inventario</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Se calculan con tus propias ventas y entradas, sin internet externo ni IA. Sólo avisan: no compran ni cambian existencias.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!view || loading}
            className="min-h-11 rounded-xl bg-emerald-400 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-40"
          >
            Descargar Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => void load(settings)}
            disabled={loading}
            className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-cyan-300 hover:border-cyan-400 disabled:opacity-40"
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {view ? (
        <div className={`mt-4 space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {catalogs.length > 0 ? (
            <label className="block text-xs text-slate-400">
              Negocio
              <select
                value={catalogId}
                onChange={(event) => setCatalogId(event.target.value)}
                className="mt-1 block h-11 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white"
              >
                <option value="">Todos los negocios</option>
                {catalogs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {hasUnassigned ? <option value="none">Sin negocio asignado</option> : null}
              </select>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de alerta">
            {alertSections.map((x) => {
              const count = view[x.id].length;
              const urgent = (x.id === 'out' || x.id === 'deadline') && count > 0;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  aria-selected={section === x.id}
                  onClick={() => {
                    picked.current = true;
                    setSection(x.id);
                  }}
                  className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                    section === x.id
                      ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200'
                      : urgent
                        ? 'border-red-500/40 text-red-200 hover:border-red-400'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {x.label} <span className="ml-1 text-xs opacity-80">{count}</span>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-slate-500">{active?.hint}</p>

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-sm text-emerald-300">
              {section === 'byAge' || section === 'newArrivals' ? 'No hay productos con existencia en esta vista.' : 'Nada por atender aquí. Todo en orden.'}
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {items.slice(0, 100).map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="min-w-0 break-words">{item.name}</strong>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${badge[item.ageBucket]}`}>{ageLabel[item.ageBucket]}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {[catalogName(item.catalogId), item.categoryName, item.sku].filter(Boolean).join(' · ') || 'Sin SKU'}
                  </p>
                  <p className="mt-2 text-sm text-slate-200">{item.message.replace(`${item.name}: `, '')}</p>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>Existencia: {item.stock}</span>
                    <span>Entró hace {item.ageDays} d</span>
                    <span>Vendido 90 d: {item.sold90}</span>
                    {item.deadlineInDays !== null ? <span className="text-amber-300">Límite {deadlineText(item.deadlineInDays)}</span> : null}
                  </p>
                  {item.kinds.length > 1 ? (
                    <p className="mt-2 flex flex-wrap gap-1 text-xs">
                      {item.kinds.map((k) => (
                        <span key={k} className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                          {kindLabel[k]}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {items.length > 100 ? <p className="text-xs text-slate-500">Se muestran 100 de {items.length}. El Excel trae todos.</p> : null}
        </div>
      ) : loading ? (
        <p className="mt-4 text-sm text-slate-400">Calculando alertas…</p>
      ) : null}

      <div className="mt-5 border-t border-slate-800 pt-3">
        <button
          type="button"
          aria-expanded={showSettings}
          onClick={() => setShowSettings((value) => !value)}
          className="min-h-11 text-sm font-semibold text-slate-300 hover:text-white"
        >
          {showSettings ? '▾' : '▸'} Ajustar qué es nuevo, viejo o resagado
        </button>
        {showSettings ? (
          <div className="mt-2 space-y-3">
            <p className="text-xs leading-5 text-slate-500">
              Una tienda de moda puede querer 30 días para “resagado”; una de abarrotes, 90. Los cambios se guardan en este dispositivo.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {settingFields.map((f) => (
                <label key={f.key} className="text-xs text-slate-400">
                  {f.label}
                  <span className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={f.min}
                      max={f.max}
                      step={1}
                      value={draft[f.key]}
                      onChange={(event) => setDraft((current) => ({ ...current, [f.key]: event.target.value }))}
                      className="h-11 w-24 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white"
                    />
                    <span>{f.help}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={applySettings} className="min-h-11 rounded-xl bg-cyan-400 px-5 text-sm font-bold text-slate-950">
                Aplicar
              </button>
              <button type="button" onClick={resetSettings} className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm text-slate-300">
                Volver a los valores normales
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

'use client';

import { FormEvent, useState } from 'react';

import { api } from './reservation-api';

export type ReservationPolicy = {
  companyId: string;
  enabled: boolean;
  depositRequired: boolean;
  depositType: string;
  depositValue: number;
  holdMinutes: number;
  activeDays: number;
};

/**
 * Reglas de los pedidos en línea (apartados): activarlos, anticipo y tiempos.
 * Es la única pantalla que las cambia; Apartados y Ajustes la comparten.
 */
export function ReservationPolicyForm({
  companyId,
  initialPolicy,
  readOnly = false,
}: {
  companyId: string;
  initialPolicy: ReservationPolicy;
  readOnly?: boolean;
}) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function savePolicy(event: FormEvent) {
    event.preventDefault();
    setSavingPolicy(true);
    setError('');
    setSaved(false);
    try {
      const next = await api<ReservationPolicy>(
        `reservation/company/${companyId}/policy`,
        {
          method: 'PUT',
          body: JSON.stringify({
            enabled: policy.enabled,
            depositRequired: policy.depositRequired,
            depositType: policy.depositType,
            depositValue: Number(policy.depositValue),
            holdMinutes: Number(policy.holdMinutes),
            activeDays: Number(policy.activeDays),
          }),
        },
      );
      setPolicy(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar');
    } finally {
      setSavingPolicy(false);
    }
  }

  return (
    <form
        onSubmit={savePolicy}
        className="h-fit rounded-3xl border border-white/10 bg-slate-900/70 p-5"
      >
        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">Pedidos en línea y apartados</h2>
            <p className="mt-1 text-xs text-slate-500">
              Se aplican a tu tienda web.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setPolicy((p) => ({ ...p, enabled: !p.enabled }))
            }
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              policy.enabled
                ? 'bg-emerald-400 text-slate-950'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {policy.enabled ? 'Activos' : 'Desactivados'}
          </button>
        </div>
  
        <label className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-white/5 p-3 text-sm">
          Exigir anticipo
          <input
            type="checkbox"
            checked={policy.depositRequired}
            onChange={(e) =>
              setPolicy((p) => ({
                ...p,
                depositRequired: e.target.checked,
              }))
            }
          />
        </label>
  
        <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-slate-500">
          Tipo de anticipo
          <select
            value={policy.depositType}
            onChange={(e) =>
              setPolicy((p) => ({
                ...p,
                depositType: e.target.value,
              }))
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white"
          >
            <option value="fixed">Cantidad fija</option>
            <option value="percentage">Porcentaje</option>
          </select>
        </label>
  
        <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-slate-500">
          {policy.depositType === 'percentage'
            ? 'Porcentaje'
            : 'Anticipo'}
          <input
            type="number"
            min="0"
            step="0.01"
            value={policy.depositValue}
            onChange={(e) =>
              setPolicy((p) => ({
                ...p,
                depositValue: Number(e.target.value),
              }))
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white"
          />
        </label>
  
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Minutos
            <input
              type="number"
              min="5"
              max="1440"
              value={policy.holdMinutes}
              onChange={(e) =>
                setPolicy((p) => ({
                  ...p,
                  holdMinutes: Number(e.target.value),
                }))
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white"
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Días activo
            <input
              type="number"
              min="1"
              max="90"
              value={policy.activeDays}
              onChange={(e) =>
                setPolicy((p) => ({
                  ...p,
                  activeDays: Number(e.target.value),
                }))
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white"
            />
          </label>
        </div>
  
        <button
          disabled={savingPolicy}
          className="mt-5 w-full rounded-2xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:opacity-60"
        >
          {savingPolicy ? 'Guardando…' : 'Guardar reglas'}
        </button>

        {error ? (
          <p role="alert" className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-xs text-red-100">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-xs text-emerald-100">
            Reglas guardadas.
          </p>
        ) : null}
  
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Si existe anticipo confirmado y vence la fecha de recogida,
          Yalika lo manda a revisión; no libera ni confisca dinero
          automáticamente.
        </p>
        </fieldset>
        {readOnly ? (
          <p className="mt-3 text-xs text-amber-200">
            Solo el administrador cambia estas reglas.
          </p>
        ) : null}
      </form>
  );
}

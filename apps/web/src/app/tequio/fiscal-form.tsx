'use client';

import { useEffect, useState } from 'react';

import {
  CFDI_USES,
  FISCAL_REGIMES,
  presenteApi,
  RFC_PATTERN,
  type FiscalData,
} from '@/lib/yalika-presente';

import styles from './presente.module.css';

const empty: FiscalData = { rfc: '', name: '', regime: '', zip: '', use: 'G03', email: null };

/**
 * Datos para factura (como los pide el SAT): RFC, nombre o razón social tal como está en tu
 * constancia, régimen, código postal y uso. Se guardan una vez y se usan cada que pides factura.
 */
export function FiscalForm({ onSaved, compact = false }: { onSaved?: (complete: boolean) => void; compact?: boolean }) {
  const [form, setForm] = useState<FiscalData>(empty);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    presenteApi
      .fiscal()
      .then((data) => {
        if (!live) return;
        setForm({ ...data, email: data.email ?? '' });
        setLoaded(true);
        if (data.complete) onSaved?.(true);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const rfc = form.rfc.toUpperCase().replace(/[\s-]/g, '');
    if (!RFC_PATTERN.test(rfc)) return setError('Revisa tu RFC: 12 caracteres si es empresa, 13 si es persona.');
    if (!form.name.trim()) return setError('Escribe tu nombre o razón social como está en tu constancia del SAT.');
    if (!form.regime) return setError('Elige tu régimen fiscal.');
    if (!/^\d{5}$/.test(form.zip)) return setError('Escribe el código postal de tu domicilio fiscal (5 números).');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await presenteApi.saveFiscal({ ...form, rfc, email: form.email?.trim() || null });
      setForm({ ...saved, email: saved.email ?? '' });
      setNotice('Datos para factura guardados.');
      onSaved?.(saved.complete);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron guardar.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className={styles.meta}>Cargando…</p>;
  return (
    <div className={styles.form}>
      {!compact && (
        <p className={styles.meta}>
          Escríbelos como vienen en tu Constancia de Situación Fiscal del SAT. Los usamos solo para
          que te hagan tu factura.
        </p>
      )}
      <div className={styles.row}>
        <label className={styles.field}>
          RFC
          <input
            value={form.rfc}
            maxLength={13}
            autoCapitalize="characters"
            onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
          />
        </label>
        <label className={styles.field}>
          Código postal fiscal
          <input
            inputMode="numeric"
            maxLength={5}
            value={form.zip}
            onChange={(e) => setForm({ ...form, zip: e.target.value.replace(/\D/g, '') })}
          />
        </label>
      </div>
      <label className={styles.field}>
        Nombre o razón social
        <input value={form.name} maxLength={254} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className={styles.field}>
        Régimen fiscal
        <select value={form.regime} onChange={(e) => setForm({ ...form, regime: e.target.value })}>
          <option value="">Elige</option>
          {FISCAL_REGIMES.map(([code, label]) => (
            <option key={code} value={code}>
              {code} · {label}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          Uso de la factura
          <select value={form.use} onChange={(e) => setForm({ ...form, use: e.target.value })}>
            {CFDI_USES.map(([code, label]) => (
              <option key={code} value={code}>
                {code} · {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Correo (opcional)
          <input
            type="email"
            value={form.email ?? ''}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && <p className={styles.notice}>{notice}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar datos para factura'}
        </button>
      </div>
    </div>
  );
}

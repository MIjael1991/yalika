'use client';

import { useState, type FormEvent } from 'react';

import { presenteApi, type SafetyRecord } from '@/lib/yalika-presente';

import styles from '../presente.module.css';
import { RecordBody } from '../registro/[id]/safety-record';

/**
 * Registro sellado para una autoridad: solo con el número de pedido y el número de oficio u
 * orden. Cada vez que se abre queda en la bitácora con quién lo abrió y con qué oficio.
 */
export function AuthorityRecord() {
  const [code, setCode] = useState('');
  const [ref, setRef] = useState('');
  const [record, setRecord] = useState<SafetyRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function open(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setRecord(await presenteApi.authorityRecord(code.trim(), ref.trim()));
    } catch (failure) {
      setRecord(null);
      setError(failure instanceof Error ? failure.message : 'No se pudo abrir el registro.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Registro para una autoridad</h2>
      <p className={styles.meta}>
        Solo con orden por escrito (Fiscalía, juzgado). Se registra quién lo abrió, cuándo y con qué
        oficio. No lo abras por curiosidad ni por petición de un cliente: ellos ven el suyo 30 días.
      </p>
      <form className={styles.form} onSubmit={open}>
        <div className={styles.row}>
          <label className={styles.field}>
            Número de pedido
            <input value={code} maxLength={36} placeholder="Ej. 2B0D3B7E" onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className={styles.field}>
            Número de oficio u orden
            <input value={ref} maxLength={120} placeholder="Ej. FGE/123/2026" onChange={(e) => setRef(e.target.value)} />
          </label>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={busy || code.trim().length < 8 || ref.trim().length < 4}>
            {busy ? 'Abriendo…' : 'Abrir registro'}
          </button>
        </div>
      </form>
      {record && <RecordBody record={record} authorityRef={ref.trim()} />}
    </section>
  );
}

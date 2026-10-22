'use client';

import { useEffect, useState } from 'react';

import {
  dateTimeLabel,
  formatMxn,
  presenteApi,
  tradeLabel,
  type ProblemJob,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';

/** Trabajos donde el cliente dijo que algo quedó mal: no se cierran solos. */
export function ProblemJobs() {
  const [items, setItems] = useState<ProblemJob[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    presenteApi
      .problems()
      .then((list) => live && setItems(list))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);

  async function close(item: ProblemJob, charge: boolean) {
    const note = notes[item.requestId]?.trim() ?? '';
    if (note.length < 3) return setError('Escribe qué se acordó con los dos.');
    setBusy(item.requestId);
    setError('');
    try {
      setItems(await presenteApi.closeProblem(item.requestId, charge, note));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cerrar.');
    } finally {
      setBusy('');
    }
  }

  if (!items?.length) return null;
  return (
    <details className={styles.category} open>
      <summary>
        <span>
          <strong>Trabajos con problema ({items.length})</strong>
          <small>El cliente dijo que algo quedó mal; habla con los dos y ciérralo</small>
        </span>
      </summary>
      <div className={styles.card}>
        {items.map((item) => (
          <article key={item.requestId} className={styles.request}>
            <h3>{item.trades.map(tradeLabel).join(' + ')}</h3>
            <p className={styles.meta}>
              {item.clientName} con {item.providerName}
              {item.amountMxn != null ? ` · ${formatMxn(item.amountMxn)}` : ''} · reportado{' '}
              {dateTimeLabel(item.problemAt)}
            </p>
            <p>{item.description}</p>
            {item.problemNote && <p className={styles.notice2}>Cliente: {item.problemNote}</p>}
            <label className={styles.field}>
              Qué se acordó
              <input
                value={notes[item.requestId] ?? ''}
                maxLength={300}
                onChange={(e) => setNotes({ ...notes, [item.requestId]: e.target.value })}
              />
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                disabled={Boolean(busy)}
                onClick={() => close(item, true)}
              >
                Quedó resuelto (cobrar comisión)
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={Boolean(busy)}
                onClick={() => close(item, false)}
              >
                Cerrar sin comisión
              </button>
            </div>
          </article>
        ))}
        {error && <p className={styles.hint}>{error}</p>}
      </div>
    </details>
  );
}

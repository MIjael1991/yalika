'use client';

import { useEffect, useState } from 'react';

import { dateTimeLabel, formatMxn, presenteApi, type OwedToMe } from '@/lib/yalika-presente';

import styles from '../presente.module.css';

/**
 * Lo que te deben clientes que cancelaron cuando ya ibas en camino. Se les suma a su siguiente
 * pedido y, al cerrarse, te llega a tu saldo. Si te pagan directo, márcalo aquí.
 */
export function OwedCard() {
  const [owed, setOwed] = useState<OwedToMe | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    presenteApi
      .owedToMe()
      .then((loaded) => live && setOwed(loaded))
      .catch(() => live && setOwed(null));
    return () => {
      live = false;
    };
  }, []);

  async function paid(id: string, name: string, amount: number) {
    if (!window.confirm(`¿${name} ya te pagó ${formatMxn(amount)}?`)) return;
    setBusy(id);
    setError('');
    try {
      setOwed(await presenteApi.debtPaid(id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
    } finally {
      setBusy('');
    }
  }

  if (!owed?.items.length) return null;
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Te deben {formatMxn(owed.totalMxn)} por cancelaciones</h2>
      <p className={styles.meta}>
        Se le suma al cliente en su siguiente pedido y, al cerrarse, te llega a tu saldo de Tequio.
        Si te paga directo, márcalo para que ya no se le cobre.
      </p>
      <ul className={styles.plainList}>
        {owed.items.map((d) => (
          <li key={d.id}>
            <span>
              <strong>{formatMxn(d.amountMxn)}</strong> · {d.clientName}
              <br />
              <small className={styles.meta}>
                {dateTimeLabel(d.createdAt)}
                {d.inNextRequest ? ' · ya está en su siguiente pedido' : ''}
              </small>
            </span>
            <button
              type="button"
              className={styles.link}
              disabled={Boolean(busy)}
              onClick={() => void paid(d.id, d.clientName, d.amountMxn)}
            >
              Ya me pagó
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}

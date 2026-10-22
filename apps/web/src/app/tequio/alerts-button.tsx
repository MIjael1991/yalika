'use client';

import { useEffect, useState } from 'react';

import { alertsState, disableAlerts, enableAlerts, type AlertsState } from '@/lib/tequio-alerts';

import styles from './presente.module.css';

/**
 * Prender los avisos al celular. Se muestra solo si todavía no están prendidos (o para apagarlos
 * donde se pide). El texto cambia según quién lo ve.
 */
export function AlertsButton({ ask, allowOff = false }: { ask: string; allowOff?: boolean }) {
  const [state, setState] = useState<AlertsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    alertsState()
      .then((s) => live && setState(s))
      .catch(() => live && setState('unsupported'));
    return () => {
      live = false;
    };
  }, []);

  async function run(action: () => Promise<AlertsState>) {
    setBusy(true);
    setError('');
    try {
      setState(await action());
    } catch {
      setError('No se pudieron prender los avisos en este celular. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (!state || state === 'unsupported') return null;
  if (state === 'on') {
    return allowOff ? (
      <p className={styles.alertsOn}>
        Avisos al celular prendidos.{' '}
        <button type="button" className={styles.link} disabled={busy} onClick={() => void run(disableAlerts)}>
          Apagar avisos
        </button>
      </p>
    ) : null;
  }
  if (state === 'denied') {
    return (
      <p className={styles.meta}>
        Los avisos están bloqueados en este navegador. Para recibirlos, permítelos en los ajustes del
        sitio.
      </p>
    );
  }
  return (
    <div className={styles.alertsAsk}>
      <span>{ask}</span>
      <button type="button" className={styles.workLater} disabled={busy} onClick={() => void run(enableAlerts)}>
        {busy ? 'Un momento…' : 'Sí, avisarme'}
      </button>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}

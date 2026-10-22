'use client';

import { useEffect, useState } from 'react';

import {
  clockLabel,
  gpsEta,
  MAX_DELAY_NOTICES,
  presenteApi,
  type PresenteJob,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';

const DELAYS: [number, string, string][] = [
  [5, '+5 min', 'Ya casi llego'],
  [10, '+10 min', 'Hay tráfico'],
  [20, '+20 min', 'Hay mucho tráfico'],
];
const QUICK = ['Voy en camino', 'Ya casi llego', 'Estoy afuera'];

/**
 * En camino (como en las apps de viajes): cuánto falta para la hora que dijo, qué tan lejos va
 * según su GPS y, si se le acaba el tiempo, avisar al cliente que hay tráfico con un toque (hasta
 * 2 veces) para que no se le cuente como tarde. Mensajes rápidos sin escribir.
 */
export function ArrivalPanel({
  job,
  me,
  onChange,
  onMessage,
}: {
  job: PresenteJob;
  me: { lat: number; lng: number } | null;
  onChange: (jobs: PresenteJob[]) => void;
  onMessage: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [said, setSaid] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  const eta = job.etaAt ? new Date(job.etaAt).getTime() : null;
  const left = eta === null ? null : Math.round((eta - now) / 60_000);
  const late = left !== null && left < 0;
  const gps = me && job.lat !== null && job.lng !== null ? gpsEta(me, { lat: job.lat, lng: job.lng }) : null;
  const delaysLeft = Math.max(0, MAX_DELAY_NOTICES - (job.delayCount ?? 0));

  async function delay(extra: number, note: string) {
    setBusy(true);
    setError('');
    try {
      onChange(await presenteApi.enRoute(job.requestId, Math.max(0, left ?? 0) + extra, note));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo avisar.');
    } finally {
      setBusy(false);
    }
  }

  async function say(text: string) {
    setBusy(true);
    setError('');
    try {
      await presenteApi.sendMessage(job.requestId, text);
      setSaid(text);
      onMessage();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo mandar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.arrival} data-late={late}>
      {job.etaAt && (
        <p className={styles.arrivalTime}>
          {late
            ? `Se pasó tu hora de llegada (${clockLabel(job.etaAt)})`
            : left === 0
              ? `Te esperan ya (${clockLabel(job.etaAt)})`
              : `Te esperan a las ${clockLabel(job.etaAt)} · faltan ${left} min`}
        </p>
      )}
      {gps && (
        <p className={styles.meta}>
          Según tu GPS estás a {gps.km} km: unos {gps.minutes} min sin tráfico.
        </p>
      )}
      {delaysLeft > 0 ? (
        <>
          <p className={late ? styles.arrivalAsk : styles.meta}>
            {late
              ? 'Avísale al cliente que vas en camino, para que no cancele sin pagarte el traslado:'
              : '¿Te vas a tardar? Avísale con un toque:'}
          </p>
          <div className={styles.workChips}>
            {DELAYS.map(([extra, label, note]) => (
              <button key={extra} type="button" disabled={busy} onClick={() => void delay(extra, note)}>
                {note} · {label}
              </button>
            ))}
          </div>
          <p className={styles.meta}>
            Puedes avisar {delaysLeft === 1 ? '1 vez más' : `${delaysLeft} veces`}.
          </p>
        </>
      ) : (
        <p className={styles.notice2}>
          Ya avisaste {MAX_DELAY_NOTICES} veces. Escríbele al cliente; si no llegas, puede cancelar sin
          pagar tu traslado.
        </p>
      )}
      <p className={styles.meta}>Mensaje rápido al cliente:</p>
      <div className={styles.workChips}>
        {QUICK.map((text) => (
          <button key={text} type="button" disabled={busy} aria-pressed={said === text} onClick={() => void say(text)}>
            {text}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

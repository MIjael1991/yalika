'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  dateTimeLabel,
  isTrackable,
  presenteApi,
  requestStatusLabel,
  trackingText,
  tradeLabel,
  type HelpRequestSummary,
} from '@/lib/yalika-presente';

import styles from './presente.module.css';

function RequestRow({ r, live }: { r: HelpRequestSummary; live: boolean }) {
  const text = trackingText(r);
  return (
    <Link href={`/tequio/pedido/${r.id}`} className={`${styles.request} ${styles.requestLink}`}>
      <h3>{r.trades.map(tradeLabel).join(' + ')}</h3>
      {live ? (
        <div className={styles.trackLine}>
          <strong>{text.title}</strong>
          {text.detail && <span>{text.detail}</span>}
        </div>
      ) : null}
      <div className={styles.tags}>
        <span className={`${styles.tag} ${live ? styles.tagLive : ''}`}>{requestStatusLabel(r.status)}</span>
        {r.placeLabel && <span className={styles.tag}>{r.placeLabel}</span>}
        {r.scheduledFor && <span className={styles.tag}>{dateTimeLabel(r.scheduledFor)}</span>}
        {!live && <span className={styles.tag}>{dateTimeLabel(r.createdAt)}</span>}
      </div>
    </Link>
  );
}

/** Todo lo que he pedido: primero lo que sigue en curso, luego lo anterior. */
export function MyRequests() {
  const [items, setItems] = useState<HelpRequestSummary[] | null>(null);

  useEffect(() => {
    let live = true;
    presenteApi
      .myRequests()
      .then((list) => live && setItems(list))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);

  if (items === null) return <p className={styles.meta}>Cargando…</p>;
  if (!items.length) {
    return (
      <section className={styles.card}>
        <p className={styles.empty}>Todavía no has pedido nada.</p>
        <div className={styles.actions}>
          <Link href="/tequio/pedir" className={styles.primary}>
            Pedir ayuda
          </Link>
        </div>
      </section>
    );
  }
  const current = items.filter(isTrackable);
  const past = items.filter((r) => !isTrackable(r));
  return (
    <>
      {current.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>En curso</h2>
          {current.map((r) => (
            <RequestRow key={r.id} r={r} live />
          ))}
        </section>
      )}
      {past.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Anteriores</h2>
          {past.map((r) => (
            <RequestRow key={r.id} r={r} live={false} />
          ))}
        </section>
      )}
    </>
  );
}

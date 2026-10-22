'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  availabilityLabel,
  clockLabel,
  presenteApi,
  ratingLabel,
  tradeLabel,
  type FavoriteProvider,
} from '@/lib/yalika-presente';

import styles from './presente.module.css';

/** Mis trabajadores de confianza: pedirles directo, ahora o en su horario. */
export function Favorites() {
  const [items, setItems] = useState<FavoriteProvider[] | null>(null);

  useEffect(() => {
    let live = true;
    presenteApi
      .favorites()
      .then((list) => live && setItems(list))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);

  async function remove(id: string, name: string) {
    if (!window.confirm(`¿Quitar a ${name} de tus de confianza?`)) return;
    try {
      setItems(await presenteApi.removeFavorite(id));
    } catch {
      // Si falla, la lista se queda como estaba.
    }
  }

  if (!items?.length) return null;
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Mis de confianza</h2>
      {items.map((p) => (
        <article key={p.id} className={styles.request}>
          <h3>{p.displayName}</h3>
          <p className={styles.meta}>
            {ratingLabel(p.rating)} · {p.trades.map(tradeLabel).join(', ')}
          </p>
          <p className={styles.meta}>Atiende: {availabilityLabel(p.availability)}</p>
          <p>
            {!p.takingRequests ? (
              <span className={styles.badgeMuted}>No recibe pedidos por ahora</span>
            ) : p.busyUntil ? (
              <span className={styles.badgeWarn}>Ocupado hasta aprox. {clockLabel(p.busyUntil)}</span>
            ) : p.presentNow ? (
              <span className={styles.badge}>Presente ahora</span>
            ) : (
              <span className={styles.badgeMuted}>Ausente · puedes agendarle en su horario</span>
            )}
          </p>
          <div className={styles.actions}>
            {p.takingRequests && (
              <Link href={`/tequio/pedir?con=${p.id}`} className={styles.primary}>
                Pedirle a {p.displayName.split(' ')[0]}
              </Link>
            )}
            <button type="button" className={styles.link} onClick={() => remove(p.id, p.displayName)}>
              Quitar
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

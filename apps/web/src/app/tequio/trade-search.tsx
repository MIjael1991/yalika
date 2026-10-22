'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { presenteApi, searchTrades, tradeLabel, tradeLevel } from '@/lib/yalika-presente';

import { PresenteIcon } from './icons';
import { ProviderResults } from './provider-results';
import styles from './presente.module.css';
import { useArea } from './use-area';

/**
 * Buscador del inicio: escribes lo que necesitas y se activa «Pedir». Abajo salen los servicios
 * relacionados (con color los que tienen gente cerca, en tenue los que aún no) y, al elegir uno,
 * las personas y negocios verificados que lo hacen.
 */
export function TradeSearch() {
  const router = useRouter();
  const { municipality, setMunicipality, activity } = useArea();
  const [query, setQuery] = useState('');
  const [trade, setTrade] = useState('');
  // Lo que esta persona ya ha pedido antes (lo más reciente primero), para pedirlo de un toque.
  const [used, setUsed] = useState<string[]>([]);
  const typed = query.trim();
  const matches = typed ? searchTrades(typed, { hidePending: true }).slice(0, 10) : null;

  useEffect(() => {
    let live = true;
    presenteApi
      .myRequests()
      .then((list) => {
        if (!live) return;
        const seen: string[] = [];
        for (const r of list) {
          for (const t of r.trades) if (t !== 'OTRO' && !seen.includes(t)) seen.push(t);
        }
        setUsed(seen.slice(0, 6));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  /** «Pedir»: el servicio elegido, el que más se parece, o «Otra cosa» con lo que escribió. */
  function ask(event: FormEvent) {
    event.preventDefault();
    const key = trade || matches?.[0]?.[0];
    if (key) return router.push(`/tequio/pedir?oficio=${key}`);
    if (typed) router.push(`/tequio/pedir?oficio=OTRO&texto=${encodeURIComponent(typed.slice(0, 200))}`);
  }

  function chip(key: string, label: string) {
    const level = tradeLevel(activity, key);
    return (
      <button
        key={key}
        type="button"
        className={`${styles.chip} ${level === 'none' ? styles.chipDim : level === 'live' ? styles.chipLive : ''}`}
        aria-pressed={trade === key}
        title={level === 'none' ? 'Aún nadie conectado cerca' : undefined}
        onClick={() => setTrade(key)}
      >
        {label}
        {level === 'none' && <small> · aún nadie</small>}
      </button>
    );
  }

  return (
    <div className={styles.form}>
      <form className={styles.askRow} onSubmit={ask} role="search">
        <label className={`${styles.field} ${styles.ask}`}>
          <span className={styles.srOnly}>¿Qué necesitas?</span>
          <PresenteIcon name="buscar" />
          <input
            type="search"
            value={query}
            placeholder="¿Qué buscas?"
            onChange={(e) => {
              setQuery(e.target.value);
              setTrade('');
            }}
          />
        </label>
        <button type="submit" className={styles.askButton} disabled={!typed && !trade}>
          Pedir
        </button>
      </form>

      {!matches && used.length > 0 && (
        <div className={styles.chips} aria-label="Lo que ya has pedido">
          <span className={styles.chipsLabel}>Lo que ya has pedido:</span>
          {used.map((key) => chip(key, tradeLabel(key)))}
        </div>
      )}

      {matches && (
        <div className={styles.chips}>
          {matches.map(([key, label]) => chip(key, label))}
          {!matches.length && (
            <span className={styles.meta}>
              No está en la lista, pero puedes pedirlo: toca «Pedir» y descríbelo con tus palabras.
            </span>
          )}
        </div>
      )}

      {trade && (
        <ProviderResults trade={trade} municipality={municipality} onMunicipality={setMunicipality} />
      )}
    </div>
  );
}

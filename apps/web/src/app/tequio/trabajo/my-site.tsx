'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { presenteApi } from '@/lib/yalika-presente';

import styles from '../presente.module.css';

type Sites = { selectedId: string | null; sites: { id: string; name: string; slug: string }[] };

/** Mostrar en su perfil una de sus páginas publicadas en Yalika (Mis páginas). */
export function MySite() {
  const [data, setData] = useState<Sites | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    presenteApi
      .mySites()
      .then((loaded) => live && setData(loaded))
      .catch(() => live && setData({ selectedId: null, sites: [] }));
    return () => {
      live = false;
    };
  }, []);

  async function choose(siteId: string) {
    setBusy(true);
    setError('');
    try {
      setData(await presenteApi.setSite(siteId || null));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className={styles.meta}>Cargando…</p>;
  if (!data.sites.length) {
    return (
      <div className={styles.form}>
        <p className={styles.meta}>
          Con una página puedes mostrar todo lo que sabes hacer, tus trabajos y tus diseños. La
          gente la ve en tu perfil antes de elegirte.
        </p>
        <Link href="/sites" className={styles.secondary}>
          Crear mi página
        </Link>
      </div>
    );
  }
  return (
    <div className={styles.form}>
      <p className={styles.meta}>La gente la verá en tu perfil antes de elegirte.</p>
      <label className={styles.field}>
        Página que se muestra
        <select value={data.selectedId ?? ''} disabled={busy} onChange={(e) => choose(e.target.value)}>
          <option value="">No mostrar ninguna</option>
          {data.sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className={styles.hint}>{error}</p>}
    </div>
  );
}

'use client';

/* eslint-disable @next/next/no-img-element -- fotos privadas en data URL */

import { useEffect, useState } from 'react';

import { plural, presenteApi } from '@/lib/yalika-presente';

import styles from './presente.module.css';

/**
 * Fotos del problema (hasta 5): son privadas, así que se cargan al tocar. Con autoLoad se abren
 * solas (por ejemplo, cuando el trabajador va a poner su precio).
 */
export function RequestPhotos({
  requestId,
  count,
  autoLoad = false,
}: {
  requestId: string;
  count: number;
  autoLoad?: boolean;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!autoLoad || !count) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // Solo al abrir: load no cambia entre renders que importen aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, count, requestId]);

  if (!count) return null;

  async function load() {
    setBusy(true);
    setError('');
    try {
      const loaded: string[] = [];
      for (let n = 0; n < count; n += 1) {
        loaded.push((await presenteApi.requestPhoto(requestId, n)).dataUrl);
      }
      setPhotos(loaded);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron abrir las fotos.');
    } finally {
      setBusy(false);
    }
  }

  if (photos.length) {
    return (
      <div className={styles.thumbs}>
        {photos.map((src, i) => (
          <img key={i} src={src} alt={`Foto ${i + 1} del pedido`} />
        ))}
      </div>
    );
  }
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.secondary} disabled={busy} onClick={load}>
        {busy ? 'Abriendo…' : count === 1 ? 'Ver foto' : `Ver ${plural(count, 'foto', 'fotos')}`}
      </button>
      {error && <span className={styles.hint}>{error}</span>}
    </div>
  );
}

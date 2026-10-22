'use client';

import { useState } from 'react';

import { presenteApi } from '@/lib/yalika-presente';

import styles from './presente.module.css';

/** Agregar o quitar de «Mis de confianza». */
export function FavoriteButton({ providerId, initial }: { providerId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (on) await presenteApi.removeFavorite(providerId);
      else await presenteApi.addFavorite(providerId);
      setOn(!on);
    } catch {
      // Sin cambio si falla.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={styles.secondary}
      aria-pressed={on}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {on ? '♥ De confianza' : '♡ Agregar a mis de confianza'}
    </button>
  );
}

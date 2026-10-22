'use client';

import { useState, type FormEvent } from 'react';

import { presenteApi } from '@/lib/yalika-presente';

import styles from './presente.module.css';

/** Calificar con estrellas al terminar (de los dos lados). */
export function ReviewForm({
  requestId,
  title,
  onDone,
}: {
  requestId: string;
  title: string;
  onDone: () => void;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!stars) return setError('Elige de 1 a 5 estrellas.');
    setBusy(true);
    setError('');
    try {
      await presenteApi.review(requestId, stars, comment.trim() || undefined);
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
      setBusy(false);
    }
  }

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={send}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <div className={styles.stars} role="radiogroup" aria-label="Estrellas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} estrella${n === 1 ? '' : 's'}`}
            className={n <= stars ? styles.starOn : styles.starOff}
            onClick={() => setStars(n)}
          >
            ★
          </button>
        ))}
      </div>
      <label className={styles.field}>
        Comentario (opcional)
        <textarea value={comment} maxLength={300} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <p className={styles.hint}>{error}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? 'Guardando…' : 'Calificar'}
        </button>
      </div>
    </form>
  );
}

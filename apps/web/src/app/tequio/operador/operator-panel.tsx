'use client';

/* eslint-disable @next/next/no-img-element -- fotos privadas en data URL, sin optimizar */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  documentOptions,
  presenteApi,
  PresenteApiError,
  tradeLabel,
  type PresentePending,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';
import { AuthorityRecord } from './authority-record';
import { IdentityReviews } from './identity-reviews';
import { ProblemJobs } from './problem-jobs';
import { WalletTopup } from './wallet-topup';

export function OperatorPanel() {
  const [items, setItems] = useState<PresentePending[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [photos, setPhotos] = useState<Record<string, Record<string, string>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    presenteApi
      .pending()
      .then((list) => live && setItems(list))
      .catch((failure: unknown) => {
        if (!live) return;
        const status = failure instanceof PresenteApiError ? failure.status : 0;
        setLoadError(
          status === 403
            ? 'Esta pantalla es solo para el operador de Yalika.'
            : failure instanceof Error
              ? failure.message
              : 'No se pudo cargar la lista.',
        );
      });
    return () => {
      live = false;
    };
  }, []);

  async function showPhotos(item: PresentePending) {
    setBusy(`fotos-${item.id}`);
    setError('');
    try {
      const loaded: Record<string, string> = {};
      for (const kind of item.documents) {
        loaded[kind] = (await presenteApi.document(item.id, kind)).dataUrl;
      }
      setPhotos((current) => ({ ...current, [item.id]: loaded }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron abrir las fotos.');
    } finally {
      setBusy('');
    }
  }

  async function decide(item: PresentePending, approve: boolean) {
    const note = notes[item.id]?.trim();
    if (!approve && !note) {
      setError('Escribe el motivo del rechazo para que la persona sepa qué corregir.');
      return;
    }
    setBusy(`decision-${item.id}`);
    setError('');
    setNotice('');
    try {
      await presenteApi.decide(item.id, approve, note || undefined);
      setItems((current) => (current ?? []).filter((i) => i.id !== item.id));
      setPhotos((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setNotice(
        `${item.displayName}: ${approve ? 'aprobado' : 'rechazado'}. Sus fotos se borraron.`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar la decisión.');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header>
          <p className={styles.eyebrow}>Yalika · Tequio · Operador</p>
          <h1 className={styles.title}>Revisar registros</h1>
          <p className={styles.sub}>
            Compara la selfie con la foto de la INE y que el nombre y la CURP coincidan. Al
            decidir, el INE se borra; la selfie se guarda cifrada para revalidar después.
          </p>
          <Link href="/tequio" className={styles.link}>
            Volver
          </Link>
        </header>
        {notice && <p className={styles.notice}>{notice}</p>}
        {(error || loadError) && (
          <p role="alert" className={styles.error}>
            {error || loadError}
          </p>
        )}
        {!loadError && <IdentityReviews />}
        {!loadError && <ProblemJobs />}
        {!loadError && <WalletTopup />}
        {!loadError && <AuthorityRecord />}
        {!loadError && items === null && <p className={styles.meta}>Cargando…</p>}
        {items?.length === 0 && <p className={styles.empty}>No hay registros esperando revisión.</p>}
        {items?.map((item) => (
          <section key={item.id} className={styles.card}>
            <h2 className={styles.cardTitle}>{item.displayName}</h2>
            <p className={styles.meta}>
              CURP {item.curp ?? 'sin dato'} · {item.age ?? '?'} años · {item.municipalityName ?? item.zoneLabel ?? 'sin municipio'}
            </p>
            <p className={styles.meta}>{item.trades.map(tradeLabel).join(', ')}</p>
            {item.bio && <p>{item.bio}</p>}
            {photos[item.id] ? (
              <div className={styles.photos}>
                {documentOptions.map(([kind, label]) =>
                  photos[item.id][kind] ? (
                    <figure key={kind} className={styles.photo}>
                      <img src={photos[item.id][kind]} alt={label} />
                      <figcaption>{label}</figcaption>
                    </figure>
                  ) : null,
                )}
              </div>
            ) : (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={Boolean(busy)}
                  onClick={() => showPhotos(item)}
                >
                  {busy === `fotos-${item.id}` ? 'Abriendo…' : 'Ver fotos'}
                </button>
              </div>
            )}
            <label className={styles.field}>
              Motivo (obligatorio si rechazas)
              <input
                value={notes[item.id] ?? ''}
                maxLength={300}
                onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
              />
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                disabled={Boolean(busy) || !photos[item.id]}
                onClick={() => decide(item, true)}
              >
                Aprobar
              </button>
              <button
                type="button"
                className={styles.danger}
                disabled={Boolean(busy)}
                onClick={() => decide(item, false)}
              >
                Rechazar
              </button>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

'use client';

/* eslint-disable @next/next/no-img-element -- fotos privadas en data URL */

import { useCallback, useEffect, useState } from 'react';

import {
  dateTimeLabel,
  presenteApi,
  tradeLabel,
  type PendingCredential,
  type PendingRecheck,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';
import { SepProofDocument } from '../sep-proof';

/**
 * Revisiones del operador además del registro: cédulas profesionales (título o cédula + selfie
 * con ella) y selfies para revalidar identidad (se comparan con la guardada).
 */
export function IdentityReviews() {
  const [credentials, setCredentials] = useState<PendingCredential[] | null>(null);
  const [rechecks, setRechecks] = useState<PendingRecheck[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([presenteApi.pendingCredentials(), presenteApi.pendingRechecks()]);
      setCredentials(c);
      setRechecks(r);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron cargar.');
    }
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([presenteApi.pendingCredentials(), presenteApi.pendingRechecks()])
      .then(([c, r]) => {
        if (!live) return;
        setCredentials(c);
        setRechecks(r);
      })
      .catch((failure: unknown) => {
        if (live) setError(failure instanceof Error ? failure.message : 'No se pudieron cargar.');
      });
    return () => {
      live = false;
    };
  }, []);

  async function show(id: string, loader: () => Promise<string[]>) {
    setBusy(`fotos-${id}`);
    try {
      const loaded = await loader();
      setPhotos((current) => ({ ...current, [id]: loaded }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron abrir las fotos.');
    } finally {
      setBusy('');
    }
  }

  async function decide(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setError('');
    try {
      await action();
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
    } finally {
      setBusy('');
    }
  }

  const noteField = (id: string) => (
    <label className={styles.field}>
      Motivo (obligatorio si rechazas)
      <input value={notes[id] ?? ''} maxLength={300} onChange={(e) => setNotes({ ...notes, [id]: e.target.value })} />
    </label>
  );

  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Cédulas profesionales</h2>
        <ol className={styles.list}>
          <li>Copia el número y búscalo en el Registro Nacional de Profesionistas (SEP).</li>
          <li>Que en la SEP salgan el mismo nombre de la persona y la misma profesión.</li>
          <li>Que la foto de la cédula muestre ese mismo número y nombre.</li>
          <li>Que la selfie sea la misma cara de su INE, con la cédula en la mano.</li>
          <li>
            Que el comprobante de la SEP diga lo mismo (si es la constancia en PDF, escanea su QR).
            Este se queda y lo ven sus clientes.
          </li>
        </ol>
        <p className={styles.meta}>Al decidir, la foto de la cédula y la selfie se borran.</p>
        {credentials?.length === 0 && <p className={styles.empty}>No hay cédulas esperando revisión.</p>}
        {credentials?.map((c) => (
          <article key={c.id} className={styles.request}>
            <h3>
              {c.displayName} · {tradeLabel(c.trade)}
              {c.kind === 'SEP_PROOF' && <span className={styles.tag}>Solo comprobante SEP nuevo</span>}
            </h3>
            <p className={styles.meta}>
              Cédula <strong>{c.licenseNumber}</strong> · mandada el {dateTimeLabel(c.submittedAt)} ·{' '}
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  void navigator.clipboard?.writeText(c.licenseNumber).catch(() => undefined);
                }}
              >
                Copiar número
              </button>{' '}
              ·{' '}
              <a href={c.lookupUrl} target="_blank" rel="noreferrer" className={styles.link}>
                Buscar en la SEP
              </a>
            </p>
            {photos[c.id] ? (
              <div className={styles.thumbs}>
                {photos[c.id].map((src, i) =>
                  src.startsWith('data:application/pdf') ? (
                    <SepProofDocument key={i} mime="application/pdf" dataUrl={src} />
                  ) : (
                    <img
                      key={i}
                      src={src}
                      alt={
                        i === photos[c.id].length - 1 && c.sepProofMime
                          ? 'Comprobante de la SEP'
                          : i
                            ? 'Selfie con la cédula'
                            : 'Título o cédula'
                      }
                    />
                  ),
                )}
              </div>
            ) : (
              <button
                type="button"
                className={styles.secondary}
                disabled={Boolean(busy)}
                onClick={() =>
                  show(c.id, async () => [
                    ...(c.kind === 'CREDENTIAL'
                      ? [
                          (await presenteApi.credentialPhoto(c.id, 'title')).dataUrl,
                          (await presenteApi.credentialPhoto(c.id, 'selfie')).dataUrl,
                        ]
                      : []),
                    ...(c.sepProofMime ? [(await presenteApi.credentialPhoto(c.id, 'sep')).dataUrl] : []),
                  ])
                }
              >
                {busy === `fotos-${c.id}` ? 'Abriendo…' : c.kind === 'CREDENTIAL' ? 'Ver fotos y comprobante' : 'Ver comprobante'}
              </button>
            )}
            {noteField(c.id)}
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={() => decide(c.id, () => presenteApi.decideCredential(c.id, true, notes[c.id]))}>
                {c.kind === 'CREDENTIAL' ? 'Aprobar cédula' : 'Aprobar comprobante'}
              </button>
              <button type="button" className={styles.danger} disabled={Boolean(busy)} onClick={() => decide(c.id, () => presenteApi.decideCredential(c.id, false, notes[c.id]))}>
                Rechazar
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Revalidar identidad</h2>
        <p className={styles.meta}>Compara la selfie nueva con la guardada: debe ser la misma persona.</p>
        {rechecks?.length === 0 && <p className={styles.empty}>No hay selfies esperando revisión.</p>}
        {rechecks?.map((r) => (
          <article key={r.providerId} className={styles.request}>
            <h3>{r.displayName}</h3>
            <p className={styles.meta}>
              {r.trades.map(tradeLabel).join(', ')} · mandada el {dateTimeLabel(r.sentAt)}
            </p>
            {photos[r.providerId] ? (
              <div className={styles.thumbs}>
                {photos[r.providerId].map((src, i) => (
                  <figure key={i}>
                    <img src={src} alt={i ? 'Selfie nueva' : 'Selfie guardada'} />
                    <figcaption className={styles.meta}>{i ? 'Nueva' : 'Guardada'}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className={styles.secondary}
                disabled={Boolean(busy)}
                onClick={() =>
                  show(r.providerId, async () => {
                    const saved = await presenteApi.document(r.providerId, 'SELFIE').catch(() => null);
                    const fresh = await presenteApi.document(r.providerId, 'SELFIE_RECHECK');
                    return [saved?.dataUrl ?? '', fresh.dataUrl].filter(Boolean);
                  })
                }
              >
                {busy === `fotos-${r.providerId}` ? 'Abriendo…' : 'Comparar selfies'}
              </button>
            )}
            {noteField(r.providerId)}
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={() => decide(r.providerId, () => presenteApi.decideRecheck(r.providerId, true, notes[r.providerId]))}>
                Es la misma persona
              </button>
              <button type="button" className={styles.danger} disabled={Boolean(busy)} onClick={() => decide(r.providerId, () => presenteApi.decideRecheck(r.providerId, false, notes[r.providerId]))}>
                Pedir otra selfie
              </button>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

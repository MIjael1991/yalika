'use client';

/* eslint-disable @next/next/no-img-element -- fotos privadas en data URL */

import { useEffect, useState, type ChangeEvent } from 'react';

import {
  photoKindLabel,
  photoKindOptions,
  photoToDataUrl,
  presenteApi,
  type PhotoInfo,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';

type MyPhoto = PhotoInfo & { providerId: string };

/** Fotos que ve la gente en tu perfil: tus trabajos, tu negocio y tus cursos (hasta 9). */
export function Portfolio() {
  const [photos, setPhotos] = useState<MyPhoto[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<string>('WORK');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    presenteApi
      .myPhotos()
      .then((list) => live && setPhotos(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    for (const photo of photos) {
      if (images[photo.id]) continue;
      presenteApi
        .providerPhoto(photo.providerId, photo.id)
        .then(({ dataUrl }) => {
          if (live) setImages((current) => ({ ...current, [photo.id]: dataUrl }));
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [photos, images]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setPhotos(await presenteApi.addPhoto(kind, await photoToDataUrl(file), caption.trim() || undefined));
      setCaption('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo subir la foto.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('¿Borrar esta foto?')) return;
    try {
      setPhotos(await presenteApi.deletePhoto(id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo borrar.');
    }
  }

  return (
    <div className={styles.form}>
      <p className={styles.meta}>
        Muestra tus trabajos, tu negocio o tus cursos (hasta 9 fotos). Las ve la gente antes de
        elegirte.
      </p>
      <div className={styles.chips}>
        {photoKindOptions.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={styles.chip}
            aria-pressed={kind === key}
            onClick={() => setKind(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className={styles.field}>
        Descripción de la foto (opcional)
        <input value={caption} maxLength={120} onChange={(e) => setCaption(e.target.value)} />
      </label>
      <label className={`${styles.secondary} ${styles.voice}`}>
        {busy ? 'Subiendo…' : 'Agregar foto'}
        <input type="file" accept="image/*" hidden disabled={busy || photos.length >= 9} onChange={upload} />
      </label>
      {error && <p className={styles.hint}>{error}</p>}
      {photos.length > 0 && (
        <div className={styles.gallery}>
          {photos.map((photo) => (
            <figure key={photo.id}>
              {images[photo.id] ? (
                <img src={images[photo.id]} alt={photo.caption ?? photoKindLabel(photo.kind)} />
              ) : (
                <div className={styles.photoLoading} />
              )}
              <figcaption>
                {photo.caption || photoKindLabel(photo.kind)}{' '}
                <button type="button" className={styles.link} onClick={() => remove(photo.id)}>
                  Borrar
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

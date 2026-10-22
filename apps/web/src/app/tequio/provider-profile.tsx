'use client';

/* eslint-disable @next/next/no-img-element -- fotos privadas en data URL */

import { useEffect, useState } from 'react';

import {
  availabilityLabel,
  photoKindLabel,
  plural,
  presenteApi,
  ratingLabel,
  tradeLabel,
  type ProviderProfile,
} from '@/lib/yalika-presente';

import styles from './presente.module.css';
import { SepProofDocument } from './sep-proof';

/** Perfil de un trabajador: descripción, estrellas, comentarios y fotos de su trabajo. */
export function ProviderProfileView({ providerId }: { providerId: string }) {
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [proofs, setProofs] = useState<Record<string, { mime: string; dataUrl: string } | 'loading' | 'error'>>({});
  const [error, setError] = useState('');

  async function openProof(trade: string) {
    setProofs((current) => ({ ...current, [trade]: 'loading' }));
    try {
      const { mime, dataUrl } = await presenteApi.providerSepProof(providerId, trade);
      setProofs((current) => ({ ...current, [trade]: { mime, dataUrl } }));
    } catch {
      setProofs((current) => ({ ...current, [trade]: 'error' }));
    }
  }

  useEffect(() => {
    let live = true;
    presenteApi
      .providerProfile(providerId)
      .then(async (loaded) => {
        if (!live) return;
        setProfile(loaded);
        for (const photo of loaded.photos) {
          try {
            const { dataUrl } = await presenteApi.providerPhoto(providerId, photo.id);
            if (live) setPhotos((current) => ({ ...current, [photo.id]: dataUrl }));
          } catch {
            // Una foto que no carga no detiene a las demás.
          }
        }
      })
      .catch((failure: unknown) => {
        if (live) setError(failure instanceof Error ? failure.message : 'No se pudo cargar el perfil.');
      });
    return () => {
      live = false;
    };
  }, [providerId]);

  if (error) return <p className={styles.hint}>{error}</p>;
  if (!profile) return <p className={styles.meta}>Cargando perfil…</p>;
  return (
    <div className={styles.profile}>
      <p>
        <strong>{ratingLabel(profile.rating)}</strong> ·{' '}
        {plural(profile.completedJobs, 'trabajo hecho', 'trabajos hechos')} por Tequio
      </p>
      {(profile.isBusiness || profile.delivers || profile.teaches) && (
        <p className={styles.meta}>
          {[
            profile.isBusiness && profile.businessName ? `Negocio: ${profile.businessName}` : null,
            profile.delivers ? 'Lleva a domicilio' : null,
            profile.teaches ? 'También da clases' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {profile.bio && <p>{profile.bio}</p>}
      {profile.license && (
        <div className={styles.license}>
          <strong>
            Cédula profesional {profile.license.number} · {profile.license.profession}
            {profile.license.specialty ? ` (${profile.license.specialty})` : ''}
          </strong>
          <span>
            Verificada por Yalika. Tú también puedes comprobarla en la{' '}
            <a href={profile.license.lookupUrl} target="_blank" rel="noreferrer">
              consulta de cédulas de la SEP
            </a>
            , y pedirle que te la muestre al llegar.
          </span>
        </div>
      )}
      {profile.credentials?.map((c) => (
        <div key={c.trade} className={styles.license}>
          <strong>
            {tradeLabel(c.trade)} · Cédula profesional {c.number}
          </strong>
          <span>
            Revisada por Yalika. Puedes comprobarla tú en la{' '}
            <a href={c.lookupUrl} target="_blank" rel="noreferrer">
              consulta de cédulas de la SEP
            </a>{' '}
            con el número {c.number}.
          </span>
          {c.sepProof &&
            (() => {
              const proof = proofs[c.trade];
              if (!proof || proof === 'error') {
                return (
                  <>
                    <button type="button" className={styles.secondary} onClick={() => void openProof(c.trade)}>
                      Ver su comprobante de la SEP
                    </button>
                    {proof === 'error' && <small>No se pudo abrir. Intenta de nuevo.</small>}
                  </>
                );
              }
              if (proof === 'loading') return <small>Abriendo…</small>;
              return (
                <>
                  <SepProofDocument mime={proof.mime} dataUrl={proof.dataUrl} />
                  <small>
                    ¿Es verdadero? Escanea con tu celular el código QR de la constancia, o busca el
                    número {c.number} en la consulta de la SEP: deben salir el mismo nombre y la
                    misma profesión.
                  </small>
                </>
              );
            })()}
        </div>
      ))}
      {profile.site && (
        <a className={styles.link} href={`/s/${profile.site.slug}`} target="_blank" rel="noreferrer">
          Ver su página: {profile.site.name}
        </a>
      )}
      <p className={styles.meta}>
        {profile.trades.map(tradeLabel).join(', ')} · {profile.municipalityName}
      </p>
      <p className={styles.meta}>Atiende: {availabilityLabel(profile.availability)}</p>
      {profile.photos.length > 0 && (
        <div className={styles.gallery}>
          {profile.photos.map((photo) => (
            <figure key={photo.id}>
              {photos[photo.id] ? (
                <img src={photos[photo.id]} alt={photo.caption ?? photoKindLabel(photo.kind)} />
              ) : (
                <div className={styles.photoLoading} />
              )}
              <figcaption>{photo.caption || photoKindLabel(photo.kind)}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {profile.reviews.length > 0 && (
        <ul className={styles.reviews}>
          {profile.reviews.map((r, i) => (
            <li key={i}>
              <span className={styles.starsSmall}>{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</span>
              {r.invoiceMissing && <span className={styles.reviewTag}>No entregó factura</span>}
              {r.comment && <span> {r.comment}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

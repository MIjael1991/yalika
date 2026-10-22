'use client';

/* eslint-disable @next/next/no-img-element -- vista previa local de la selfie */

import Link from 'next/link';
import { useEffect, useState, type ChangeEvent } from 'react';

import {
  changedLabel,
  dateTimeLabel,
  photoToDataUrl,
  plural,
  presenteApi,
  providerName,
  ratingLabel,
  statusLabel,
  tradeLabel,
  type HistoryItem,
  type PresenteProvider,
  type ProviderProfile,
} from '@/lib/yalika-presente';

import { Avatar } from '../tequio/icons';
import styles from '../tequio/presente.module.css';
import type { SecurityStatus } from './security-sections';

const credentialText = { PENDING: 'En revisión', VERIFIED: 'Aprobada', REJECTED: 'Hay que corregir' };

/** Quién soy: tu cuenta y cómo te ve la gente en Tequio. */
export function WhoAmI({
  status,
  provider,
  profile,
}: {
  status: SecurityStatus | null;
  provider: PresenteProvider | null;
  profile: ProviderProfile | null;
}) {
  const name = provider ? providerName(provider) : status?.name ?? '';
  return (
    <div className={styles.form}>
      <section className={styles.card}>
        <div className={styles.person}>
          <Avatar name={name || '?'} />
          <div className={styles.personBody}>
            <h2 className={styles.cardTitle}>{name || 'Tu cuenta'}</h2>
            {provider?.isBusiness && <p className={styles.meta}>Atiende {provider.displayName}</p>}
            <p className={styles.meta}>{status?.email}</p>
            <div className={styles.tags}>
              {provider ? (
                <span className={`${styles.tag} ${provider.status === 'VERIFIED' ? styles.tagLive : ''}`}>
                  {provider.status === 'VERIFIED' ? 'Verificado por Yalika' : statusLabel(provider.status)}
                </span>
              ) : (
                <span className={styles.tag}>Cuenta Yalika</span>
              )}
              {profile && <span className={styles.tag}>{ratingLabel(profile.rating)}</span>}
            </div>
          </div>
        </div>
        {provider?.bio && <p>{provider.bio}</p>}
        {provider && provider.trades.length > 0 && (
          <div className={styles.tags}>
            {provider.trades.map((t) => (
              <span key={t} className={styles.tag}>
                {tradeLabel(t)}
              </span>
            ))}
          </div>
        )}
        <div className={styles.actions}>
          <Link href="/cuenta?seccion=servicios" className={styles.primary}>
            {provider ? 'Cambiar lo que sé hacer' : 'Activar Tequio y ofrecer lo que sé'}
          </Link>
          <Link href="/tequio/mis-datos" className={styles.secondary}>
            Mis lugares
          </Link>
        </div>
      </section>
    </div>
  );
}

/** Verificación: identidad, revalidar cada cierto tiempo y cédulas. */
export function Verification({
  provider,
  onChange,
}: {
  provider: PresenteProvider | null;
  onChange: (provider: PresenteProvider) => void;
}) {
  const [selfie, setSelfie] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!provider) {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Verificación</h2>
        <p className={styles.meta}>
          Cuando actives Tequio para ofrecer tus servicios, aquí verás tu verificación con CURP,
          INE y selfie, y tus cédulas.
        </p>
        <div className={styles.actions}>
          <Link href="/cuenta?seccion=servicios" className={styles.primary}>
            Activar Tequio
          </Link>
        </div>
      </section>
    );
  }

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setSelfie(await photoToDataUrl(file));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo preparar la foto.');
    }
  }

  async function send() {
    setBusy(true);
    setError('');
    try {
      onChange(await presenteApi.sendRecheck(selfie));
      setSelfie('');
      setNotice('Recibimos tu selfie. La revisamos y te avisamos.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo mandar.');
    } finally {
      setBusy(false);
    }
  }

  const check = provider.identityCheck;
  const steps: [string, boolean][] = [
    ['CURP', Boolean(provider.curpMasked)],
    ['Permiso de foto', provider.consentGiven],
    ['INE y selfie revisadas', provider.status === 'VERIFIED' || provider.status === 'WITHDRAWN'],
  ];

  return (
    <div className={styles.form}>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Mi identidad</h2>
        <p>
          Estado: <strong>{statusLabel(provider.status)}</strong>
          {provider.curpMasked ? ` · CURP ${provider.curpMasked}` : ''}
        </p>
        <ul className={styles.checklist}>
          {steps.map(([label, ok]) => (
            <li key={label} data-ok={ok}>
              {label}
            </li>
          ))}
        </ul>
        {provider.status !== 'VERIFIED' && (
          <Link href="/cuenta?seccion=servicios" className={styles.link}>
            Completar mi verificación
          </Link>
        )}
      </section>

      {check && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Comprobar que sigues siendo tú</h2>
          <p className={styles.meta}>
            Cada 90 días te pedimos una selfie nueva para asegurarnos de que nadie más usa tu
            cuenta. La compara una persona de Yalika con la que tenemos guardada.
          </p>
          <p className={check.state === 'OK' ? styles.notice : check.state === 'PENDING' ? styles.notice : styles.notice2}>
            {check.state === 'OK'
              ? `Todo en orden. La próxima será antes del ${dateTimeLabel(check.dueAt)}.`
              : check.state === 'PENDING'
                ? 'Recibimos tu selfie; la estamos revisando.'
                : check.state === 'DUE'
                  ? `Ya toca. Mándala antes del ${dateTimeLabel(check.blockAt)} para seguir recibiendo trabajos.`
                  : 'Se venció: mándala para poder ponerte Presente otra vez.'}
          </p>
          {check.state !== 'PENDING' && (
            <>
              {selfie && <img className={styles.photoThumb} src={selfie} alt="Tu selfie nueva" />}
              <div className={styles.actions}>
                <label className={`${styles.secondary} ${styles.voice}`}>
                  {selfie ? 'Tomarla otra vez' : 'Tomar selfie'}
                  <input type="file" accept="image/*" capture="user" hidden onChange={pick} />
                </label>
                {selfie && (
                  <button type="button" className={styles.primary} disabled={busy} onClick={() => void send()}>
                    {busy ? 'Enviando…' : 'Mandar selfie'}
                  </button>
                )}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {notice && <p className={styles.notice}>{notice}</p>}
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Mis cédulas</h2>
        {provider.credentials?.length ? (
          <ul className={styles.plainList}>
            {provider.credentials.map((c) => (
              <li key={c.trade}>
                <span>
                  <strong>{tradeLabel(c.trade)}</strong> · {c.licenseNumber}
                </span>
                <span className={`${styles.tag} ${c.status === 'VERIFIED' ? styles.tagLive : ''}`}>
                  {credentialText[c.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.meta}>No has mandado cédulas.</p>
        )}
        <Link href="/cuenta?seccion=servicios" className={styles.link}>
          Agregar una cédula
        </Link>
      </section>
    </div>
  );
}

/** Desempeño e historial: estrellas, trabajos hechos, comentarios y todo lo que ha cambiado. */
export function Performance({
  provider,
  profile,
}: {
  provider: PresenteProvider | null;
  profile: ProviderProfile | null;
}) {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    if (!provider) return;
    let live = true;
    presenteApi
      .history()
      .then((items) => live && setHistory(items))
      .catch(() => live && setHistory([]));
    return () => {
      live = false;
    };
  }, [provider]);

  if (!provider) {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Desempeño</h2>
        <p className={styles.meta}>Cuando ofrezcas tus servicios, aquí verás tus estrellas, tus trabajos y tu historial.</p>
      </section>
    );
  }

  return (
    <div className={styles.form}>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Mi desempeño</h2>
        {profile ? (
          <div className={styles.stats}>
            <div>
              <strong>{profile.rating.average ? profile.rating.average.toFixed(1) : '—'}</strong>
              <span>{plural(profile.rating.count, 'calificación', 'calificaciones')}</span>
            </div>
            <div>
              <strong>{profile.completedJobs}</strong>
              <span>{profile.completedJobs === 1 ? 'trabajo hecho' : 'trabajos hechos'}</span>
            </div>
            <div>
              <strong>{profile.memberSince ? new Date(profile.memberSince).getFullYear() : '—'}</strong>
              <span>verificado desde</span>
            </div>
          </div>
        ) : (
          <p className={styles.meta}>Cuando te verifiquemos verás aquí tus estrellas y trabajos.</p>
        )}
        {profile?.reviews.length ? (
          <ul className={styles.reviews}>
            {profile.reviews.map((r, i) => (
              <li key={i}>
                <span className={styles.starsSmall}>
                  {'★'.repeat(r.stars)}
                  {'☆'.repeat(5 - r.stars)}
                </span>
                {r.comment && <span> {r.comment}</span>}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Historial</h2>
        <p className={styles.meta}>Todo lo que cambias y lo que Yalika revisa queda aquí.</p>
        {history === null ? (
          <p className={styles.meta}>Cargando…</p>
        ) : history.length === 0 ? (
          <p className={styles.empty}>Todavía no hay movimientos.</p>
        ) : (
          <ol className={styles.timeline}>
            {history.map((item, i) => (
              <li key={i} data-yalika={item.byYalika}>
                <strong>{item.label}</strong>
                <span>
                  {dateTimeLabel(item.at)}
                  {item.trade ? ` · ${tradeLabel(item.trade)}` : ''}
                  {item.changed.length ? ` · ${item.changed.map(changedLabel).join(', ')}` : ''}
                </span>
                {item.note && <small>{item.note}</small>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

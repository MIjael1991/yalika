'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  availabilityLabel,
  dateTimeLabel,
  isWithinAvailability,
  presenteApi,
  PresenteApiError,
  statusLabel,
  tradeLabel,
  type PresenteProvider,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';
import { CommissionInfo } from './commission-info';
import { NearbyWork } from './nearby-work';
import { FounderNote } from '../founder-note';
import { SafetyNote } from '../safety-note';
import { InvoicesCard } from './invoices-card';
import { OwedCard } from './owed-card';
import { WalletCard } from './wallet-card';

const HEARTBEAT_MS = 10 * 60 * 1000;
const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function WorkWorkspace() {
  const [provider, setProvider] = useState<PresenteProvider | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [loadStatus, setLoadStatus] = useState(0);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    presenteApi
      .me()
      .then((me) => {
        if (!live) return;
        setProvider(me);
      })
      .catch((failure: unknown) => {
        if (!live) return;
        const status = failure instanceof PresenteApiError ? failure.status : 0;
        setLoadStatus(status);
        setLoadError(
          status === 404
            ? 'Tequio todavía no está disponible para tu cuenta.'
            : errorText(failure, 'No pudimos cargar tu registro.'),
        );
      });
    return () => {
      live = false;
    };
  }, [reload]);

  const run = useCallback(
    async (label: string, action: () => Promise<PresenteProvider>, done: string) => {
      setBusy(label);
      setError('');
      setNotice('');
      try {
        const saved = await action();
        setProvider(saved);
        setNotice(done);
        return saved;
      } catch (failure) {
        setError(errorText(failure, 'No se pudo guardar. Intenta de nuevo.'));
        return null;
      } finally {
        setBusy('');
      }
    },
    [],
  );

  // Mientras está Presente y la pantalla abierta, avisa cada 10 minutos que sigue ahí.
  const present = provider?.status === 'VERIFIED' && provider.presence === 'PRESENT';
  useEffect(() => {
    if (!present) return;
    const timer = window.setInterval(() => {
      presenteApi.setPresence(true).then(setProvider).catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [present]);

  const header = (
    <header>
      <p className={styles.eyebrow}>Yalika · Tequio</p>
      <h1 className={styles.title}>Ofrecer mis servicios</h1>
      <p className={styles.sub}>
        Personas y negocios verificados por Yalika. Te encuentran en tu zona, con confianza.
      </p>
      <Link href="/tequio" className={styles.link}>
        Volver
      </Link>
    </header>
  );

  if (loadError) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          {header}
          <div role="alert" className={styles.error}>
            {loadStatus === 401 ? 'Inicia sesión para continuar. ' : `${loadError} `}
            {loadStatus === 401 ? (
              <Link href="/login" className={styles.link}>
                Iniciar sesión
              </Link>
            ) : (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setLoadError('');
                  setProvider(undefined);
                  setReload((n) => n + 1);
                }}
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (provider === undefined) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          {header}
          <p className={styles.meta}>Cargando…</p>
        </div>
      </main>
    );
  }

  const status = provider?.status ?? 'DRAFT';
  const check = provider?.identityCheck;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {header}
        {provider && <span className={styles.badge}>{statusLabel(status)}</span>}
        {notice && <p className={styles.notice}>{notice}</p>}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        {status !== 'VERIFIED' && status !== 'WITHDRAWN' && (
          <section className={`${styles.card} ${styles.workLink}`}>
            <div>
              <h2 className={styles.cardTitle}>
                {!provider
                  ? 'Activa Tequio en tu cuenta'
                  : status === 'PENDING_REVIEW'
                    ? 'Estamos revisando tus datos'
                    : status === 'SUSPENDED'
                      ? 'Tu cuenta de trabajo está suspendida'
                      : 'Termina tu registro'}
              </h2>
              <p className={styles.meta}>
                {!provider
                  ? 'En Cuenta › Lo que sé hacer pones tus datos, lo que sabes hacer, tus fotos y tu cédula si eres profesionista. Te verificamos una vez y aquí recibes pedidos.'
                  : status === 'PENDING_REVIEW'
                    ? 'Cuando terminemos podrás ponerte Presente aquí.'
                    : status === 'SUSPENDED'
                      ? provider.reviewNote ?? ''
                      : 'Te falta completar tus datos o tus fotos en Cuenta › Lo que sé hacer.'}
              </p>
              {!provider && <FounderNote />}
            </div>
            {status !== 'SUSPENDED' && (
              <Link href="/cuenta?seccion=servicios" className={styles.primary}>
                {provider ? 'Ir a Lo que sé hacer' : 'Activar Tequio'}
              </Link>
            )}
          </section>
        )}

        {status === 'WITHDRAWN' && provider && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Te diste de baja</h2>
            <p>
              Tu registro está guardado: tu verificación, tus estrellas, tus fotos y tu saldo.
              Vuelve cuando quieras, sin llenar nada otra vez.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                disabled={Boolean(busy)}
                onClick={() =>
                  run('volver', presenteApi.comeBack, 'Volviste. Ya puedes ponerte Presente.')
                }
              >
                {busy === 'volver' ? 'Un momento…' : 'Volver a ofrecer mis servicios'}
              </button>
            </div>
          </section>
        )}

        {status === 'VERIFIED' && check && check.state !== 'OK' && (
          <p className={check.state === 'PENDING' ? styles.notice : styles.notice2}>
            {check.state === 'PENDING'
              ? 'Recibimos tu selfie para revalidar tu identidad; la estamos revisando.'
              : check.state === 'OVERDUE'
                ? 'Toca revalidar tu identidad: manda una selfie nueva para poder ponerte Presente.'
                : `Antes del ${dateTimeLabel(check.blockAt)} manda una selfie nueva para revalidar tu identidad.`}{' '}
            {check.state !== 'PENDING' && (
              <Link href="/cuenta?seccion=verificacion" className={styles.link}>
                Mandar selfie
              </Link>
            )}
          </p>
        )}

        {status === 'VERIFIED' && provider && (
          <section className={styles.card}>
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={provider.presence === 'PRESENT'}
              disabled={Boolean(busy)}
              onClick={() =>
                run(
                  'presencia',
                  () => presenteApi.setPresence(provider.presence !== 'PRESENT'),
                  provider.presence === 'PRESENT'
                    ? 'Quedaste Ausente. No te llegarán trabajos.'
                    : 'Estás Presente. Te pueden llegar trabajos cerca.',
                )
              }
            >
              <strong>{provider.presence === 'PRESENT' ? 'Presente' : 'Ausente'}</strong>
              <span>
                {provider.presence === 'PRESENT' ? 'Toca para ponerte Ausente' : 'Toca para ponerte Presente'}
              </span>
            </button>
            <p className={styles.meta}>
              {provider.trades.map(tradeLabel).join(', ')} ·{' '}
              {provider.municipalityName ?? 'Sin municipio'} · hasta {provider.radiusKm} km
            </p>
            <p className={styles.meta}>{availabilityLabel(provider.availability)}</p>
            {!isWithinAvailability(provider.availability, new Date()) && (
              <p className={styles.extraDay}>
                {provider.presence === 'PRESENT'
                  ? 'Estás trabajando fuera de tu horario: te llegan pedidos de lo que sabes hacer cerca de ti.'
                  : 'Hoy está fuera de tu horario. ¿Quieres ganarte algo extra? Ponte Presente y te llegan pedidos de lo que sabes hacer cerca de ti.'}
              </p>
            )}
            <p className={styles.meta}>
              Si cierras la app más de 30 minutos, pasas solo a Ausente para no dejar plantado a
              nadie.{' '}
              <Link href="/cuenta?seccion=servicios" className={styles.link}>
                Cambiar lo que sé hacer
              </Link>
            </p>
          </section>
        )}

        {status === 'VERIFIED' && provider && (
          <NearbyWork present={provider.presence === 'PRESENT'} />
        )}

        {status === 'VERIFIED' && <WalletCard />}
        {status === 'VERIFIED' && <OwedCard />}
        {provider && <InvoicesCard />}

        {status === 'VERIFIED' && (
          <CommissionInfo />
        )}

        {status === 'VERIFIED' && <SafetyNote side="worker" />}
      </div>
    </main>
  );
}

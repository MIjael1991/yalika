'use client';

import Link from 'next/link';
import { useState } from 'react';

import {
  presenteApi,
  statusLabel,
  tradeLabel,
  type PresenteProvider,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';

type Confirm = '' | 'baja' | 'borrar';

/**
 * Tus servicios en Tequio, dentro de Mis datos: darte de baja guarda tu registro
 * (verificación, estrellas, fotos y saldo) para que mañana puedas volver sin empezar de cero.
 */
export function ServicesCard({
  provider,
  onChange,
}: {
  provider: PresenteProvider | null;
  onChange: (provider: PresenteProvider | null) => void;
}) {
  const [confirm, setConfirm] = useState<Confirm>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function act(action: () => Promise<PresenteProvider | null>, done: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      onChange(await action());
      setNotice(done);
      setConfirm('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  if (!provider) {
    return (
      <section className={`${styles.card} ${styles.workLink}`}>
        <div>
          {notice && <p className={styles.notice}>{notice}</p>}
          <h2 className={styles.cardTitle}>¿Sabes hacer o enseñar algo?</h2>
          <p className={styles.meta}>
            Ofrece tus servicios a la gente de tu zona. Te verificamos una vez y tú decides tus días
            y horas.
          </p>
        </div>
        <Link href="/tequio/trabajo" className={styles.primary}>
          Ofrecer mis servicios
        </Link>
      </section>
    );
  }

  const withdrawn = provider.status === 'WITHDRAWN';

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Mis servicios en Tequio</h2>
      <div className={styles.tags}>
        <span className={`${styles.tag} ${withdrawn ? '' : styles.tagLive}`}>
          {withdrawn ? 'Dado de baja' : statusLabel(provider.status)}
        </span>
        {provider.trades.slice(0, 4).map((t) => (
          <span key={t} className={styles.tag}>
            {tradeLabel(t)}
          </span>
        ))}
      </div>
      {notice && <p className={styles.notice}>{notice}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {withdrawn ? (
        <>
          <p>
            Tu registro está guardado: tu verificación, tus estrellas, tus fotos y tu saldo. Cuando
            quieras, vuelve sin llenar nada otra vez.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={() =>
                act(presenteApi.comeBack, 'Volviste. Ya puedes ponerte Presente en tu panel.')
              }
            >
              {busy ? 'Un momento…' : 'Volver a ofrecer mis servicios'}
            </button>
          </div>
        </>
      ) : confirm === 'baja' ? (
        <div className={styles.confirmBox}>
          <strong>¿Dejar de ofrecer tus servicios?</strong>
          <p>
            Ya no aparecerás en las búsquedas ni te llegarán pedidos. Guardamos tu registro,
            verificación, estrellas, fotos y saldo para cuando quieras volver.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() =>
                act(presenteApi.withdraw, 'Te diste de baja. Tu registro quedó guardado.')
              }
            >
              {busy ? 'Un momento…' : 'Sí, darme de baja'}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setConfirm('')}>
              No, seguir
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Link href="/tequio/trabajo" className={styles.primary}>
            Ir a mi panel
          </Link>
          <button type="button" className={styles.secondary} onClick={() => setConfirm('baja')}>
            Dejar de ofrecer mis servicios
          </button>
        </div>
      )}

      {confirm === 'borrar' ? (
        <div className={styles.confirmBox}>
          <strong>¿Borrar tus datos de servicios para siempre?</strong>
          <p>
            Se borran tu registro, tus fotos y tus estrellas, y no se pueden recuperar. Si
            quieres volver, tendrás que registrarte y verificarte otra vez.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await presenteApi.deleteForever();
                  return null;
                }, 'Tus datos de servicios se borraron.')
              }
            >
              Sí, borrar para siempre
            </button>
            <button type="button" className={styles.secondary} onClick={() => setConfirm('')}>
              No
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.linkQuiet} onClick={() => setConfirm('borrar')}>
          Borrar mis datos de servicios para siempre
        </button>
      )}
    </section>
  );
}

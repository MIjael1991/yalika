'use client';

import { useState, type FormEvent } from 'react';

import styles from '../tequio/presente.module.css';

export type SecurityStatus = {
  email?: string;
  name?: string;
  recoveryPhone?: string | null;
  recoveryPhoneVerified?: boolean;
  emailDeliveryAvailable?: boolean;
  recoveryKeyConfigured?: boolean;
  recoveryKeyUpdatedAt?: string | null;
  passwordChangedAt?: string | null;
  passwordMinLength?: number;
};

type ApiError = { message?: string | string[] };

function messageOf(payload: ApiError | null, fallback: string) {
  if (Array.isArray(payload?.message)) return payload.message.join('. ');
  return payload?.message ?? fallback;
}

/** Llamada a la cuenta (auth) del API de Yalika. */
async function authCall<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/yalika/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as (T & ApiError) | null;
  if (!response.ok) throw new Error(messageOf(payload, 'No se pudo completar.'));
  return payload as T;
}

export const loadSecurity = () => authCall<SecurityStatus>('security');

const dateLabel = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' })
    : 'nunca';

/** Contraseña: cambiarla (con la actual) y cerrar sesión en otros equipos. */
export function PasswordSection({ status }: { status: SecurityStatus | null }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [closeOthers, setCloseOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (next.length < 10) return setError('La nueva contraseña debe tener al menos 10 caracteres.');
    if (next !== confirm) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    try {
      const result = await authCall<ApiError>('password/change', {
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
        closeOtherSessions: closeOthers,
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      setNotice(messageOf(result, 'Contraseña actualizada.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cambiar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={save}>
      <h2 className={styles.cardTitle}>Contraseña</h2>
      <p className={styles.meta}>Último cambio: {dateLabel(status?.passwordChangedAt)}.</p>
      <label className={styles.field}>
        Contraseña actual
        <input type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          Nueva contraseña
          <input type={show ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} placeholder="Mínimo 10 caracteres" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className={styles.field}>
          Repítela
          <input type={show ? 'text' : 'password'} autoComplete="new-password" maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
      </div>
      {confirm && (
        <p className={next === confirm ? styles.done : styles.hint}>
          {next === confirm ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
        </p>
      )}
      <label className={styles.check}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        <span>Mostrar las contraseñas mientras escribo</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={closeOthers} onChange={(e) => setCloseOthers(e.target.checked)} />
        <span>Cerrar sesión en mis otros equipos (recomendado si alguien más pudo verla)</span>
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && <p className={styles.notice}>{notice}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy || !current || next.length < 10 || next !== confirm}>
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </div>
    </form>
  );
}

/** Correo y recuperación: cambiar el correo, teléfono de recuperación y clave de respaldo. */
export function RecoverySection({
  status,
  onStatus,
}: {
  status: SecurityStatus | null;
  onStatus: (status: SecurityStatus) => void;
}) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState<'' | 'email' | 'phone'>('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [confirmKey, setConfirmKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function act(action: () => Promise<SecurityStatus>, done: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      onStatus(await action());
      setNotice(done);
      setEditing('');
      setPassword('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  async function newKey() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await authCall<{ recoveryKey?: string; warning?: string }>('recovery-key', {});
      setRecoveryKey(String(result.recoveryKey ?? ''));
      setNotice(String(result.warning ?? 'Guarda la clave en un lugar seguro.'));
      setConfirmKey(false);
      onStatus(await loadSecurity());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo crear la clave.');
    } finally {
      setBusy(false);
    }
  }

  const passwordField = (
    <label className={styles.field}>
      Tu contraseña actual (para confirmar que eres tú)
      <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
    </label>
  );

  return (
    <div className={styles.form}>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && <p className={styles.notice}>{notice}</p>}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Correo</h2>
        <p>
          Entras con <strong>{status?.email ?? '…'}</strong>
        </p>
        <p className={styles.meta}>
          Recuperar por correo: {status?.emailDeliveryAvailable ? 'disponible' : 'todavía no está activo'}.
        </p>
        {editing === 'email' ? (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => authCall('email/change', { newEmail: email.trim(), currentPassword: password }), 'Tu correo quedó cambiado. Desde ahora entras con el nuevo.');
            }}
          >
            <label className={styles.field}>
              Correo nuevo
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {passwordField}
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy || !email.includes('@') || !password}>
                Cambiar correo
              </button>
              <button type="button" className={styles.secondary} onClick={() => setEditing('')}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setEditing('email')}>
              Cambiar correo
            </button>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Teléfono de recuperación</h2>
        <p>
          {status?.recoveryPhone ? (
            <>
              <strong>{status.recoveryPhone.replace(/^\+52(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3')}</strong>{' '}
              <span className={`${styles.tag} ${status.recoveryPhoneVerified ? styles.tagLive : ''}`}>
                {status.recoveryPhoneVerified ? 'Verificado' : 'Guardado'}
              </span>
            </>
          ) : (
            'Todavía no tienes un teléfono guardado.'
          )}
        </p>
        <p className={styles.meta}>
          Se usará para mandarte un código si pierdes el acceso. El envío de códigos por mensaje se
          activa muy pronto; por ahora recuperas con tu correo o con tu clave de recuperación.
        </p>
        {editing === 'phone' ? (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => authCall('recovery-phone', { phone, currentPassword: password }), 'Tu teléfono quedó guardado.');
            }}
          >
            <label className={styles.field}>
              Celular (10 dígitos)
              <input inputMode="tel" autoComplete="tel-national" maxLength={14} value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+]/g, ''))} />
            </label>
            {passwordField}
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy || phone.replace(/\D/g, '').length < 10 || !password}>
                Guardar teléfono
              </button>
              {status?.recoveryPhone && (
                <button
                  type="button"
                  className={styles.danger}
                  disabled={busy || !password}
                  onClick={() => void act(() => authCall('recovery-phone/remove', { currentPassword: password }), 'Quitamos tu teléfono.')}
                >
                  Quitar teléfono
                </button>
              )}
              <button type="button" className={styles.secondary} onClick={() => setEditing('')}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setEditing('phone')}>
              {status?.recoveryPhone ? 'Cambiar teléfono' : 'Agregar teléfono'}
            </button>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Clave de recuperación</h2>
        <p>
          {status?.recoveryKeyConfigured
            ? `La creaste el ${dateLabel(status.recoveryKeyUpdatedAt)}.`
            : 'Todavía no tienes una clave de recuperación.'}
        </p>
        <p className={styles.meta}>
          Es tu respaldo si pierdes el correo. Guárdala fuera de este teléfono: en papel o con
          alguien de confianza. Se muestra una sola vez.
        </p>
        {recoveryKey && (
          <div className={styles.notice2}>
            <p>Guárdala ahora:</p>
            <code className={styles.code}>{recoveryKey}</code>
          </div>
        )}
        {status?.recoveryKeyConfigured && !confirmKey ? (
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setConfirmKey(true)}>
              Crear una clave nueva
            </button>
          </div>
        ) : (
          <div className={styles.actions}>
            {status?.recoveryKeyConfigured && <span className={styles.meta}>La anterior dejará de servir.</span>}
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void newKey()}>
              {status?.recoveryKeyConfigured ? 'Sí, crear clave nueva' : 'Crear clave de recuperación'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

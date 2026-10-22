'use client';

import { useCallback, useState, type ChangeEvent } from 'react';

import {
  documentOptions,
  missingLabel,
  photoToDataUrl,
  presenteApi,
  tradeLabel,
  type PresenteProvider,
} from '@/lib/yalika-presente';

import { FounderNote } from '../founder-note';
import { ServicesCard } from '../mis-datos/services-card';
import styles from '../presente.module.css';
import { CommissionInfo } from './commission-info';
import { CredentialsCard } from './credentials-card';
import { MySite } from './my-site';
import { Portfolio } from './portfolio';
import { ProfileForm } from './profile-form';

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/**
 * Lo que sé hacer (en Cuenta): aquí se activa Tequio. Datos de trabajo, permiso y fotos de
 * verificación, cédulas profesionales, fotos de tu trabajo, tu página y darte de baja.
 * Puedes editar tus cosas; cada cambio queda en tu historial.
 */
export function ServicesSetup({
  provider,
  onChange,
}: {
  provider: PresenteProvider | null;
  onChange: (provider: PresenteProvider | null) => void;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Profesión elegida en «¿Qué sabes hacer?»: se le pide su cédula en el mismo registro.
  const [requested, setRequested] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const setProvider = onChange;

  function askCredential(key: string) {
    setChosen((list) => (list.includes(key) ? list : [...list, key]));
    setRequested(key);
    window.setTimeout(() => {
      document.getElementById('mis-cedulas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  const run = useCallback(
    async (label: string, action: () => Promise<PresenteProvider>, done: string) => {
      setBusy(label);
      setError('');
      setNotice('');
      try {
        const saved = await action();
        onChange(saved);
        setNotice(done);
        return saved;
      } catch (failure) {
        setError(errorText(failure, 'No se pudo guardar. Intenta de nuevo.'));
        return null;
      } finally {
        setBusy('');
      }
    },
    [onChange],
  );

  async function uploadPhoto(kind: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await run(
      kind,
      async () => presenteApi.uploadDocument(kind, await photoToDataUrl(file)),
      'Foto guardada.',
    );
  }

  const status = provider?.status ?? 'DRAFT';
  const sent = (provider?.credentials ?? []).filter((c) => c.status !== 'REJECTED').map((c) => c.trade);
  const unsent = chosen.filter((key) => !sent.includes(key));
  const showCredentials = chosen.length > 0 || (provider?.credentials?.length ?? 0) > 0;
  const editable = !provider || status === 'DRAFT' || status === 'REJECTED';
  const reload = () => {
    presenteApi
      .me()
      .then(onChange)
      .catch(() => undefined);
  };

  return (
    <div className={styles.form}>
      {!provider && (
        <section className={`${styles.card} ${styles.workLink}`}>
          <div>
            <h2 className={styles.cardTitle}>Activa Tequio</h2>
            <p className={styles.meta}>
              Ofrece lo que sabes hacer o enseñar: un oficio, tu profesión, tu negocio o clases, sin
              límite. Te verificamos una vez y atiendes en tus días y horas libres.
            </p>
          </div>
        </section>
      )}
      {notice && <p className={styles.notice}>{notice}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {status === 'REJECTED' && provider?.reviewNote && (
        <p className={styles.error}>Hay que corregir: {provider.reviewNote}</p>
      )}

        {editable && (
          <>
            <FounderNote />
            <section className={styles.card}>
              <p className={styles.step}>Paso 1</p>
              <h2 className={styles.cardTitle}>Tus datos de trabajo</h2>
              <ProfileForm
                key={provider?.id ?? 'nuevo'}
                provider={provider}
                verified={false}
                onSaved={setProvider}
                onProfession={askCredential}
                professions={unsent}
              />
            </section>

            {provider && (
              <section className={styles.card}>
                <p className={styles.step}>Paso 2</p>
                <h2 className={styles.cardTitle}>Permiso para usar tu foto</h2>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={provider.consentGiven}
                    disabled={Boolean(busy)}
                    onChange={(e) =>
                      run(
                        'permiso',
                        () => presenteApi.setConsent(e.target.checked),
                        e.target.checked ? 'Permiso guardado.' : 'Permiso retirado; tu selfie se borró.',
                      )
                    }
                  />
                  <span>
                    Acepto que Yalika use mi INE y mi selfie solo para comprobar que soy yo. Una
                    persona del equipo las revisa. El INE se borra al terminar la revisión; mi
                    selfie se guarda cifrada para comprobar, cada cierto tiempo, que sigo siendo
                    yo y que nadie más usa mi cuenta. Puedo retirar este permiso antes de la
                    revisión.
                  </span>
                </label>
              </section>
            )}

            {provider && (
              <section className={styles.card}>
                <p className={styles.step}>Paso 3</p>
                <h2 className={styles.cardTitle}>Tus fotos</h2>
                <p className={styles.meta}>
                  Con buena luz y sin reflejos. La selfie, de frente y sin lentes oscuros.
                </p>
                <div className={styles.photos}>
                  {documentOptions.map(([kind, label, camera]) => {
                    const done = provider.documents.includes(kind);
                    const blocked = kind === 'SELFIE' && !provider.consentGiven;
                    return (
                      <label key={kind} className={styles.photo}>
                        <strong>{label}</strong>
                        <span className={done ? styles.done : styles.meta}>
                          {busy === kind
                            ? 'Subiendo…'
                            : done
                              ? 'Lista'
                              : blocked
                                ? 'Primero da el permiso del paso 2'
                                : 'Falta'}
                        </span>
                        <span
                          className={styles.secondary}
                          aria-disabled={blocked || Boolean(busy)}
                        >
                          {done ? 'Cambiar foto' : 'Tomar foto'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture={camera}
                          hidden
                          disabled={blocked || Boolean(busy)}
                          onChange={(e) => uploadPhoto(kind, e)}
                        />
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {provider && showCredentials && (
              <CredentialsCard
                key={`registro-${requested}`}
                step="Paso 3 · Tu cédula"
                requested={requested}
                credentials={provider.credentials ?? []}
                consentGiven={provider.consentGiven}
                onChange={reload}
              />
            )}

            <CommissionInfo />

            {provider && (
              <section className={styles.card}>
                <p className={styles.step}>Paso 4</p>
                <h2 className={styles.cardTitle}>Mandar a revisión</h2>
                {provider.missing.length || unsent.length ? (
                  <>
                    <p className={styles.meta}>Te falta:</p>
                    <ul className={styles.list}>
                      {provider.missing.map((code) => (
                        <li key={code}>{missingLabel(code)}</li>
                      ))}
                      {unsent.map((key) => (
                        <li key={key}>Tu cédula de {tradeLabel(key).toLowerCase()} (paso 3)</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className={styles.meta}>Todo listo. Revisamos tu registro lo antes posible.</p>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={Boolean(busy) || provider.missing.length > 0}
                    onClick={() =>
                      run('enviar', presenteApi.submit, 'Listo. Te avisamos cuando terminemos de revisar.')
                    }
                  >
                    {busy === 'enviar' ? 'Enviando…' : 'Mandar a revisión'}
                  </button>
                </div>
              </section>
            )}
          </>
        )}


      {status === 'PENDING_REVIEW' && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Estamos revisando tus datos</h2>
          <p className={styles.meta}>
            Cuando terminemos podrás ponerte Presente. Mientras, puedes mandar tus cédulas.
          </p>
        </section>
      )}

      {status === 'VERIFIED' && provider && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Lo que sé hacer, zona y horario</h2>
          <p className={styles.meta}>Agrega o quita lo que haces cuando quieras; queda en tu historial.</p>
          <ProfileForm
            provider={provider}
            verified
            onSaved={setProvider}
            onProfession={askCredential}
            professions={unsent}
          />
        </section>
      )}

      {provider && !editable && !['SUSPENDED', 'WITHDRAWN'].includes(status) && (
        <CredentialsCard
          key={`cuenta-${requested}`}
          requested={requested}
          credentials={provider.credentials ?? []}
          consentGiven={provider.consentGiven}
          onChange={reload}
        />
      )}
      {provider && !['SUSPENDED', 'WITHDRAWN'].includes(status) && (
        <>
          <details className={styles.category}>
            <summary>
              <span>
                <strong>Fotos de mi trabajo</strong>
                <small>Trabajos, tu negocio, tus cursos o tu título</small>
              </span>
            </summary>
            <div className={styles.card}>
              <Portfolio />
            </div>
          </details>
          <details className={styles.category}>
            <summary>
              <span>
                <strong>Mi página web</strong>
                <small>Muestra todo lo que sabes hacer y tus diseños</small>
              </span>
            </summary>
            <div className={styles.card}>
              <MySite />
            </div>
          </details>
        </>
      )}

      {status === 'SUSPENDED' && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Tu cuenta de trabajo está suspendida</h2>
          {provider?.reviewNote && <p className={styles.meta}>Motivo: {provider.reviewNote}</p>}
        </section>
      )}

      {/* Darse de baja o borrar: ya que se mandó el registro, para no confundir a quien empieza */}
      {provider && !editable && <ServicesCard provider={provider} onChange={onChange} />}
    </div>
  );
}

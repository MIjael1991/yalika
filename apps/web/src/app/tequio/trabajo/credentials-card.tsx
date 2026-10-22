'use client';

/* eslint-disable @next/next/no-img-element -- vista previa local de las fotos */

import { useState, type ChangeEvent, type FormEvent } from 'react';

import {
  needsLicense,
  needsTitle,
  photoToDataUrl,
  presenteApi,
  tradeKeys,
  tradeLabel,
  type ProCredential,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';
import { SepProofPicker } from '../sep-proof';

/** Todas las profesiones con cédula: ingenierías, leyes, contaduría... y también las de salud. */
const PROFESSIONS = tradeKeys.filter((key) => needsTitle(key) || needsLicense(key));

const proofText: Record<ProCredential['sepProof'], string> = {
  MISSING: 'Falta tu comprobante de la SEP',
  PENDING: 'Comprobante de la SEP en revisión',
  VERIFIED: 'Comprobante de la SEP visible para tus clientes',
};

const statusText: Record<ProCredential['status'], string> = {
  PENDING: 'En revisión',
  VERIFIED: 'Aprobada',
  REJECTED: 'Hay que corregir',
};

/**
 * Mis cédulas: para todo profesionista (ingeniería, contaduría, leyes, salud...). Se piden cuatro
 * cosas: el número de cédula, una foto de la cédula, una selfie con ella en la mano y el
 * comprobante de la SEP (constancia o captura de la consulta). Yalika la confirma en el Registro
 * Nacional de Profesionistas y, al aprobarla, la profesión aparece en lo que ofreces. El
 * comprobante de la SEP lo pueden ver sus clientes.
 */
export function CredentialsCard({
  credentials,
  consentGiven,
  onChange,
  requested = '',
  step,
}: {
  credentials: ProCredential[];
  consentGiven: boolean;
  onChange: () => void;
  /** Profesión que acaba de elegir en «¿Qué sabes hacer?». */
  requested?: string;
  /** En el registro: «Paso 3», etc. */
  step?: string;
}) {
  const [trade, setTrade] = useState(requested);
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [selfie, setSelfie] = useState('');
  const [proof, setProof] = useState('');
  /** Comprobante para una cédula ya mandada que no lo tenía. */
  const [proofFor, setProofFor] = useState('');
  const [laterProof, setLaterProof] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function pick(event: ChangeEvent<HTMLInputElement>, set: (value: string) => void) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      set(await photoToDataUrl(file));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo preparar la foto.');
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!trade) return setError('Elige tu profesión.');
    if (!/^\d{5,10}$/.test(number.trim())) return setError('Escribe el número de tu cédula (solo números).');
    if (!title) return setError('Toma la foto de tu cédula.');
    if (!selfie) return setError('Tómate la selfie con tu cédula en la mano.');
    if (!proof) return setError('Sube tu comprobante de la SEP (constancia en PDF o captura de la consulta).');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await presenteApi.sendCredential({
        trade,
        licenseNumber: number.trim(),
        titlePhoto: title,
        selfiePhoto: selfie,
        sepProof: proof,
      });
      setNotice('Listo. La confirmamos en el registro de la SEP y te avisamos.');
      setTrade('');
      setNumber('');
      setTitle('');
      setSelfie('');
      setProof('');
      onChange();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo mandar.');
    } finally {
      setBusy(false);
    }
  }

  async function sendLaterProof(key: string) {
    if (!laterProof) return setError('Sube el PDF o la captura de la SEP.');
    setBusy(true);
    setError('');
    try {
      await presenteApi.sendSepProof(key, laterProof);
      setNotice('Listo. Lo revisamos y después lo verán tus clientes.');
      setProofFor('');
      setLaterProof('');
      onChange();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo mandar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(key: string) {
    setBusy(true);
    try {
      await presenteApi.removeCredential(key);
      onChange();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo quitar.');
    } finally {
      setBusy(false);
    }
  }

  const available = PROFESSIONS.filter(
    (key) => !credentials.some((c) => c.trade === key && c.status !== 'REJECTED'),
  );

  return (
    <section className={styles.card} id="mis-cedulas">
      {step && <p className={styles.step}>{step}</p>}
      <h2 className={styles.cardTitle}>Mi cédula profesional</h2>
      <p className={styles.meta}>
        Si eres profesionista (ingeniería, contaduría, arquitectura, leyes, psicología, nutrición,
        fisioterapia, medicina, enfermería o veterinaria) te pedimos cuatro cosas. Una persona de
        Yalika la confirma en el Registro Nacional de Profesionistas de la SEP: que el número exista
        y que sea tuya.
      </p>

      {credentials.length > 0 && (
        <ul className={styles.plainList}>
          {credentials.map((c) => (
            <li key={c.trade}>
              <span>
                <strong>{tradeLabel(c.trade)}</strong> · cédula {c.licenseNumber}
                {c.reviewNote ? <small> · {c.reviewNote}</small> : null}
              </span>
              <span className={`${styles.tag} ${c.status === 'VERIFIED' ? styles.tagLive : c.status === 'REJECTED' ? styles.tagSun : ''}`}>
                {statusText[c.status]}
              </span>
              <button type="button" className={styles.link} disabled={busy} onClick={() => remove(c.trade)}>
                Quitar
              </button>
              {c.status !== 'REJECTED' && (
                <span className={c.sepProof === 'VERIFIED' ? styles.proofOk : styles.proofMissing}>
                  {proofText[c.sepProof]}
                  {c.sepProof !== 'PENDING' && proofFor !== c.trade && (
                    <button
                      type="button"
                      className={styles.link}
                      disabled={busy}
                      onClick={() => {
                        setProofFor(c.trade);
                        setLaterProof('');
                      }}
                    >
                      {c.sepProof === 'MISSING' ? 'Subirlo' : 'Cambiarlo'}
                    </button>
                  )}
                </span>
              )}
              {proofFor === c.trade && (
                <div className={styles.proofLater}>
                  <SepProofPicker value={laterProof} onChange={setLaterProof} onError={setError} number={c.licenseNumber} />
                  <div className={styles.actions}>
                    <button type="button" className={styles.primary} disabled={busy || !laterProof} onClick={() => sendLaterProof(c.trade)}>
                      {busy ? 'Enviando…' : 'Mandar comprobante'}
                    </button>
                    <button type="button" className={styles.link} disabled={busy} onClick={() => setProofFor('')}>
                      Ahora no
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!consentGiven ? (
        <p className={styles.notice2}>
          Primero da tu permiso para usar tu foto (Paso 2) y aquí mismo mandas tu cédula.
        </p>
      ) : available.length > 0 ? (
        <form className={styles.form} onSubmit={send}>
          <label className={styles.field}>
            Tu profesión
            <select value={trade} onChange={(e) => setTrade(e.target.value)}>
              <option value="">Elige</option>
              {available.map((key) => (
                <option key={key} value={key}>
                  {tradeLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>
              <span className={styles.stepNum}>1</span> Tu número de cédula
            </span>
            <input
              inputMode="numeric"
              autoComplete="off"
              placeholder="Solo números, como aparece en tu cédula"
              value={number}
              maxLength={10}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className={styles.photos}>
            <label className={styles.photo}>
              <strong>
                <span className={styles.stepNum}>2</span> Foto de tu cédula
              </strong>
              {title ? (
                <img src={title} alt="Tu cédula" />
              ) : (
                <span className={styles.meta}>Completa y derecha, que se lean tu nombre y el número.</span>
              )}
              <span className={styles.secondary}>{title ? 'Cambiar foto' : 'Tomar foto'}</span>
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e, setTitle)} />
            </label>
            <label className={styles.photo}>
              <strong>
                <span className={styles.stepNum}>3</span> Selfie con tu cédula en la mano
              </strong>
              {selfie ? (
                <img src={selfie} alt="Tu selfie con la cédula" />
              ) : (
                <span className={styles.meta}>Tu cara y la cédula juntas, con buena luz.</span>
              )}
              <span className={styles.secondary}>{selfie ? 'Cambiar selfie' : 'Tomar selfie'}</span>
              <input type="file" accept="image/*" capture="user" hidden onChange={(e) => pick(e, setSelfie)} />
            </label>
          </div>
          <div className={styles.field}>
            <span>
              <span className={styles.stepNum}>4</span> Tu comprobante de la SEP
            </span>
            <SepProofPicker value={proof} onChange={setProof} onError={setError} number={number} />
          </div>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {notice && <p className={styles.notice}>{notice}</p>}
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Enviando…' : 'Mandar a revisión'}
            </button>
          </div>
          <p className={styles.meta}>
            La foto de tu cédula y tu selfie solo las ve una persona de Yalika y se borran al
            terminar. El comprobante de la SEP se queda en tu perfil para que tus clientes lo vean y
            lo comprueben.
          </p>
        </form>
      ) : (
        notice && <p className={styles.notice}>{notice}</p>
      )}
    </section>
  );
}

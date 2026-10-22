'use client';

/* eslint-disable @next/next/no-img-element -- fotos privadas en data URL */

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import {
  careLinks,
  clockLabel,
  dateTimeLabel,
  durationLabel,
  formatMxn,
  mapsLinks,
  MAX_JOB_MINUTES,
  MIN_PRICE_MXN,
  presenteApi,
  ratingLabel,
  toDateTimeInput,
  tradeLabel,
  type PresenteJob,
} from '@/lib/yalika-presente';

import { Chat } from '../chat';
import { MapView } from '../presente-map';
import styles from '../presente.module.css';
import { RequestPhotos } from '../request-photos';
import { ReviewForm } from '../stars';
import { ArrivalPanel } from './arrival-panel';

const titles: Record<string, string> = {
  ASSIGNED: 'Te eligieron',
  EN_ROUTE: 'Vas en camino',
  ARRIVED: 'Llegaste',
  IN_PROGRESS: 'Trabajando',
  COMPLETED: 'Trabajo terminado',
};

const askMinutes = (text: string, fallback: number) => {
  const answer = window.prompt(text, String(fallback));
  if (answer === null) return null;
  const n = Number(answer.trim());
  return Number.isInteger(n) && n > 0 ? n : NaN;
};

/** Proponer la siguiente visita: le llega al cliente para agendarla por Tequio. */
function FollowUpForm({ requestId, onSent }: { requestId: string; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => toDateTimeInput(new Date(Date.now() + 7 * 86_400_000)));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function send(event: FormEvent) {
    event.preventDefault();
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return setMessage('Elige el día y la hora.');
    setBusy(true);
    setMessage('');
    try {
      await presenteApi.proposeFollowUp(requestId, date.toISOString(), note.trim() || undefined);
      setMessage(`Propuesta enviada para el ${dateTimeLabel(date)}.`);
      setOpen(false);
      onSent();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'No se pudo enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      {!open ? (
        <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>
          Proponer siguiente visita
        </button>
      ) : (
        <form className={styles.form} onSubmit={send}>
          <p className={styles.meta}>
            Para seguimientos o revisiones: el cliente la agenda contigo por Tequio.
          </p>
          <label className={styles.field}>
            Día y hora
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className={styles.field}>
            Nota (opcional)
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar propuesta'}
            </button>
            <button type="button" className={styles.link} onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {message && <p className={styles.meta}>{message}</p>}
    </div>
  );
}

/** Un trabajo donde te eligieron: llegar, confirmar con PIN, trabajar y terminar. */
/** El cliente trae un adeudo de una cancelación anterior: lo cobra quien lo atiende. */
function CollectDebt({ amount, total }: { amount: number; total: number }) {
  return (
    <p className={styles.notice2}>
      Cobra también {formatMxn(amount)} de una cancelación anterior del cliente: en total{' '}
      <strong>{formatMxn(total)}</strong>. Al cerrar el trabajo se pasan de tu saldo al trabajador a
      quien se le debía (si eras tú, son tuyos).
    </p>
  );
}

export function ActiveJob({
  job,
  onChange,
  onReviewed,
}: {
  job: PresenteJob;
  onChange: (jobs: PresenteJob[]) => void;
  onReviewed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pin, setPin] = useState('');
  const [house, setHouse] = useState('');
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [finalAmount, setFinalAmount] = useState(String(job.amountMxn));
  const id = job.requestId;
  const enRoute = job.status === 'EN_ROUTE';

  // En camino: comparte su ubicación mientras esta pantalla está abierta.
  useEffect(() => {
    if (!enRoute || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMe(point);
        presenteApi.shareLocation(id, point.lat, point.lng).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [enRoute, id]);

  async function run(action: () => Promise<PresenteJob[]>) {
    setBusy(true);
    setError('');
    try {
      onChange(await action());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  function goEnRoute() {
    const minutes = askMinutes('¿En cuántos minutos llegas?', job.etaMinutes);
    if (minutes === null) return;
    if (Number.isNaN(minutes)) return setError('Escribe los minutos con número.');
    void run(() => presenteApi.enRoute(id, minutes));
  }

  function arrive() {
    if (!/^\d{4}$/.test(pin)) return setError('Pide al cliente su PIN de 4 números.');
    const send = (position?: { lat: number; lng: number }) =>
      void run(() => presenteApi.arrive(id, pin, position));
    if (!navigator.geolocation) return send();
    navigator.geolocation.getCurrentPosition(
      (p) => send({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => send(),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function start() {
    const minutes = askMinutes('¿Cuántos minutos tardarás en terminar?', job.durationMinutes ?? 60);
    if (minutes === null) return;
    if (Number.isNaN(minutes) || minutes < 5) return setError('Escribe los minutos (mínimo 5).');
    if (minutes > MAX_JOB_MINUTES) {
      return setError('Los servicios de Tequio son del mismo día: máximo 12 horas (720 minutos).');
    }
    void run(() => presenteApi.startJob(id, minutes));
  }

  async function cancel() {
    const reason = window.prompt(
      'Cancelar cuenta como falta. Con más de 5 en un mes quedas de baja por un mes. ¿Por qué cancelas?',
    );
    if (reason === null) return;
    setBusy(true);
    setError('');
    try {
      const result = await presenteApi.cancelJob(id, reason || undefined);
      if (result.suspendedUntil) {
        window.alert('Quedaste de baja temporal por un mes por cancelar varios trabajos.');
      }
      onChange(await presenteApi.jobs());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cancelar.');
    } finally {
      setBusy(false);
    }
  }

  function finish(event: FormEvent) {
    event.preventDefault();
    const amount = Number(finalAmount);
    if (!Number.isInteger(amount) || amount < MIN_PRICE_MXN) {
      return setError(`El precio mínimo de un servicio es de ${formatMxn(MIN_PRICE_MXN)}.`);
    }
    const debt = job.collectDebtMxn
      ? ` Cobra también ${formatMxn(job.collectDebtMxn)} de una cancelación anterior: en total ${formatMxn(amount + job.collectDebtMxn)}.`
      : '';
    if (!window.confirm(`¿Terminaste? Precio final: ${formatMxn(amount)}.${debt}`)) return;
    void run(() => presenteApi.finishJob(id, { finalAmountMxn: amount }));
  }

  async function showHouse() {
    try {
      setHouse((await presenteApi.housePhoto(id)).dataUrl);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo abrir la foto.');
    }
  }

  if (job.status === 'COMPLETED') {
    return (
      <>
        {!job.clientConfirmedAt && (
          <section className={styles.card}>
            <span className={styles.badge}>Esperando al cliente</span>
            <h2 className={styles.cardTitle}>{job.trades.map(tradeLabel).join(' + ')}</h2>
            <p>
              Precio final: <strong>{formatMxn(job.finalAmountMxn ?? job.amountMxn)}</strong>
            </p>
            {job.collectDebtMxn > 0 && (
              <CollectDebt
                amount={job.collectDebtMxn}
                total={(job.finalAmountMxn ?? job.amountMxn) + job.collectDebtMxn}
              />
            )}
            <p className={styles.meta}>
              {job.problemAt
                ? 'El cliente reportó un problema. Yalika lo va a revisar contigo antes de cerrar el trabajo.'
                : `${job.clientName} tiene que confirmar que quedó bien. Si no contesta en 48 horas, se da por terminado. La comisión se descuenta al cerrar.`}
            </p>
          </section>
        )}
        <ReviewForm requestId={id} title={`¿Cómo te fue con ${job.clientName}?`} onDone={onReviewed} />
        <section className={styles.card}>
          <FollowUpForm requestId={id} onSent={() => setChatKey((n) => n + 1)} />
        </section>
      </>
    );
  }

  const links = job.lat !== null && job.lng !== null ? mapsLinks(job.lat, job.lng) : null;
  const endAt =
    job.startedAt && job.estimatedMinutes
      ? new Date(new Date(job.startedAt).getTime() + job.estimatedMinutes * 60_000)
      : null;

  return (
    <>
      <section className={`${styles.card} ${styles.chosen}`}>
        <span className={styles.badge}>{titles[job.status]}</span>
        <h2 className={styles.cardTitle}>{job.trades.map(tradeLabel).join(' + ')}</h2>
        <p>{job.description}</p>
        <p>
          <strong>{job.clientName}</strong> · {ratingLabel(job.clientRating)}
        </p>
        <p className={styles.meta}>
          {job.placeLabel ? `${job.placeLabel} · ` : ''}
          {job.municipalityName}
          {job.addressHint ? ` · ${job.addressHint}` : ''}
        </p>
        <RequestPhotos requestId={job.requestId} count={job.photoCount ?? 0} />
        <p>
          {formatMxn(job.amountMxn)}
          {durationLabel(job) ? ` · trabajo de ${durationLabel(job)}` : ''}
        </p>
        {job.collectDebtMxn > 0 && (
          <CollectDebt amount={job.collectDebtMxn} total={job.amountMxn + job.collectDebtMxn} />
        )}
        {job.scheduledFor && (
          <p>
            <strong>Visita agendada: {dateTimeLabel(job.scheduledFor)}</strong>
          </p>
        )}
        {job.etaAt && job.status === 'ASSIGNED' && <p>Te esperan aprox. a las {clockLabel(job.etaAt)}</p>}
        {endAt && <p>Terminas aprox. a las {clockLabel(endAt)}</p>}

        {links && (
          <div className={styles.actions}>
            <a className={styles.secondary} href={links.google} target="_blank" rel="noreferrer">
              Abrir en Google Maps
            </a>
            <a className={styles.secondary} href={links.waze} target="_blank" rel="noreferrer">
              Abrir en Waze
            </a>
          </div>
        )}
        {job.hasHousePhoto &&
          (house ? (
            <img className={styles.photoThumb} src={house} alt="Foto del lugar" />
          ) : (
            <button type="button" className={styles.link} onClick={showHouse}>
              Ver foto del lugar
            </button>
          ))}

        {job.status === 'ASSIGNED' && (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy} onClick={goEnRoute}>
              Voy en camino
            </button>
          </div>
        )}
        {job.status === 'EN_ROUTE' && (
          <>
            <ArrivalPanel job={job} me={me} onChange={onChange} onMessage={() => setChatKey((n) => n + 1)} />
            <p className={styles.meta}>Compartiendo tu ubicación mientras esta pantalla esté abierta.</p>
          </>
        )}
        {['ASSIGNED', 'EN_ROUTE'].includes(job.status) && (
          <div className={styles.form}>
            <label className={styles.field}>
              Al llegar, pide el PIN al cliente
              <input
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={busy} onClick={arrive}>
                Llegué
              </button>
            </div>
          </div>
        )}
        {job.status === 'ARRIVED' && (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy} onClick={start}>
              Empezar el trabajo
            </button>
          </div>
        )}
        {job.careLink && ['ARRIVED', 'IN_PROGRESS'].includes(job.status) && (
          <div className={styles.careLinks}>
            <Link href={careLinks[job.careLink].worker.href} className={styles.secondary}>
              {careLinks[job.careLink].worker.label}
            </Link>
            <span className={styles.meta}>
              {job.careLink === 'VET'
                ? 'Pide al dueño la ficha de su mascota para ver recetas recientes.'
                : 'Pide al paciente su QR de Salud para ver sus recetas recientes antes de recetar.'}
            </span>
          </div>
        )}
        {job.status === 'IN_PROGRESS' && <FollowUpForm requestId={id} onSent={() => setChatKey((n) => n + 1)} />}
        {job.status === 'IN_PROGRESS' && (
          <form className={styles.form} onSubmit={finish}>
            <p className={styles.meta}>
              Si salió más (o menos) trabajo, pon el precio real; el cliente lo verá antes de
              confirmar.
            </p>
            <div className={styles.row}>
              <label className={styles.field}>
                Precio final (pesos)
                <input
                  inputMode="numeric"
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(e.target.value.replace(/\D/g, ''))}
                />
              </label>
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy}>
                Terminé
              </button>
            </div>
          </form>
        )}
        {['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(job.status) && (
          <button type="button" className={styles.link} disabled={busy} onClick={cancel}>
            No puedo ir (cancelar)
          </button>
        )}
        {error && <p className={styles.hint}>{error}</p>}
      </section>

      {job.lat !== null && job.lng !== null && (
        <section className={styles.card}>
          <MapView destination={{ lat: job.lat, lng: job.lng }} worker={me} />
        </section>
      )}

      <Chat key={chatKey} requestId={id} side="worker" open />
    </>
  );
}

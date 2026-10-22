'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  clockLabel,
  commissionFor,
  dateTimeLabel,
  distanceLabel,
  durationLabel,
  etaLabel,
  formatBalance,
  formatMxn,
  MAX_JOB_MINUTES,
  MIN_PRICE_MXN,
  presenteApi,
  ratingLabel,
  toDateTimeInput,
  tradeLabel,
  urgencyLabel,
  type NearbyRequest,
  type NearbyResult,
  type PresenteJob,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';
import { RequestPhotos } from '../request-photos';
import { ActiveJob } from './active-job';

const REFRESH_MS = 30_000;

type DurationUnit = 'min' | 'h';
type QuoteForm = {
  amount: string;
  eta: string;
  duration: string;
  unit: DurationUnit;
  note: string;
  /** Cita: '' = puedo a esa hora; si no, la otra hora que propone (datetime-local). */
  other: string;
  proposing: boolean;
};

const unitOptions: [DurationUnit, string][] = [
  ['min', 'minutos'],
  ['h', 'horas'],
];

/** Trabajos donde te eligieron y pedidos cerca para cotizar. */
export function NearbyWork({ present }: { present: boolean }) {
  const [near, setNear] = useState<NearbyResult | null>(null);
  const [jobs, setJobs] = useState<PresenteJob[]>([]);
  const [forms, setForms] = useState<Record<string, QuoteForm>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pct, setPct] = useState(7);
  // De 9 de la noche a 6 de la mañana se le recuerda que puede cobrar más.
  const [night] = useState(() => {
    const hour = new Date().getHours();
    return hour >= 21 || hour < 6;
  });

  // Porcentaje que descuenta Yalika, para mostrar cuánto le queda al cotizar.
  useEffect(() => {
    let live = true;
    presenteApi
      .wallet()
      .then((w) => live && setPct(w.commissionPct))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nearby, mine] = await Promise.all([presenteApi.nearby(), presenteApi.jobs()]);
      setNear(nearby);
      setJobs(mine);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron cargar los pedidos.');
    }
  }, []);

  useEffect(() => {
    let live = true;
    const load = () => {
      if (live) void refresh();
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [refresh, present]);

  const formFor = (r: NearbyRequest): QuoteForm =>
    forms[r.id] ?? {
      amount: r.myQuote ? String(r.myQuote.amountMxn) : '',
      eta: r.myQuote ? String(r.myQuote.etaMinutes) : '30',
      duration: r.myQuote?.durationMinutes ? String(r.myQuote.durationMinutes) : '60',
      unit: 'min',
      note: r.myQuote?.note ?? '',
      other: r.myQuote?.proposedFor ? toDateTimeInput(r.myQuote.proposedFor) : '',
      proposing: Boolean(r.myQuote?.proposedFor),
    };

  const setField = (r: NearbyRequest, field: keyof QuoteForm, value: string | boolean) =>
    setForms({ ...forms, [r.id]: { ...formFor(r), [field]: value } });

  async function send(event: FormEvent, r: NearbyRequest) {
    event.preventDefault();
    const form = formFor(r);
    const amount = Number(form.amount);
    const eta = Number(form.eta);
    const duration = Number(form.duration);
    if (!Number.isInteger(amount) || amount < MIN_PRICE_MXN) {
      return setError(`El precio mínimo de un servicio es de ${formatMxn(MIN_PRICE_MXN)}.`);
    }
    if (!Number.isInteger(eta) || eta < 5) return setError('Escribe en cuántos minutos llegas (mínimo 5).');
    if (!Number.isInteger(duration) || duration < 1) {
      return setError('Escribe cuánto tardas en hacer el trabajo.');
    }
    const minutes = form.unit === 'h' ? duration * 60 : duration;
    let proposedFor: string | undefined;
    if (r.scheduledFor && form.proposing) {
      const date = new Date(form.other);
      if (!form.other || Number.isNaN(date.getTime())) return setError('Elige el día y la hora que propones.');
      proposedFor = date.toISOString();
    }
    if (minutes < 5) return setError('Escribe cuánto tardas en hacer el trabajo (mínimo 5 minutos).');
    if (minutes > MAX_JOB_MINUTES) {
      return setError('Los servicios de Tequio son del mismo día: máximo 12 horas de trabajo.');
    }
    // Apagado también puede tomar un trabajo, solo confirma.
    if (near && !near.present && !r.myQuote && !window.confirm('Estás apagado. ¿Quieres tomar este trabajo y mandar tu precio?')) {
      return;
    }
    setBusy(r.id);
    setError('');
    try {
      setNear(
        await presenteApi.sendQuote(r.id, {
          amountMxn: amount,
          etaMinutes: eta,
          durationMinutes: minutes,
          note: form.note.trim() || undefined,
          proposedFor,
        }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo mandar el presupuesto.');
    } finally {
      setBusy('');
    }
  }

  const activeJobs = jobs.filter((j) => ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(j.status));
  const toReview = jobs.filter(
    (j) => j.status === 'COMPLETED' && (!j.reviewed || !j.clientConfirmedAt),
  );

  return (
    <>
      {[...activeJobs, ...toReview].map((job) => (
        <ActiveJob key={job.requestId} job={job} onChange={setJobs} onReviewed={() => void refresh()} />
      ))}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Pedidos cerca de ti</h2>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {near && !near.present && near.requests.length > 0 && (
          <p className={styles.meta}>
            Estás apagado: ves los trabajos pero no te llegan avisos. Si quieres uno, manda tu precio.
          </p>
        )}
        {near?.suspendedUntil ? (
          <p className={styles.notice2}>
            Estás de baja temporal por cancelar varios trabajos este mes. Vuelves el{' '}
            {new Date(near.suspendedUntil).toLocaleDateString('es-MX', { dateStyle: 'long' })}.
          </p>
        ) : !near || near.requests.length === 0 ? (
          <p className={styles.empty}>Por ahora no hay pedidos de tus oficios en tu rango.</p>
        ) : (
          <>
            {near.busyUntil && (
              <p className={styles.notice2}>
                Estás en un trabajo hasta aprox. las {clockLabel(near.busyUntil)}; si cotizas, suma
                ese tiempo a tu llegada.
              </p>
            )}
            {near.requests.map((r) => {
              const form = formFor(r);
              return (
                <article key={r.id} className={styles.request}>
                  {r.direct && <span className={styles.badge}>Te lo pidieron a ti</span>}
                  {r.needsInvoice && <span className={styles.badge}>Pide factura · precio + IVA 16%</span>}
                  <h3>
                    {r.trades.map(tradeLabel).join(' + ')} ·{' '}
                    {r.scheduledFor ? dateTimeLabel(r.scheduledFor) : urgencyLabel(r.urgency)}
                  </h3>
                  <p>{r.description}</p>
                  <p className={styles.meta}>
                    {r.municipalityName}, {distanceLabel(r.distanceKm)} · Cliente: {ratingLabel(r.clientRating)}
                  </p>
                  <RequestPhotos requestId={r.id} count={r.photoCount ?? 0} />
                  <form className={styles.form} onSubmit={(e) => send(e, r)}>
                    <h4 className={styles.formTitle}>{r.scheduledFor ? 'Tu respuesta a la cita' : 'Tu presupuesto'}</h4>
                    {r.scheduledFor && (
                      <div className={styles.botChat}>
                        <p className={styles.botMsg}>
                          📅 Te piden cita para el <strong>{dateTimeLabel(r.scheduledFor)}</strong>
                          <br />
                          ¿Puedes a esa hora?
                        </p>
                        <div className={styles.chips}>
                          <button
                            type="button"
                            className={styles.chip}
                            aria-pressed={!form.proposing}
                            onClick={() => setField(r, 'proposing', false)}
                          >
                            Sí, puedo
                          </button>
                          <button
                            type="button"
                            className={styles.chip}
                            aria-pressed={form.proposing}
                            onClick={() => setField(r, 'proposing', true)}
                          >
                            Propongo otra hora
                          </button>
                        </div>
                        {form.proposing && (
                          <label className={styles.field}>
                            Día y hora que propones (dentro de tu horario)
                            <input
                              type="datetime-local"
                              value={form.other}
                              onChange={(e) => setField(r, 'other', e.target.value)}
                            />
                          </label>
                        )}
                      </div>
                    )}
                    <p className={night ? styles.notice2 : styles.meta}>
                      {night ? 'Es de noche. ' : ''}
                      Tu precio incluye tu transporte de ida y vuelta y tu trabajo. De noche, con
                      lluvia o con mucha demanda puedes cobrar más.
                    </p>
                    <div className={styles.row}>
                      <label className={styles.field}>
                        Precio (desde {formatMxn(MIN_PRICE_MXN)})
                        <input
                          inputMode="numeric"
                          value={form.amount}
                          onChange={(e) => setField(r, 'amount', e.target.value.replace(/\D/g, ''))}
                        />
                      </label>
                      {!r.scheduledFor && (
                        <label className={styles.field}>
                          Llego en (minutos)
                          <input
                            inputMode="numeric"
                            value={form.eta}
                            onChange={(e) => setField(r, 'eta', e.target.value.replace(/\D/g, ''))}
                          />
                        </label>
                      )}
                    </div>
                    <div className={styles.field}>
                      <span>El trabajo me toma</span>
                      <div className={styles.inline}>
                        <input
                          aria-label="Cuánto tardas en el trabajo"
                          inputMode="numeric"
                          value={form.duration}
                          onChange={(e) => setField(r, 'duration', e.target.value.replace(/\D/g, ''))}
                        />
                        <select
                          aria-label="Minutos u horas"
                          value={form.unit}
                          onChange={(e) => setField(r, 'unit', e.target.value)}
                        >
                          {unitOptions.map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {Number(form.amount) >= MIN_PRICE_MXN && (
                      <p className={styles.net}>
                        Yalika descuenta {formatBalance(commissionFor(Number(form.amount), pct).commission)}{' '}
                        ({pct}%) al terminar. A ti te quedan{' '}
                        <strong>{formatBalance(commissionFor(Number(form.amount), pct).net)}</strong>.
                      </p>
                    )}
                    <label className={styles.field}>
                      Nota (opcional)
                      <input value={form.note} maxLength={300} onChange={(e) => setField(r, 'note', e.target.value)} />
                    </label>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={busy === r.id}>
                        {busy === r.id
                          ? 'Enviando…'
                          : r.myQuote
                            ? 'Cambiar mi respuesta'
                            : r.scheduledFor
                              ? 'Responder la cita'
                              : 'Mandar presupuesto'}
                      </button>
                    </div>
                    {r.myQuote && (
                      <p className={styles.meta}>
                        Mandaste {formatMxn(r.myQuote.amountMxn)}
                        {r.scheduledFor
                          ? r.myQuote.proposedFor
                            ? ` · propusiste el ${dateTimeLabel(r.myQuote.proposedFor)}`
                            : ' · aceptaste la hora'
                          : ` · llegas en ${etaLabel(r.myQuote.etaMinutes)}`}
                        {durationLabel(r.myQuote) ? ` · tardas ${durationLabel(r.myQuote)}` : ''}
                      </p>
                    )}
                  </form>
                </article>
              );
            })}
          </>
        )}
      </section>
    </>
  );
}

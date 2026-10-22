'use client';

/* eslint-disable @next/next/no-img-element -- vista previa local de las fotos */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import {
  availabilityLabel,
  dateTimeLabel,
  isPendingTrade,
  isWithinAvailability,
  MAX_REQUEST_PHOTOS,
  MAX_TRADES_PER_REQUEST,
  photoToDataUrl,
  presenteApi,
  ratingLabel,
  toDateTimeInput,
  tradeKeys,
  tradeLabel,
  urgencyOptions,
  type ClientProfile,
  type HelpRequestInput,
  type Place,
  type ProviderProfile,
} from '@/lib/yalika-presente';

import { DebtNotice } from '../debt-notice';
import { PlaceEditor, PlaceSummary } from '../place-editor';
import { SafetyNote } from '../safety-note';
import { FiscalForm } from '../fiscal-form';
import styles from '../presente.module.css';
import { SlotPicker } from './slot-picker';
import { TradePicker } from '../trade-picker';

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** El dictado por voz del navegador, si existe (Chrome y Android sí; algunos iPhone no). */
function createRecognition(): Recognition | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

type Step = 'que' | 'donde' | 'detalles';
const STEPS: [Step, string][] = [
  ['que', '¿Qué necesitas?'],
  ['donde', '¿A dónde vamos?'],
  ['detalles', 'Descripción y fotos'],
];

/**
 * Pedir ayuda en tres pasos, sin repetir datos:
 * 1. Qué necesitas (si ya lo elegiste en el buscador, se salta).
 * 2. A dónde: eliges uno de tus lugares guardados, o agregas otro (para un familiar, la oficina).
 * 3. Qué pasa: lo escribes o lo dictas, agregas fotos y eliges para cuándo. Luego esperas
 *    presupuestos y eliges el que te convenga.
 */
export function RequestForm({
  openCategory,
  initialTrade,
  providerId,
  followUpOfId,
  proposedAt,
  initialText,
}: {
  openCategory?: string;
  /** Oficio elegido desde el buscador del inicio. */
  initialTrade?: string;
  /** Pedir directo a un trabajador de confianza. */
  providerId?: string;
  /** Seguimiento de una visita anterior (copia oficio y lugar). */
  followUpOfId?: string;
  /** Día y hora propuestos por el trabajador. */
  proposedAt?: string;
  /** Lo que escribió en el buscador (cuando pide «otra cosa»). */
  initialText?: string;
}) {
  const router = useRouter();
  const presetTrade =
    initialTrade && tradeKeys.includes(initialTrade) && !isPendingTrade(initialTrade)
      ? initialTrade
      : '';
  const [client, setClient] = useState<ClientProfile | null | undefined>(undefined);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeId, setPlaceId] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [trades, setTrades] = useState<string[]>(presetTrade ? [presetTrade] : []);
  const [step, setStep] = useState<Step>(presetTrade ? 'donde' : 'que');
  const [description, setDescription] = useState(initialText ?? '');
  const [urgency, setUrgency] = useState(proposedAt ? 'SCHEDULED' : 'NOW');
  const [when, setWhen] = useState(proposedAt ? toDateTimeInput(proposedAt) : '');
  const [target, setTarget] = useState<ProviderProfile | null>(null);
  // Lo más pronto que se puede agendar (se calcula una vez al abrir la pantalla).
  const [minWhen] = useState(() => toDateTimeInput(new Date(Date.now() + 15 * 60_000)));
  const [photos, setPhotos] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Factura: el precio lleva IVA aparte y solo cotizan quienes facturan.
  const [needsInvoice, setNeedsInvoice] = useState(false);
  const [fiscalOk, setFiscalOk] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      presenteApi.client(),
      presenteApi.places().catch(() => [] as Place[]),
      providerId ? presenteApi.providerProfile(providerId).catch(() => null) : null,
      followUpOfId ? presenteApi.helpRequest(followUpOfId).catch(() => null) : null,
    ])
      .then(([profile, list, provider, previous]) => {
        if (!live) return;
        setClient(profile);
        setPlaces(list);
        setTarget(provider);
        const usable = list.filter((p) => p.address);
        // Si solo hay un lugar listo, ya queda elegido.
        if (usable.length === 1) setPlaceId(usable[0].id);
        if (!list.length) setAdding(true);
        if (previous) {
          // Seguimiento: mismo lugar y mismos oficios que la visita anterior.
          const same = provider
            ? previous.trades.filter((t) => provider.trades.includes(t))
            : previous.trades;
          setTrades(same);
          if (same.length) setStep('donde');
          if (previous.placeId && list.some((p) => p.id === previous.placeId)) {
            setPlaceId(previous.placeId);
          }
          setDescription(`Seguimiento de la visita anterior: ${previous.description}`.slice(0, 600));
        } else if (provider && provider.trades.length === 1) {
          setTrades([...provider.trades]);
          setStep('donde');
        }
      })
      .catch((failure: unknown) => {
        if (!live) return;
        setClient(null);
        setError(failure instanceof Error ? failure.message : 'No se pudieron cargar tus datos.');
      });
    return () => {
      live = false;
    };
  }, [providerId, followUpOfId]);

  function go(next: Step) {
    setError('');
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextFromTrades() {
    if (!trades.length) return setError('Elige qué necesitas.');
    go('donde');
  }

  function nextFromPlace() {
    if (!placeId) return setError('Elige a dónde deben llegar, o agrega el lugar.');
    const place = places.find((p) => p.id === placeId);
    if (place && !place.address) {
      return setError(`Completa la calle y el número de «${place.label}» en Mis datos.`);
    }
    go('detalles');
  }

  /** Antes del primer lugar hace falta el nombre de quien pide. */
  async function ensureClient() {
    if (client) return true;
    if (name.trim().length < 2) {
      setError('Primero escribe tu nombre.');
      return false;
    }
    try {
      setClient(await presenteApi.saveClient({ displayName: name.trim() }));
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar tu nombre.');
      return false;
    }
  }

  function placeSaved(place: Place) {
    setPlaces((current) => [...current.filter((p) => p.id !== place.id), place]);
    setPlaceId(place.id);
    setAdding(false);
    setError('');
  }

  function dictate() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const rec = createRecognition();
    if (!rec) {
      setError('Tu teléfono no permite dictar aquí. Escríbelo o usa el micrófono del teclado.');
      return;
    }
    rec.lang = 'es-MX';
    rec.interimResults = false;
    rec.onresult = (event) => {
      const said = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (said) setDescription((current) => (current ? `${current} ${said}` : said));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    setError('');
    setListening(true);
    rec.start();
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await photoToDataUrl(file);
      setPhotos((current) => [...current, dataUrl].slice(0, MAX_REQUEST_PHOTOS));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo preparar la foto.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trades.length) return go('que');
    if (!placeId) return go('donde');
    if (description.trim().length < 5) return setError('Danos una descripción de lo que pasó (unas palabras bastan).');
    if (trades.includes('OTRO') && description.trim().length < 15) {
      return setError('Como elegiste «Otra cosa», explica con más detalle qué necesitas.');
    }
    let scheduledFor: string | undefined;
    if (urgency === 'SCHEDULED') {
      const date = new Date(when);
      if (!when || Number.isNaN(date.getTime())) return setError('Elige el día y la hora.');
      if (target && !isWithinAvailability(target.availability, date)) {
        return setError(
          `${target.displayName} no atiende ese día y hora. Su horario: ${availabilityLabel(target.availability)}.`,
        );
      }
      scheduledFor = date.toISOString();
    }
    if (needsInvoice && !fiscalOk) return setError('Para pedir factura, guarda tus datos para factura.');
    const data: HelpRequestInput = {
      trades,
      description: description.trim(),
      placeId,
      needsInvoice: needsInvoice || undefined,
      // Agendado: se manda como "esta semana"; el API usa la fecha elegida.
      urgency: urgency === 'SCHEDULED' ? 'THIS_WEEK' : urgency,
    };
    if (scheduledFor) data.scheduledFor = scheduledFor;
    if (target) data.providerId = target.id;
    if (followUpOfId) data.followUpOfId = followUpOfId;
    setBusy(true);
    setError('');
    try {
      const created = await presenteApi.createRequest(data);
      // Las fotos se mandan una por una (cada una puede pesar hasta 1.5 MB).
      for (const photo of photos) {
        await presenteApi.addRequestPhoto(created.id, photo).catch(() => undefined);
      }
      router.push(`/tequio/pedido/${created.id}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo mandar tu pedido.');
      setBusy(false);
    }
  }

  const stepIndex = STEPS.findIndex(([key]) => key === step);
  const chosenPlace = places.find((p) => p.id === placeId) ?? null;

  const header = (
    <header>
      <p className={styles.eyebrow}>Yalika · Tequio</p>
      <h1 className={styles.title}>
        {target ? `Pedirle a ${target.displayName}` : followUpOfId ? 'Siguiente visita' : 'Pedir ayuda'}
      </h1>
      <Link href="/tequio" className={styles.link}>
        Volver
      </Link>
    </header>
  );

  if (client === undefined) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          {header}
          <p className={styles.meta}>Cargando…</p>
        </div>
      </main>
    );
  }

  const errorBox = error && (
    <p role="alert" className={styles.error}>
      {error}
    </p>
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {header}
        <DebtNotice />

        <ol className={styles.wizard} aria-label="Pasos">
          {STEPS.map(([key, label], i) => (
            <li
              key={key}
              data-done={i < stepIndex}
              data-current={i === stepIndex}
              aria-current={i === stepIndex ? 'step' : undefined}
            >
              {label}
            </li>
          ))}
        </ol>

        {target && (
          <section className={`${styles.card} ${styles.chosen}`}>
            <p>
              Solo <strong>{target.displayName}</strong> verá este pedido.{' '}
              {ratingLabel(target.rating)}
            </p>
            <p className={styles.meta}>Atiende: {availabilityLabel(target.availability)}</p>
          </section>
        )}
        {providerId && !target && (
          <p className={styles.notice2}>
            Ese trabajador ya no está disponible. Tu pedido llegará a todos los cercanos.
          </p>
        )}

        {/* Lo que ya elegiste, para no volver a preguntarlo */}
        {step !== 'que' && trades.length > 0 && (
          <div className={styles.summaryRow}>
            <span>
              <small>Necesitas</small>
              <strong>{trades.map(tradeLabel).join(' + ')}</strong>
            </span>
            {!target && (
              <button type="button" className={styles.link} onClick={() => go('que')}>
                Cambiar
              </button>
            )}
          </div>
        )}
        {step === 'detalles' && chosenPlace && (
          <div className={styles.summaryRow}>
            <span>
              <small>Lugar</small>
              <strong>
                {chosenPlace.label} · {chosenPlace.address}
              </strong>
            </span>
            <button type="button" className={styles.link} onClick={() => go('donde')}>
              Cambiar
            </button>
          </div>
        )}

        {step === 'que' && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>¿Qué necesitas?</h2>
            <p className={styles.meta}>Puedes elegir hasta {MAX_TRADES_PER_REQUEST} en la misma visita.</p>
            <TradePicker
              value={trades}
              onChange={setTrades}
              max={MAX_TRADES_PER_REQUEST}
              hidePending
              openCategory={openCategory}
              allowed={target?.trades}
            />
            {errorBox}
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={nextFromTrades}>
                Siguiente
              </button>
            </div>
          </section>
        )}

        {step === 'donde' && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>¿A dónde vamos?</h2>
            {!client && (
              <label className={styles.field}>
                Tu nombre
                <input
                  value={name}
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Como quieres que te llamen"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            {places.length > 0 && (
              <div className={styles.placeList} role="radiogroup" aria-label="Tus lugares">
                {places.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    role="radio"
                    aria-checked={placeId === place.id}
                    className={styles.placeOption}
                    onClick={() => {
                      setPlaceId(place.id);
                      setAdding(false);
                    }}
                  >
                    <PlaceSummary place={place} />
                  </button>
                ))}
              </div>
            )}
            {adding ? (
              <div className={styles.placeEditing}>
                <h3 className={styles.formTitle}>
                  {places.length ? 'Otro lugar' : 'Tu primer lugar'}
                </h3>
                <p className={styles.meta}>
                  {places.length
                    ? '¿Es para un familiar o en otro lado? Escribe la calle, el número y marca la puerta en el mapa. Se guarda para la próxima vez.'
                    : 'Escribe la calle, el número y marca la puerta en el mapa. Se guarda para tus siguientes pedidos.'}
                </p>
                {client || name.trim().length >= 2 ? (
                  <PlaceEditor
                    defaultLabel={places.length ? '' : 'Casa'}
                    beforeSave={ensureClient}
                    onSaved={placeSaved}
                    onCancel={places.length ? () => setAdding(false) : undefined}
                  />
                ) : (
                  <p className={styles.notice2}>Escribe tu nombre arriba para continuar.</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                className={styles.addPlace}
                onClick={() => {
                  setPlaceId('');
                  setAdding(true);
                }}
              >
                + Otro lugar (para un familiar, tu trabajo u otra dirección)
              </button>
            )}
            {errorBox}
            {!adding && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={async () => {
                    if (await ensureClient()) nextFromPlace();
                  }}
                >
                  Siguiente
                </button>
              </div>
            )}
          </section>
        )}

        {step === 'detalles' && (
          <form className={styles.form} onSubmit={submit}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Danos una descripción de lo que pasó</h2>
              <label className={styles.field}>
                Escríbela o díctala
                <textarea
                  value={description}
                  maxLength={600}
                  placeholder="Ej. Se ponchó la llanta trasera y no traigo refacción."
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={dictate}>
                  {listening ? 'Escuchando… toca para terminar' : 'Hablar'}
                </button>
              </div>

              <div className={styles.field}>
                <span>Fotos (opcional, hasta {MAX_REQUEST_PHOTOS})</span>
                <span className={styles.meta}>
                  De la llanta, la chapa, la fuga… El profesional las ve para cotizarte mejor.
                </span>
                {photos.length > 0 && (
                  <div className={styles.thumbs}>
                    {photos.map((src, i) => (
                      <figure key={i}>
                        <img src={src} alt={`Foto ${i + 1}`} />
                        <button
                          type="button"
                          className={styles.link}
                          onClick={() => setPhotos((current) => current.filter((_, j) => j !== i))}
                        >
                          Quitar
                        </button>
                      </figure>
                    ))}
                  </div>
                )}
                {photos.length < MAX_REQUEST_PHOTOS && (
                  <div className={styles.actions}>
                    <label className={`${styles.secondary} ${styles.voice}`}>
                      {photos.length ? `Agregar otra foto (${photos.length} de ${MAX_REQUEST_PHOTOS})` : 'Agregar foto'}
                      <input type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} />
                    </label>
                  </div>
                )}
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>¿Para cuándo?</h2>
              <div className={styles.chips}>
                {[...urgencyOptions, ['SCHEDULED', 'Elegir día y hora'] as const].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.chip}
                    aria-pressed={urgency === key}
                    onClick={() => setUrgency(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {urgency === 'SCHEDULED' && target && (
                <SlotPicker providerId={target.id} name={target.displayName} value={when} onPick={setWhen} />
              )}
              {urgency === 'SCHEDULED' && (
                <label className={styles.field}>
                  {target ? 'O escribe otro día y hora' : 'Día y hora de la visita'}
                  <input
                    type="datetime-local"
                    value={when}
                    min={minWhen}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </label>
              )}
              {urgency === 'SCHEDULED' && (
                <p className={styles.meta}>
                  La visita es de un solo día. El asistente les recuerda a ti y a quien elijas una
                  hora antes, en Mi día.
                </p>
              )}
              {urgency === 'SCHEDULED' && when && (
                <p className={styles.meta}>
                  {dateTimeLabel(new Date(when))}
                  {target && !isWithinAvailability(target.availability, new Date(when))
                    ? ` · fuera del horario de ${target.displayName}`
                    : ''}
                </p>
              )}
            </section>

            <section className={styles.card}>
              <label className={styles.check}>
                <input type="checkbox" checked={needsInvoice} onChange={(e) => setNeedsInvoice(e.target.checked)} />
                <span>
                  <strong>Necesito factura</strong> · Te cotizan solo quienes dan factura y el precio
                  lleva IVA (16%) aparte. La factura te llega aquí mismo.
                </span>
              </label>
              {needsInvoice && <FiscalForm compact onSaved={setFiscalOk} />}
            </section>

            {errorBox}
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? 'Enviando…' : 'Pedir presupuestos'}
              </button>
            </div>
            <p className={styles.meta}>
              Te llegan presupuestos de personas verificadas cerca de ti. Tú eliges el que más te
              convenga.
            </p>
            <SafetyNote side="client" />
          </form>
        )}
      </div>
    </main>
  );
}

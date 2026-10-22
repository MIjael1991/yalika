'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  commissionFor,
  distanceLabel,
  formatMxn,
  ivaFor,
  MIN_PRICE_MXN,
  plural,
  presenteApi,
  ratingLabel,
  timeAgo,
  tradeLabel,
  type NearbyRequest,
  type NearbyResult,
  type PresenteProvider,
} from '@/lib/yalika-presente';

import { AlertsButton } from './alerts-button';
import styles from './presente.module.css';
import { RequestPhotos } from './request-photos';

const REFRESH_MS = 30_000;
const HIDDEN_KEY = 'tequio.noMeInteresa';
const ETAS = [15, 30, 45, 60];
const DURATIONS: [number, string][] = [
  [30, '30 min'],
  [60, '1 hora'],
  [120, '2 horas'],
  [180, '3 horas'],
];

type Draft = { price: string; eta: number | null; duration: number | null };

function readHidden(): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((v): v is string => typeof v === 'string').slice(-100) : [];
  } catch {
    return [];
  }
}

function saveHidden(ids: string[]) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids.slice(-100)));
  } catch {
    // Sin almacenamiento: vuelve a aparecer al recargar.
  }
}

/**
 * Modo trabajador en el inicio de Tequio, abajo del asistente. Ves los trabajos cerca aunque
 * estés apagado; prendido, además te llegan avisos. Eliges cuál te interesa y mandas tu precio y
 * en cuánto llegas (apagado, primero confirmas que sí lo quieres). El cliente elige. Quien todavía no ofrece servicios ve una
 * invitación corta.
 */
export function WorkerQuick() {
  const [provider, setProvider] = useState<PresenteProvider | null | undefined>(undefined);
  const [near, setNear] = useState<NearbyResult | null>(null);
  const [pct, setPct] = useState(7);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ price: '', eta: null, duration: null });
  const [hidden, setHidden] = useState<string[]>([]);
  // Apagado: antes de poner precio confirma que sí quiere ese trabajo.
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const verified = provider?.status === 'VERIFIED';
  const present = provider?.presence === 'PRESENT';

  const loadNearby = useCallback(async () => {
    try {
      setNear(await presenteApi.nearby());
    } catch {
      // Sin conexión: se intenta en la siguiente vuelta.
    }
  }, []);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => live && setHidden(readHidden()), 0);
    presenteApi
      .me()
      .then((me) => {
        if (!live) return;
        setProvider(me);
        // La comisión que le toca hoy (10 % de fundador mientras le dura el regalo).
        if (me?.status === 'VERIFIED') {
          presenteApi
            .wallet()
            .then((w) => live && setPct(w.commissionPct))
            .catch(() => undefined);
        }
      })
      .catch(() => live && setProvider(null));
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);

  // Los trabajos se actualizan solos mientras la pantalla está abierta.
  useEffect(() => {
    if (!verified) return;
    const load = () => {
      if (document.visibilityState === 'visible') void loadNearby();
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [verified, present, loadNearby]);

  if (provider === undefined) return null;

  // Todavía no ofrece servicios: invitación corta, sin estorbar a quien solo pide ayuda.
  if (!provider || !verified) {
    const [text, href, action] = !provider
      ? ['¿Sabes hacer algo? Gana dinero en tu zona con Tequio.', '/cuenta?seccion=servicios', 'Empezar']
      : provider.status === 'WITHDRAWN'
        ? ['Te diste de baja. Tus datos siguen guardados.', '/tequio/trabajo', 'Volver a trabajar']
        : provider.status === 'SUSPENDED'
          ? ['Tu cuenta de trabajador está en pausa.', '/tequio/trabajo', 'Ver por qué']
          : provider.status === 'PENDING_REVIEW'
            ? ['Estamos revisando tus datos para que puedas trabajar.', '/tequio/trabajo', 'Ver mi registro']
            : ['Te falta terminar tu registro para trabajar.', '/cuenta?seccion=servicios', 'Terminar registro'];
    return (
      <section className={styles.workStrip} aria-label="Modo trabajador">
        <span className={styles.workStripTag}>Modo trabajador</span>
        <span className={styles.workStripText}>{text}</span>
        <Link href={href} className={styles.workStripGo}>
          {action}
        </Link>
      </section>
    );
  }

  async function toggle() {
    setBusy('presencia');
    setError('');
    try {
      const updated = await presenteApi.setPresence(!present);
      setProvider(updated);
      setOpen(null);
      void loadNearby();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cambiar.');
    } finally {
      setBusy('');
    }
  }

  function startQuote(r: NearbyRequest, confirmed = false) {
    setError('');
    if (!present && !r.myQuote && !confirmed) {
      setAsking(r.id);
      return;
    }
    setAsking(null);
    setOpen(r.id);
    const mine = r.myQuote;
    setDraft({
      price: mine ? String(mine.amountMxn) : '',
      eta: mine ? mine.etaMinutes : null,
      duration: mine?.durationMinutes ?? null,
    });
  }

  async function send(r: NearbyRequest) {
    const price = Number(draft.price);
    if (!draft.price) return setError('Escribe cuánto cobras por este trabajo.');
    if (price < MIN_PRICE_MXN) return setError(`El precio mínimo es de ${formatMxn(MIN_PRICE_MXN)}.`);
    if (!draft.eta) return setError('Elige en cuánto llegas.');
    if (!draft.duration) return setError('Elige cuánto tardas en hacer el trabajo.');
    setBusy(r.id);
    setError('');
    try {
      setNear(
        await presenteApi.sendQuote(r.id, {
          amountMxn: price,
          etaMinutes: draft.eta,
          durationMinutes: draft.duration,
        }),
      );
      setOpen(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo mandar tu precio.');
    } finally {
      setBusy('');
    }
  }

  function notInterested(id: string) {
    const next = [...hidden, id];
    setHidden(next);
    saveHidden(next);
    if (open === id) setOpen(null);
  }

  const jobs = (near?.requests ?? []).filter((r) => !hidden.includes(r.id));
  const waiting = near?.waiting ?? { count: 0, trades: [] };
  const asked = waiting.trades.map((t) => tradeLabel(t).toLowerCase()).join(', ');

  const title = present ? 'Estás trabajando' : 'Estás apagado';
  const line = present
    ? jobs.length
      ? `${plural(jobs.length, 'trabajo', 'trabajos')} cerca. Elige y manda tu precio.`
      : 'Por ahora no hay pedidos cerca. Aquí aparecen en cuanto alguien pida.'
    : waiting.count
      ? `${waiting.count === 1 ? 'Hay 1 persona pidiendo' : `Hay ${waiting.count} personas pidiendo`} ${asked} cerca de ti. Puedes ver y tomar trabajos sin activarte; actívate para que te lleguen avisos.`
      : 'Aquí verás los trabajos de lo que sabes hacer. Actívate para que te lleguen avisos.';

  return (
    <section className={styles.workLive} data-present={present} aria-label="Modo trabajador">
      <div className={styles.workLiveHead}>
        <div className={styles.workLiveText}>
          <p className={styles.workLiveTag}>Modo trabajador{present ? ' · se actualiza solo' : ''}</p>
          <h2 className={styles.workLiveTitle}>{title}</h2>
          <p className={styles.workLiveLine}>{line}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={present}
          aria-label={present ? 'Ponerme Ausente' : 'Activarme'}
          className={styles.workSwitch}
          disabled={busy === 'presencia'}
          onClick={() => void toggle()}
        >
          <span className={styles.workSwitchKnob} />
        </button>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {/* Prendido: avisos al celular de trabajos nuevos. Apagado no llegan. */}
      {present && <AlertsButton ask="¿Te avisamos al celular cuando haya trabajos nuevos?" allowOff />}

      {jobs.length > 0 && (
        <ul className={styles.workJobs}>
          {jobs.map((r) => {
            const editing = open === r.id;
            const mine = r.myQuote;
            const price = Number(draft.price) || 0;
            const net = price ? commissionFor(price, pct).net : 0;
            return (
              <li key={r.id} className={styles.workJob}>
                <div className={styles.workJobTop}>
                  <strong>{r.trades.map(tradeLabel).join(' + ')}</strong>
                  <span className={styles.meta}>
                    {r.direct ? 'Te lo pidieron a ti · ' : ''}
                    {r.needsInvoice ? 'Pide factura · ' : ''}
                    {distanceLabel(r.distanceKm)} · {timeAgo(r.createdAt)} · Cliente: {ratingLabel(r.clientRating)}
                  </span>
                </div>
                <p className={styles.workJobText}>{r.description}</p>
                {/* Al poner precio, las fotos se abren solas para revisar bien el trabajo */}
                {r.photoCount > 0 && (
                  <RequestPhotos key={editing ? 'abiertas' : 'cerradas'} requestId={r.id} count={r.photoCount} autoLoad={editing} />
                )}

                {asking === r.id ? (
                  <div className={styles.workAsk}>
                    <p>
                      Estás apagado. <strong>¿Quieres tomar este trabajo</strong> y mandar tu precio?
                    </p>
                    <div className={styles.workJobActions}>
                      <button type="button" className={styles.workGo} onClick={() => startQuote(r, true)}>
                        Sí, quiero este trabajo
                      </button>
                      <button type="button" className={styles.workLater} onClick={() => setAsking(null)}>
                        No
                      </button>
                    </div>
                  </div>
                ) : mine && !editing ? (
                  <div className={styles.workSent}>
                    <p>
                      Mandaste <strong>{formatMxn(mine.amountMxn)}</strong> · llegas en {mine.etaMinutes} min. Te
                      avisamos si te elige.
                    </p>
                    <button type="button" className={styles.link} onClick={() => startQuote(r)}>
                      Cambiar mi precio
                    </button>
                  </div>
                ) : editing ? (
                  <div className={styles.workQuote}>
                    <label className={styles.workPrice}>
                      <span className={styles.workQuoteLabel}>¿Cuánto cobras por este trabajo?</span>
                      <span className={styles.meta}>
                        {r.photoCount > 0 ? 'Revisa la descripción y las fotos' : 'Revisa la descripción'} y pon tu precio. Mínimo{' '}
                        {formatMxn(MIN_PRICE_MXN)}.
                      </span>
                      <span className={styles.workPriceBox}>
                        <span aria-hidden="true">$</span>
                        <input
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="Tu precio"
                          value={draft.price}
                          onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                        />
                      </span>
                    </label>
                    <p className={styles.workQuoteLabel}>Llego en</p>
                    <div className={styles.workChips}>
                      {ETAS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={draft.eta === m}
                          onClick={() => setDraft({ ...draft, eta: m })}
                        >
                          {m} min
                        </button>
                      ))}
                    </div>
                    <p className={styles.workQuoteLabel}>El trabajo tarda</p>
                    <div className={styles.workChips}>
                      {DURATIONS.map(([m, label]) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={draft.duration === m}
                          onClick={() => setDraft({ ...draft, duration: m })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {r.needsInvoice && price >= MIN_PRICE_MXN && (
                      <p className={styles.meta}>
                        Pide factura: tu precio + IVA {formatMxn(ivaFor(price))} = el cliente paga{' '}
                        {formatMxn(price + ivaFor(price))}.
                      </p>
                    )}
                    {price >= MIN_PRICE_MXN ? (
                      <p className={styles.meta}>
                        Te quedan {formatMxn(net)} (Yalika cobra el {pct}%).
                      </p>
                    ) : null}
                    <div className={styles.workJobActions}>
                      <button
                        type="button"
                        className={styles.workGo}
                        disabled={busy === r.id}
                        onClick={() => void send(r)}
                      >
                        {busy === r.id
                          ? 'Mandando…'
                          : price >= MIN_PRICE_MXN && draft.eta
                            ? `Mandar ${formatMxn(price)} · llego en ${draft.eta} min`
                            : 'Mandar mi precio'}
                      </button>
                      <button type="button" className={styles.workLater} onClick={() => setOpen(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.workJobActions}>
                    <button type="button" className={styles.workGo} onClick={() => startQuote(r)}>
                      Proponer mi precio
                    </button>
                    <button type="button" className={styles.workLater} onClick={() => notInterested(r.id)}>
                      No me interesa
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/tequio/trabajo" className={styles.link}>
        Mis trabajos, mi saldo y lo que me deben
      </Link>
    </section>
  );
}

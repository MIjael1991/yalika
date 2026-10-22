'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  cancelQuestion,
  cancelRuleText,
  careLinks,
  clockLabel,
  dateTimeLabel,
  durationLabel,
  etaLabel,
  formatMxn,
  jobSteps,
  presenteApi,
  providerName,
  providerPerson,
  ratingLabel,
  requestStatusLabel,
  tradeLabel,
  urgencyLabel,
  type HelpQuote,
  type HelpRequest,
} from '@/lib/yalika-presente';

import { Chat } from '../../chat';
import { AlertsButton } from '../../alerts-button';
import { DebtNotice } from '../../debt-notice';
import { InvoiceBox } from '../../invoice-box';
import { FavoriteButton } from '../../favorite-button';
import { Avatar } from '../../icons';
import { MapView } from '../../presente-map';
import styles from '../../presente.module.css';
import { ProviderProfileView } from '../../provider-profile';
import { SafetyNote } from '../../safety-note';
import { RequestPhotos } from '../../request-photos';
import { ReviewForm } from '../../stars';

const REFRESH_MS = 10_000;
const ACTIVE = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

const statusText: Record<string, string> = {
  ASSIGNED: 'Elegiste a tu trabajador',
  EN_ROUTE: 'Va en camino',
  ARRIVED: 'Ya llegó',
  IN_PROGRESS: 'Está trabajando',
  COMPLETED: 'Trabajo terminado',
};

function QuoteCard({
  quote,
  askedFor,
  disabled,
  onChoose,
}: {
  quote: HelpQuote;
  /** Cita: la hora que pidió el cliente. */
  askedFor: string | null;
  disabled: boolean;
  onChoose: () => void;
}) {
  const [showProfile, setShowProfile] = useState(false);
  const p = quote.provider;
  return (
    <article className={styles.request}>
      <div className={styles.person}>
        <Avatar name={p.businessName || p.displayName} />
        <div className={styles.personBody}>
          <h3>{providerName(p)}</h3>
          {providerPerson(p) && <p className={styles.meta}>{providerPerson(p)}</p>}
          <p className={styles.meta}>
            {ratingLabel(p.rating)}, {p.municipalityName}
          </p>
          <div className={styles.tags}>
            {p.verified && <span className={`${styles.tag} ${styles.tagLive}`}>Verificado</span>}
            {p.isFavorite && <span className={`${styles.tag} ${styles.tagSun}`}>De confianza</span>}
          </div>
        </div>
      </div>
      <p className={styles.price}>
        {formatMxn(quote.amountMxn)}
        {quote.ivaMxn > 0 && (
          <small className={styles.ivaLine}>
            {' '}
            + IVA {formatMxn(quote.ivaMxn)} = {formatMxn(quote.amountMxn + quote.ivaMxn)}
          </small>
        )}
      </p>
      {askedFor ? (
        quote.proposedFor ? (
          <p className={styles.notice2}>
            🕐 No puede a la hora que pediste. Te propone: <strong>{dateTimeLabel(quote.proposedFor)}</strong>
          </p>
        ) : (
          <p className={styles.notice}>✔ Acepta tu cita: {dateTimeLabel(askedFor)}</p>
        )
      ) : null}
      <p>
        {askedFor ? 'El trabajo tarda aprox.' : `Llega en ${etaLabel(quote.etaMinutes)}`}
        {durationLabel(quote) ? `${askedFor ? ' ' : ' · el trabajo tarda aprox. '}${durationLabel(quote)}` : ''}
      </p>
      {p.busyUntil && (
        <p className={styles.notice2}>
          Está terminando otro trabajo; queda libre aprox. a las {clockLabel(p.busyUntil)}
        </p>
      )}
      {quote.note && <p>{quote.note}</p>}
      {showProfile && <ProviderProfileView providerId={p.id} />}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={disabled} onClick={onChoose}>
          {askedFor ? 'Confirmar cita' : 'Elegir'}
        </button>
        <button type="button" className={styles.secondary} onClick={() => setShowProfile((v) => !v)}>
          {showProfile ? 'Ocultar perfil' : 'Ver perfil y fotos'}
        </button>
      </div>
    </article>
  );
}

export function RequestDetail({ id }: { id: string }) {
  const [request, setRequest] = useState<HelpRequest | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loadedAt, setLoadedAt] = useState(0);

  const status = request?.status ?? '';
  const live = status === 'OPEN' || ACTIVE.includes(status);

  // Carga el pedido y lo actualiza solo mientras está abierto o en curso.
  useEffect(() => {
    let alive = true;
    const fetchOnce = () =>
      presenteApi
        .helpRequest(id)
        .then((loaded) => {
          if (alive) {
            setRequest(loaded);
            setLoadedAt(Date.now());
          }
        })
        .catch((failure: unknown) => {
          if (alive) setError(failure instanceof Error ? failure.message : 'No se pudo cargar tu pedido.');
        });
    void fetchOnce();
    const timer = live ? window.setInterval(() => void fetchOnce(), REFRESH_MS) : undefined;
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, [id, live, reload]);

  async function act(label: string, action: () => Promise<HelpRequest>) {
    setBusy(label);
    setError('');
    try {
      setRequest(await action());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo completar.');
    } finally {
      setBusy('');
    }
  }

  function cancel() {
    if (!request) return;
    const fee = request.job?.cancelFee;
    const text = cancelQuestion(fee?.amountMxn ?? 0, fee?.why ?? null, request.job?.provider.displayName);
    if (window.confirm(text)) void act('cancelar', () => presenteApi.cancelRequest(id));
  }

  const job = request?.job;
  // Pidió factura y no ha llegado: la calificación espera (máximo 3 días).
  const invoiceWait = Boolean(
    request?.needsInvoice &&
      !request.invoice &&
      request.reviewOpensAt &&
      new Date(request.reviewOpensAt).getTime() > loadedAt,
  );
  const stepIndex = jobSteps.findIndex(([key]) => key === status);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header>
          <p className={styles.eyebrow}>Yalika · Tequio</p>
          <h1 className={styles.title}>
            {request ? request.trades.map(tradeLabel).join(' + ') : 'Tu pedido'}
          </h1>
          <Link href="/tequio" className={styles.link}>
            Volver
          </Link>
        </header>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {!request ? (
          !error && <p className={styles.meta}>Cargando…</p>
        ) : (
          <>
            {job && stepIndex >= 0 && (
              <ol className={styles.steps} aria-label="Etapas">
                {jobSteps.map(([key, label], i) => (
                  <li key={key} data-done={i < stepIndex} data-current={i === stepIndex}>
                    {label}
                  </li>
                ))}
              </ol>
            )}

            {job && ACTIVE.includes(status) && (
              <section className={`${styles.card} ${styles.chosen}`}>
                <h2 className={styles.cardTitle}>{statusText[status]}</h2>
                <p>
                  <strong>{job.provider.displayName}</strong> · {ratingLabel(job.provider.rating)}
                </p>
                <p>
                  {formatMxn(job.amountMxn)}
                  {job.ivaMxn > 0 ? ` + IVA ${formatMxn(job.ivaMxn)} = ${formatMxn(job.amountMxn + job.ivaMxn)}` : ''}
                  {durationLabel(job) ? ` · tarda aprox. ${durationLabel(job)}` : ''}
                </p>
                {job.debtMxn > 0 && (
                  <p className={styles.notice2}>
                    Además pagas {formatMxn(job.debtMxn)} de una cancelación anterior: en total{' '}
                    {formatMxn(job.amountMxn + job.debtMxn)}.
                  </p>
                )}
                {['ASSIGNED', 'EN_ROUTE'].includes(status) && job.etaAt && (
                  <p>Llega aprox. a las {clockLabel(job.etaAt)}</p>
                )}
                {status === 'EN_ROUTE' && job.gps && (
                  <p className={styles.meta}>
                    Según su GPS va a {job.gps.km} km de tu casa: unos {job.gps.minutes} min sin tráfico.
                  </p>
                )}
                {job.delayNote && status === 'EN_ROUTE' && (
                  <p className={styles.notice2}>Se retrasa: {job.delayNote}</p>
                )}
                {status === 'IN_PROGRESS' && job.startedAt && job.estimatedMinutes && (
                  <p>
                    Termina aprox. a las{' '}
                    {clockLabel(new Date(new Date(job.startedAt).getTime() + job.estimatedMinutes * 60_000))}
                  </p>
                )}
                {job.pin && (
                  <>
                    <p className={styles.meta}>Cuando llegue, dile este PIN. No lo compartas antes.</p>
                    <p className={styles.pin}>{job.pin}</p>
                  </>
                )}
                {request.careLink && (
                  <div className={styles.careLinks}>
                    <Link href={careLinks[request.careLink].client.href} className={styles.secondary}>
                      {careLinks[request.careLink].client.label}
                    </Link>
                  </div>
                )}
                <FavoriteButton providerId={job.provider.id} initial={job.provider.isFavorite} />
              </section>
            )}

            {job && status === 'COMPLETED' && !job.clientConfirmedAt && (
              <section className={`${styles.card} ${styles.chosen}`}>
                <h2 className={styles.cardTitle}>¿Quedó bien el trabajo?</h2>
                <p>
                  Precio final: <strong>{formatMxn(job.finalAmountMxn ?? job.amountMxn)}</strong>
                  {job.ivaMxn > 0 ? ` + IVA ${formatMxn(job.ivaMxn)}` : ''}
                  {job.finalAmountMxn != null && job.finalAmountMxn !== job.amountMxn
                    ? ` (el presupuesto era ${formatMxn(job.amountMxn)})`
                    : ''}
                  {job.debtMxn > 0
                    ? `, más ${formatMxn(job.debtMxn)} de una cancelación anterior: en total ${formatMxn((job.finalAmountMxn ?? job.amountMxn) + job.debtMxn)}`
                    : ''}
                </p>
                {job.problemAt ? (
                  <p className={styles.notice2}>
                    Reportaste un problema. Yalika lo va a revisar contigo y con el trabajador.
                  </p>
                ) : (
                  <>
                    <p className={styles.meta}>
                      Confírmalo para cerrar el trabajo. Si no contestas
                      {job.confirmBy ? ` antes de ${dateTimeLabel(job.confirmBy)}` : ' en 48 horas'}, se
                      da por terminado.
                    </p>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={Boolean(busy)}
                        onClick={() => void act('confirmar', () => presenteApi.confirmDone(id))}
                      >
                        Sí, quedó bien
                      </button>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={Boolean(busy)}
                        onClick={() => {
                          const note = window.prompt('¿Qué quedó mal? Cuéntanos para ayudarte.');
                          if (note && note.trim().length >= 5) {
                            void act('problema', () => presenteApi.reportProblem(id, note));
                          } else if (note !== null) {
                            setError('Escribe un poco más qué quedó mal.');
                          }
                        }}
                      >
                        Algo quedó mal
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}

            {job && status === 'COMPLETED' && job.clientConfirmedAt && (
              <section className={`${styles.card} ${styles.chosen}`}>
                <h2 className={styles.cardTitle}>Trabajo terminado</h2>
                <p>
                  <strong>{job.provider.displayName}</strong> ·{' '}
                  {formatMxn(job.finalAmountMxn ?? job.amountMxn)}
                </p>
                <div className={styles.actions}>
                  <Link
                    href={`/tequio/pedir?con=${job.provider.id}&de=${request.id}`}
                    className={styles.primary}
                  >
                    Pedir otra vez a {job.provider.displayName.split(' ')[0]}
                  </Link>
                  <FavoriteButton providerId={job.provider.id} initial={job.provider.isFavorite} />
                </div>
                {request.careLink && (
                  <p className={styles.meta}>
                    Las recetas y medicinas que te dejen se ven en{' '}
                    <Link href={request.careLink === 'VET' ? '/veterinaria' : '/salud'} className={styles.link}>
                      {request.careLink === 'VET' ? 'Veterinaria' : 'Salud'}
                    </Link>
                    .
                  </p>
                )}
              </section>
            )}

            <section className={styles.card}>
              <span className={styles.badge}>{requestStatusLabel(status)}</span>
              <p>{request.description}</p>
              <p className={styles.meta}>
                {request.placeLabel ? `${request.placeLabel} · ` : ''}
                {request.municipalityName} · {urgencyLabel(request.urgency)}
                {request.addressHint ? ` · ${request.addressHint}` : ''}
              </p>
              <RequestPhotos requestId={request.id} count={request.photoCount ?? 0} />
              {request.scheduledFor && (
                <p>
                  <strong>Visita para el {dateTimeLabel(request.scheduledFor)}</strong>
                </p>
              )}
              {status === 'OPEN' && request.direct && request.target && (
                <div className={styles.notice2}>
                  Se lo pediste a {request.target.displayName}. Solo él lo ve.
                  {request.quotes.length === 0 && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={Boolean(busy)}
                        onClick={() => void act('abrir', () => presenteApi.openToAll(id))}
                      >
                        No contesta: pedir a todos los cercanos
                      </button>
                    </div>
                  )}
                </div>
              )}
              {status === 'OPEN' && !request.direct && (
                <p className={styles.meta}>
                  {request.nearbyPresent
                    ? request.nearbyPresent === 1
                      ? 'Hay 1 trabajador Presente cerca que ya puede verlo.'
                      : `Hay ${request.nearbyPresent} trabajadores Presentes cerca que ya pueden verlo.`
                    : 'Ahorita no hay trabajadores Presentes cerca. Tu pedido queda abierto y les llega en cuanto se pongan Presentes.'}
                </p>
              )}
              {status === 'CANCELLED' && (
                <p className={styles.meta}>
                  {request.cancelledBy === 'CLIENT' ? 'Cancelaste este pedido.' : 'Pedido cancelado.'}
                  {request.cancelFeeMxn
                    ? ` Cuota de traslado: ${formatMxn(request.cancelFeeMxn)}. Se suma a tu siguiente pedido, o se la pagas directo al trabajador.`
                    : ''}
                </p>
              )}
            </section>

            {job && ACTIVE.includes(status) && request.lat !== null && request.lng !== null && (
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>Mapa</h2>
                <MapView
                  destination={{ lat: request.lat, lng: request.lng }}
                  worker={job.lastLocation ? { lat: job.lastLocation.lat, lng: job.lastLocation.lng } : null}
                />
                {status === 'EN_ROUTE' && !job.lastLocation && (
                  <p className={styles.meta}>Aparecerá en el mapa cuando comparta su ubicación.</p>
                )}
              </section>
            )}

            {status === 'OPEN' && (
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>Presupuestos</h2>
                <DebtNotice when="choose" />
                <AlertsButton ask="¿Te avisamos al celular cuando llegue un presupuesto?" />
                {request.quotes.length === 0 ? (
                  <p className={styles.empty}>Todavía no llegan. Esta pantalla se actualiza sola.</p>
                ) : (
                  request.quotes.map((quote) => (
                    <QuoteCard
                      key={quote.id}
                      quote={quote}
                      askedFor={request.scheduledFor}
                      disabled={Boolean(busy)}
                      onChoose={() => {
                        const visit = quote.proposedFor ?? request.scheduledFor;
                        if (
                          window.confirm(
                            `¿${visit ? 'Confirmar cita con' : 'Elegir a'} ${quote.provider.displayName}${visit ? ` el ${dateTimeLabel(visit)}` : ''} por ${formatMxn(quote.amountMxn + quote.ivaMxn)}${quote.ivaMxn ? ' (con IVA)' : ''}?\n\n` +
                              cancelRuleText(quote.amountMxn),
                          )
                        ) {
                          void act('elegir', () => presenteApi.chooseQuote(id, quote.id));
                        }
                      }}
                    />
                  ))
                )}
              </section>
            )}

            {job && (
              <Chat requestId={id} side="client" open={ACTIVE.includes(status) || status === 'COMPLETED'} />
            )}

            {request.needsInvoice && status === 'COMPLETED' && <InvoiceBox requestId={id} invoice={request.invoice} />}

            {status === 'COMPLETED' && !request.reviewed && invoiceWait && (
              <p className={styles.notice}>
                Podrás calificar a {job?.provider.displayName ?? 'tu trabajador'} cuando te llegue tu factura. Si no
                llega, desde el {dateTimeLabel(request.reviewOpensAt)} ya puedes calificar y tu comentario saldrá con
                la nota «No entregó factura».
              </p>
            )}
            {status === 'COMPLETED' && !request.reviewed && !invoiceWait && (
              <>
                {request.needsInvoice && !request.invoice && (
                  <p className={styles.notice}>
                    La factura no llegó a tiempo: tu calificación saldrá con la nota «No entregó factura».
                  </p>
                )}
                <ReviewForm
                  requestId={id}
                  title={`¿Cómo te fue con ${job?.provider.displayName ?? 'tu trabajador'}?`}
                  onDone={() => setReload((n) => n + 1)}
                />
              </>
            )}
            {status === 'COMPLETED' && request.reviewed && (
              <p className={styles.notice}>Gracias por calificar.</p>
            )}

            {(status === 'COMPLETED' || ACTIVE.includes(status)) && <SafetyNote side="client" />}

            {(status === 'OPEN' || ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(status)) && (
              <div className={styles.actions}>
                <button type="button" className={styles.danger} disabled={Boolean(busy)} onClick={cancel}>
                  Cancelar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

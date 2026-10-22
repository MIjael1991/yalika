'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

import {
  cancelQuestion,
  formatMxn,
  isTrackable,
  jobSteps,
  presenteApi,
  trackingText,
  tradeLabel,
  type HelpRequestSummary,
} from '@/lib/yalika-presente';

import styles from './presente.module.css';

const ACTIVE_MS = 15_000;
const IDLE_MS = 60_000;
const POSITION_KEY = 'presente.burbuja';
const SIZE = { w: 248, h: 64 };
const CANCELLABLE = ['OPEN', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED'];

type Point = { x: number; y: number };

function readPosition(): Point | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? 'null') as Point | null;
    return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : null;
  } catch {
    return null;
  }
}

function savePosition(point: Point) {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(point));
  } catch {
    // Sin almacenamiento, la burbuja vuelve a su lugar al recargar.
  }
}

/** Que la burbuja no se salga de la pantalla ni tape el menú de abajo. */
function clamp(point: Point): Point {
  const maxX = Math.max(8, window.innerWidth - SIZE.w - 8);
  const maxY = Math.max(8, window.innerHeight - SIZE.h - 96);
  return { x: Math.min(Math.max(8, point.x), maxX), y: Math.min(Math.max(8, point.y), maxY) };
}

/**
 * Burbuja flotante del pedido en curso: dice cómo va ("Llega aprox. en 10 min") en cualquier
 * pantalla de Tequio. Se puede mover con el dedo; al tocarla abre una vista rápida.
 */
export function ActiveBubble() {
  const pathname = usePathname();
  const [items, setItems] = useState<HelpRequestSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [position, setPosition] = useState<Point | null>(null);
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const drag = useRef<{ start: Point; origin: Point; moved: boolean } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await presenteApi.myRequests();
      setItems(list.filter(isTrackable));
      setNow(new Date());
    } catch {
      // Sin sesión o sin conexión: no se muestra.
      setItems([]);
    }
  }, []);

  const tracking = items.length > 0;
  useEffect(() => {
    let live = true;
    const load = () => {
      if (live && document.visibilityState === 'visible') void refresh();
    };
    load();
    const timer = window.setInterval(load, tracking ? ACTIVE_MS : IDLE_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [refresh, tracking, pathname]);

  // Los minutos se actualizan solos aunque no llegue nada nuevo.
  useEffect(() => {
    if (!tracking) return;
    const timer = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(timer);
  }, [tracking]);

  useEffect(() => {
    const place = () =>
      setPosition((current) =>
        clamp(current ?? readPosition() ?? { x: window.innerWidth - SIZE.w - 16, y: window.innerHeight - SIZE.h - 112 }),
      );
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  const current = items[0];
  // En la pantalla de ese mismo pedido no hace falta.
  if (!current || !position || pathname === `/tequio/pedido/${current.id}`) return null;

  const text = trackingText(current, now);
  const stepIndex = jobSteps.findIndex(([key]) => key === current.status);
  const traveling = ['EN_ROUTE', 'ARRIVED'].includes(current.status);
  const fee = current.cancelFeeNowMxn ?? 0;

  function close() {
    setOpen(false);
    setAsking(false);
    setCancelError('');
  }

  async function cancelNow() {
    setCancelling(true);
    setCancelError('');
    try {
      await presenteApi.cancelRequest(current.id);
      close();
      await refresh();
    } catch (failure) {
      setCancelError(failure instanceof Error ? failure.message : 'No se pudo cancelar.');
    } finally {
      setCancelling(false);
    }
  }

  function down(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      start: { x: event.clientX, y: event.clientY },
      origin: position ?? { x: 0, y: 0 },
      moved: false,
    };
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.start.x;
    const dy = event.clientY - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    setPosition(clamp({ x: d.origin.x + dx, y: d.origin.y + dy }));
  }

  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      if (position) savePosition(position);
    } else {
      setOpen(true);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.bubble}
        style={{ left: position.x, top: position.y }}
        aria-label={`Tu pedido: ${text.title}. Toca para ver cómo va.`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen(true);
        }}
      >
        <span className={styles.bubbleDot} data-status={current.status} />
        <span className={styles.bubbleText}>
          <strong>{text.title}</strong>
          <small>
            Tu pedido · {current.trades.map(tradeLabel).join(' + ')}
            {items.length > 1 ? ` · +${items.length - 1} más` : ''}
          </small>
        </span>
      </button>

      {open && (
        <div className={styles.sheetBack} role="presentation" onClick={close}>
          <section
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="Cómo va tu pedido"
            onClick={(e) => e.stopPropagation()}
          >
            <p className={styles.eyebrow}>
              {current.trades.map(tradeLabel).join(' + ')}
              {current.placeLabel ? ` · ${current.placeLabel}` : ''}
            </p>
            <h2 className={styles.sheetTitle}>{text.title}</h2>
            {text.detail && <p className={styles.meta}>{text.detail}</p>}
            {stepIndex >= 0 && (
              <ol className={styles.steps}>
                {jobSteps.map(([key, label], i) => (
                  <li key={key} data-done={i < stepIndex} data-current={i === stepIndex}>
                    {label}
                  </li>
                ))}
              </ol>
            )}
            {traveling && (
              <p className={styles.meta}>
                Si cancelas ahora: <strong>{fee ? formatMxn(fee) : 'gratis'}</strong>
              </p>
            )}
            {asking ? (
              <div className={styles.notice2} role="alert">
                <p>
                  {cancelQuestion(
                    fee,
                    current.status === 'ARRIVED' ? 'ARRIVED' : null,
                    current.providerName ?? undefined,
                  )}
                </p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={cancelling}
                    onClick={() => void cancelNow()}
                  >
                    {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
                  </button>
                  <button type="button" className={styles.secondary} onClick={() => setAsking(false)}>
                    No, seguir
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.actions}>
                <Link href={`/tequio/pedido/${current.id}`} className={styles.primary} onClick={close}>
                  Ver mi pedido
                </Link>
                {CANCELLABLE.includes(current.status) && (
                  <button type="button" className={styles.danger} onClick={() => setAsking(true)}>
                    Cancelar pedido
                  </button>
                )}
                <button type="button" className={styles.secondary} onClick={close}>
                  Cerrar
                </button>
              </div>
            )}
            {cancelError && (
              <p role="alert" className={styles.error}>
                {cancelError}
              </p>
            )}
            {items.length > 1 && (
              <Link href="/tequio/mis-pedidos" className={styles.link} onClick={close}>
                Ver mis otros pedidos
              </Link>
            )}
          </section>
        </div>
      )}
    </>
  );
}

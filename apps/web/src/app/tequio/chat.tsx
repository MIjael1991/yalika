'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  clockLabel,
  dateTimeLabel,
  presenteApi,
  type ChatMessage,
} from '@/lib/yalika-presente';

import { CallPanel } from './call-panel';
import { RecordingPlayer } from './recording-player';
import styles from './presente.module.css';

const REFRESH_MS = 5_000;

/** Mensajes dentro de la app entre quien pide y el trabajador elegido. Sin teléfonos. */
export function Chat({
  requestId,
  open,
  side,
}: {
  requestId: string;
  open: boolean;
  side: 'client' | 'worker';
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      presenteApi
        .messages(requestId)
        .then((list) => {
          if (live) setMessages(list);
        })
        .catch(() => undefined);
    void load();
    const timer = open ? window.setInterval(() => void load(), REFRESH_MS) : undefined;
    return () => {
      live = false;
      if (timer) window.clearInterval(timer);
    };
  }, [requestId, open]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    // Parece un teléfono: se le recuerda por qué conviene seguir por aquí (decide la persona).
    if (
      /(?:\d[\s.-]?){10,}/.test(body) &&
      !window.confirm(
        'Parece que vas a compartir un teléfono.\n\nPor tu seguridad, mejor sigue por Tequio: fuera de aquí no queda registro, no hay PIN de llegada ni grabación, y no podremos ayudarte si algo sale mal.\n\n¿Mandarlo de todos modos?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      setMessages(await presenteApi.sendMessage(requestId, body));
      setText('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Mensajes</h2>
      <p className={styles.chatGuard}>
        🔒 Todo lo que hablen por aquí queda guardado como respaldo para los dos. Si te piden tu
        número o salir de Tequio, desconfía.{' '}
        <Link href={`/tequio/registro/${requestId}`}>Ver mi registro de seguridad</Link>
      </p>
      <CallPanel requestId={requestId} open={open} />
      <div className={styles.chat} aria-live="polite">
        {messages.length === 0 && <p className={styles.meta}>Todavía no hay mensajes.</p>}
        {messages.map((m) =>
          m.kind === 'TIP' ? (
            <div key={m.id} className={styles.msgTip}>
              {m.body}
            </div>
          ) : m.kind === 'RECORDING' ? (
            <div key={m.id} className={styles.msgRecording}>
              <span>🔴 {m.body}</span>
              {m.meta?.recordingId && <RecordingPlayer requestId={requestId} recordingId={m.meta.recordingId} />}
              <small>{clockLabel(m.createdAt)}</small>
            </div>
          ) : m.kind === 'CALL' ? (
            <div key={m.id} className={styles.msgCall}>
              <span>📞 {m.body}</span>
              <small>{clockLabel(m.createdAt)}</small>
            </div>
          ) : m.kind === 'FOLLOW_UP' && m.meta ? (
            <div key={m.id} className={styles.msgFollow}>
              <strong>Siguiente visita propuesta</strong>
              <span>{m.body}</span>
              {side === 'client' ? (
                <Link
                  className={styles.primary}
                  href={`/tequio/pedir?con=${encodeURIComponent(m.meta.providerId)}&de=${encodeURIComponent(m.meta.requestId)}&fecha=${encodeURIComponent(m.meta.scheduledFor)}`}
                >
                  Agendar para el {dateTimeLabel(m.meta.scheduledFor)}
                </Link>
              ) : (
                <small>Le llegó al cliente para agendarla por Tequio.</small>
              )}
            </div>
          ) : (
            <div
              key={m.id}
              className={
                m.from === 'SYSTEM' ? styles.msgSystem : m.from === 'ME' ? styles.msgMe : styles.msgOther
              }
            >
              <span>{m.body}</span>
              <small>{clockLabel(m.createdAt)}</small>
            </div>
          ),
        )}
        <div ref={end} />
      </div>
      {open && (
        <form className={styles.chatForm} onSubmit={send}>
          <input
            value={text}
            maxLength={1000}
            placeholder="Escribe un mensaje"
            aria-label="Mensaje"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className={styles.primary} disabled={busy || !text.trim()}>
            Enviar
          </button>
        </form>
      )}
      {error && <p className={styles.hint}>{error}</p>}
    </section>
  );
}

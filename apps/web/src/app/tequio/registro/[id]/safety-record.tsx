'use client';

import { useEffect, useState } from 'react';

import {
  dateTimeLabel,
  formatMxn,
  presenteApi,
  tradeLabel,
  type SafetyRecord,
} from '@/lib/yalika-presente';

import styles from '../../presente.module.css';
import { RecordingPlayer } from '../../recording-player';

/**
 * «Sábana» de seguridad de un trabajo: quién fue, a qué hora, qué se dijeron, llamadas y
 * grabaciones. Los dos la pueden ver, imprimir o guardar como PDF durante 30 días.
 */
export function SafetyRecordView({ id }: { id: string }) {
  const [record, setRecord] = useState<SafetyRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    presenteApi
      .safetyRecord(id)
      .then((loaded) => live && setRecord(loaded))
      .catch((failure: unknown) => {
        if (live) setError(failure instanceof Error ? failure.message : 'No se pudo abrir el registro.');
      });
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.noPrint}>
          <p className={styles.eyebrow}>Yalika · Tequio</p>
          <h1 className={styles.title}>Registro de seguridad</h1>
          <button type="button" className={styles.link} onClick={() => window.history.back()}>
            Volver
          </button>
        </header>
        {error && (
          <p role="alert" className={styles.notice2}>
            {error}
          </p>
        )}
        {!record && !error && <p className={styles.meta}>Cargando…</p>}
        {record && <RecordBody record={record} />}
      </div>
    </main>
  );
}

export function RecordBody({
  record,
  authorityRef,
}: {
  record: SafetyRecord;
  /** Operador con oficio de autoridad: las grabaciones se abren por su ruta. */
  authorityRef?: string;
}) {
  return (
    <article className={styles.record}>
      <section className={styles.recordHead}>
        <h2>
          {record.trades.map(tradeLabel).join(' + ')} · {record.client.name}
          {record.worker ? ` con ${record.worker.name}` : ''}
        </h2>
        <p>
          Pedido {record.requestId.slice(0, 8).toUpperCase()} · generado el {dateTimeLabel(record.generatedAt)}
        </p>
        <p className={styles.recordNote}>
          {record.sealed
            ? `Registro sellado entregado por orden de autoridad. Yalika lo resguarda ${record.keepDays} días.`
            : record.availableUntil
              ? `Lo puedes ver y guardar hasta el ${dateTimeLabel(record.availableUntil)}. Después queda sellado: Yalika lo resguarda ${record.keepDays} días y solo lo entrega con orden de una autoridad.`
              : `Mientras el trabajo siga en curso lo puedes ver; después tienes ${record.userDays} días para guardarlo.`}{' '}
          No incluye teléfonos de nadie.
        </p>
        <button type="button" className={`${styles.secondary} ${styles.noPrint}`} onClick={() => window.print()}>
          Imprimir o guardar como PDF
        </button>
      </section>

      <section>
        <h3>Datos del servicio</h3>
        <ul className={styles.plainList}>
          <li>
            <span>Qué se pidió</span> <strong>{record.description}</strong>
          </li>
          <li>
            <span>Dónde</span>{' '}
            <strong>
              {[record.place.label, record.place.hint, record.place.municipality].filter(Boolean).join(' · ') ||
                '—'}
            </strong>
          </li>
          <li>
            <span>Cliente</span> <strong>{record.client.name}</strong>
          </li>
          {record.worker && (
            <li>
              <span>Trabajador</span>{' '}
              <strong>
                {record.worker.name}
                {record.worker.name !== record.worker.person ? ` (atiende ${record.worker.person})` : ''}
                {record.worker.verified ? ' · verificado por Yalika' : ''}
              </strong>
            </li>
          )}
          {record.price && (
            <li>
              <span>Precio</span>{' '}
              <strong>
                {formatMxn(record.price.quotedMxn)}
                {record.price.finalMxn !== null && record.price.finalMxn !== record.price.quotedMxn
                  ? ` · final ${formatMxn(record.price.finalMxn)}`
                  : ''}
              </strong>
            </li>
          )}
        </ul>
      </section>

      <section>
        <h3>Qué pasó y a qué hora</h3>
        <ol className={styles.recordList}>
          {record.timeline.map((t, i) => (
            <li key={i}>
              <time>{dateTimeLabel(t.at)}</time> {t.label}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3>Llamadas por Tequio</h3>
        {record.calls.length === 0 ? (
          <p className={styles.meta}>No hubo llamadas.</p>
        ) : (
          <ol className={styles.recordList}>
            {record.calls.map((c, i) => (
              <li key={i}>
                <time>{dateTimeLabel(c.at)}</time> {c.from} llamó a {c.to} · {c.outcome}
                {c.minutes ? ` · ${c.minutes} min` : ''}
              </li>
            ))}
          </ol>
        )}
        {record.recordings.length > 0 && (
          <>
            <h4>Grabaciones</h4>
            <ol className={styles.recordList}>
              {record.recordings.map((r) => (
                <li key={r.id}>
                  <time>{dateTimeLabel(r.at)}</time> Grabó {r.by} · {Math.max(1, Math.round(r.seconds / 60))} min{' '}
                  <span className={styles.noPrint}>
                    {authorityRef ? (
                      <AuthorityRecording requestId={record.requestId} recordingId={r.id} authorityRef={authorityRef} />
                    ) : (
                      <RecordingPlayer requestId={record.requestId} recordingId={r.id} />
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section>
        <h3>Mensajes</h3>
        {record.messages.length === 0 ? (
          <p className={styles.meta}>No hubo mensajes.</p>
        ) : (
          <ol className={styles.recordList}>
            {record.messages.map((m, i) => (
              <li key={i} className={m.system ? styles.recordSystem : undefined}>
                <time>{dateTimeLabel(m.at)}</time> <strong>{m.from}:</strong> {m.body}
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

function AuthorityRecording({
  requestId,
  recordingId,
  authorityRef,
}: {
  requestId: string;
  recordingId: string;
  authorityRef: string;
}) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  if (src) return <audio controls src={src} />;
  return (
    <>
      <button
        type="button"
        className={styles.link}
        onClick={() =>
          presenteApi
            .authorityRecording(requestId, recordingId, authorityRef)
            .then((r) => setSrc(r.dataUrl))
            .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'No se pudo abrir.'))
        }
      >
        ▶ Escuchar
      </button>
      {error && <small>{error}</small>}
    </>
  );
}

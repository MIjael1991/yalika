'use client';

import { useEffect, useState, type ChangeEvent } from 'react';

import {
  CFDI_USES,
  dateTimeLabel,
  FISCAL_REGIMES,
  formatBalance,
  presenteApi,
  tradeLabel,
  type WorkInvoices,
} from '@/lib/yalika-presente';

import styles from '../presente.module.css';

const label = (list: readonly (readonly [string, string])[], code: string) =>
  `${code} · ${list.find(([c]) => c === code)?.[1] ?? ''}`;

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Pendientes de facturar: trabajos terminados donde el cliente pidió factura. El profesional la
 * hace con sus datos (portal del SAT o su sistema) y sube aquí el PDF y el XML; al cliente le
 * llega en su pedido.
 */
export function InvoicesCard() {
  const [data, setData] = useState<WorkInvoices | null>(null);
  const [files, setFiles] = useState<Record<string, { pdf?: string; xml?: string }>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let live = true;
    presenteApi
      .workInvoices()
      .then((loaded) => {
        if (!live) return;
        setData(loaded);
        setLoadedAt(Date.now());
      })
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, []);

  async function pick(id: string, kind: 'pdf' | 'xml', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const url = await readFile(file);
      // Algunos celulares no ponen el tipo del XML: se corrige aquí.
      const fixed = kind === 'xml' ? url.replace(/^data:[^;]*;/, 'data:text/xml;') : url;
      setFiles((all) => ({ ...all, [id]: { ...all[id], [kind]: fixed } }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo leer el archivo.');
    }
  }

  async function send(id: string) {
    const chosen = files[id];
    if (!chosen?.pdf || !chosen?.xml) return setError('Sube el PDF y el XML de la factura.');
    setBusy(id);
    setError('');
    try {
      setData(await presenteApi.uploadInvoice(id, chosen.pdf, chosen.xml));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo mandar la factura.');
    } finally {
      setBusy('');
    }
  }

  if (!data || (!data.pending.length && !data.sent.length)) return null;
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Pendientes de facturar</h2>
      <p className={styles.meta}>
        Haz la factura con tu RFC (en el portal del SAT o tu sistema) con estos datos y sube aquí el
        PDF y el XML. Al cliente le llega en su pedido.
      </p>
      {data.pending.length === 0 && <p className={styles.empty}>No tienes facturas pendientes.</p>}
      {data.pending.map((p) => (
        <article key={p.requestId} className={styles.request}>
          <h3>
            {p.trades.map(tradeLabel).join(' + ')}
            {p.finishedAt ? ` · ${dateTimeLabel(p.finishedAt)}` : ''}
          </h3>
          {p.dueAt && (
            <p className={new Date(p.dueAt).getTime() < loadedAt ? styles.hint : styles.meta}>
              {new Date(p.dueAt).getTime() < loadedAt
                ? 'Ya pasó el plazo: el cliente puede calificarte con la nota «No entregó factura». Mándala de todos modos.'
                : `Entrégala antes del ${dateTimeLabel(p.dueAt)}: el cliente te califica cuando le llegue.`}
            </p>
          )}
          {p.client && (
            <ul className={styles.plainList}>
              <li>
                <span>RFC</span> <strong>{p.client.rfc}</strong>
              </li>
              <li>
                <span>Nombre</span> <strong>{p.client.name}</strong>
              </li>
              <li>
                <span>Régimen</span> <strong>{label(FISCAL_REGIMES, p.client.regime)}</strong>
              </li>
              <li>
                <span>C.P.</span> <strong>{p.client.zip}</strong>
              </li>
              <li>
                <span>Uso</span> <strong>{label(CFDI_USES, p.client.use)}</strong>
              </li>
              {p.client.email && (
                <li>
                  <span>Correo</span> <strong>{p.client.email}</strong>
                </li>
              )}
            </ul>
          )}
          <p>
            {formatBalance(p.amountMxn)} + IVA {formatBalance(p.ivaMxn)} ={' '}
            <strong>{formatBalance(p.totalMxn)}</strong>
          </p>
          <div className={styles.actions}>
            <label className={styles.secondary}>
              {files[p.requestId]?.pdf ? 'PDF listo ✓' : 'Subir PDF'}
              <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void pick(p.requestId, 'pdf', e)} />
            </label>
            <label className={styles.secondary}>
              {files[p.requestId]?.xml ? 'XML listo ✓' : 'Subir XML'}
              <input type="file" accept=".xml,text/xml,application/xml" hidden onChange={(e) => void pick(p.requestId, 'xml', e)} />
            </label>
            <button
              type="button"
              className={styles.primary}
              disabled={busy === p.requestId}
              onClick={() => void send(p.requestId)}
            >
              {busy === p.requestId ? 'Mandando…' : 'Mandar factura'}
            </button>
          </div>
        </article>
      ))}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {data.sent.length > 0 && (
        <details className={styles.category}>
          <summary>
            <span>
              <strong>Facturas mandadas</strong>
              <small>{data.sent.length}</small>
            </span>
          </summary>
          <ul className={styles.plainList}>
            {data.sent.map((s) => (
              <li key={s.requestId}>
                <span>
                  {s.receiverRfc} · {dateTimeLabel(s.sentAt)}
                </span>
                <strong>{s.totalMxn !== null ? formatBalance(s.totalMxn) : ''}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

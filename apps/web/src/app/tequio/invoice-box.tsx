'use client';

import { useState } from 'react';

import { dateTimeLabel, presenteApi, type HelpRequest } from '@/lib/yalika-presente';

import styles from './presente.module.css';

/** Factura del trabajo: mientras el profesional la prepara, y para descargar PDF y XML. */
export function InvoiceBox({ requestId, invoice }: { requestId: string; invoice: HelpRequest['invoice'] }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function download(which: 'pdf' | 'xml') {
    setBusy(which);
    setError('');
    try {
      const file = await presenteApi.invoiceFile(requestId, which);
      const link = document.createElement('a');
      link.href = file.dataUrl;
      link.download = file.fileName;
      link.click();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo descargar.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Tu factura</h2>
      {invoice ? (
        <>
          <p className={styles.meta}>
            Llegó el {dateTimeLabel(invoice.sentAt)}
            {invoice.uuid ? ` · folio fiscal ${invoice.uuid}` : ''}. Guárdala o mándasela a tu contador.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={() => void download('pdf')}>
              {busy === 'pdf' ? 'Descargando…' : 'Descargar PDF'}
            </button>
            <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => void download('xml')}>
              {busy === 'xml' ? 'Descargando…' : 'Descargar XML'}
            </button>
          </div>
        </>
      ) : (
        <p className={styles.meta}>
          Pediste factura. El profesional la está preparando; te avisamos cuando llegue y aquí la
          descargas.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}

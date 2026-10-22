'use client';

/* eslint-disable @next/next/no-img-element -- documento que se ve tal cual */

import { useEffect, useState, type ChangeEvent } from 'react';

import { SEP_CERTIFICATE_URL, SEP_LOOKUP_URL, sepProofToDataUrl } from '@/lib/yalika-presente';

import styles from './presente.module.css';

/**
 * Pedirle al profesionista su comprobante de la SEP: la constancia gratuita (PDF con QR) o una
 * captura de la consulta de cédulas. Este sí lo pueden ver sus clientes para comprobarlo.
 */
export function SepProofPicker({
  value,
  onChange,
  onError,
  number,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  onError: (message: string) => void;
  number?: string;
}) {
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      onChange(await sepProofToDataUrl(file));
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : 'No se pudo preparar el archivo.');
    }
  }

  const isPdf = value.startsWith('data:application/pdf');
  return (
    <div className={styles.sepProof}>
      <ol className={styles.list}>
        <li>
          Descarga gratis tu <strong>Constancia de Situación Profesional</strong> en{' '}
          <a href={SEP_CERTIFICATE_URL} target="_blank" rel="noreferrer">
            gob.mx/cedulaprofesional
          </a>{' '}
          (trae un código QR para comprobar que es verdadera).
        </li>
        <li>
          O busca tu cédula{number ? ` ${number}` : ''} en la{' '}
          <a href={SEP_LOOKUP_URL} target="_blank" rel="noreferrer">
            consulta de cédulas de la SEP
          </a>{' '}
          y toma una captura donde se vean tu nombre, el número y la profesión.
        </li>
        <li>Súbela aquí. Este documento sí lo verán tus clientes: es tu sello de confianza.</li>
      </ol>
      <label className={styles.sepProofPick}>
        {value ? (
          isPdf ? (
            <span className={styles.sepProofFile}>📄 Constancia en PDF lista</span>
          ) : (
            <img src={value} alt="Tu comprobante de la SEP" />
          )
        ) : null}
        <span className={styles.secondary}>{value ? 'Cambiar comprobante' : 'Subir PDF o captura'}</span>
        <input type="file" accept="application/pdf,image/*" hidden onChange={pick} />
      </label>
    </div>
  );
}

/** Abrir el comprobante (foto o PDF) que manda el API como data URL. */
export function SepProofDocument({ mime, dataUrl }: { mime: string; dataUrl: string }) {
  const [pdfUrl, setPdfUrl] = useState('');

  useEffect(() => {
    if (mime !== 'application/pdf') return;
    let url = '';
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [mime, dataUrl]);

  if (mime !== 'application/pdf') {
    return <img className={styles.sepProofImage} src={dataUrl} alt="Comprobante de la SEP" />;
  }
  return pdfUrl ? (
    <a className={styles.secondary} href={pdfUrl} target="_blank" rel="noreferrer">
      📄 Abrir la constancia (PDF)
    </a>
  ) : (
    <span className={styles.meta}>Preparando el PDF…</span>
  );
}

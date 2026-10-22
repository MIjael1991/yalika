'use client';

import { useState } from 'react';

import { presenteApi } from '@/lib/yalika-presente';

import styles from './presente.module.css';

/** Escuchar o descargar una grabación de llamada (solo los dos del trabajo, 30 días). */
export function RecordingPlayer({ requestId, recordingId }: { requestId: string; recordingId: string }) {
  const [audio, setAudio] = useState<{ src: string; mime: string } | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  async function open() {
    setState('loading');
    try {
      const { dataUrl, mime } = await presenteApi.callRecording(requestId, recordingId);
      setAudio({ src: dataUrl, mime });
      setState('idle');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo abrir la grabación.');
      setState('error');
    }
  }

  if (audio) {
    const ext = audio.mime.includes('mp4') ? 'm4a' : audio.mime.includes('ogg') ? 'ogg' : 'webm';
    return (
      <span className={styles.recordingPlayer}>
        <audio controls src={audio.src} preload="metadata" />
        <a href={audio.src} download={`grabacion-tequio-${recordingId.slice(0, 8)}.${ext}`}>
          Descargar
        </a>
      </span>
    );
  }
  return (
    <span className={styles.recordingPlayer}>
      <button type="button" className={styles.link} disabled={state === 'loading'} onClick={() => void open()}>
        {state === 'loading' ? 'Abriendo…' : '▶ Escuchar grabación'}
      </button>
      {state === 'error' && <small>{error}</small>}
    </span>
  );
}

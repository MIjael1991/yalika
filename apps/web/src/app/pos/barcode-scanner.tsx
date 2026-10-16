'use client';

import { useEffect, useRef, useState } from 'react';

type BarcodeDetectorLike = {
  detect(source: unknown): Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export function BarcodeScanner({
  onCode,
  disabled = false,
}: {
  onCode: (code: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  function stop() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setOpen(false);
  }

  useEffect(() => () => stop(), []);

  async function start() {
    setError('');
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector) {
      setError('Este navegador no tiene lector de cámara compatible. Usa lector USB/Bluetooth o escribe el código.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setOpen(true);
      const video = videoRef.current;
      if (!video) throw new Error('No se pudo abrir la cámara');
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          const value = results.find((item) => item.rawValue?.trim())?.rawValue?.trim();
          if (value && !busyRef.current) {
            busyRef.current = true;
            await onCode(value);
            stop();
            busyRef.current = false;
            return;
          }
        } catch {
          // A frame can fail while the camera focuses; keep trying.
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      stop();
      setError(err instanceof Error ? err.message : 'No fue posible usar la cámara');
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? stop() : void start())}
        className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-40"
      >
        {open ? 'Cerrar cámara' : '📷 Escanear con cámara'}
      </button>
      <video
        ref={videoRef}
        muted
        playsInline
        className={open ? 'max-h-72 w-full rounded-2xl border border-slate-700 bg-black object-cover' : 'hidden'}
      />
      {error ? <p className="text-xs text-amber-300">{error}</p> : null}
    </div>
  );
}

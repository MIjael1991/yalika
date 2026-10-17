'use client';

import { useEffect, useRef, useState } from 'react';

type BarcodeDetectorLike = {
  detect(source: unknown): Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

let audioContext: AudioContext | undefined;

/** Pitido corto al leer: agudo si el producto se agregó, grave si no se reconoció. */
function beep(ok: boolean) {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioContext ??= new Ctx();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = ok ? 1200 : 300;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + (ok ? 0.08 : 0.22));
  } catch {
    // Sin sonido no pasa nada: el carrito ya muestra el resultado.
  }
}

/**
 * Lector con la cámara del teléfono. Por omisión queda abierto y sigue leyendo
 * producto tras producto (como una caja de tienda); `onCode` devuelve `false`
 * cuando el código no se pudo agregar, para avisarlo con otro sonido.
 */
export function BarcodeScanner({
  onCode,
  disabled = false,
  continuous = true,
}: {
  onCode: (code: string) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  continuous?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  // La cámara queda abierta varios productos: siempre debe usar la versión más reciente de onCode.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });
  const lastDetectRef = useRef(0);
  const lastCodeRef = useRef<{ value: string; seen: number }>({ value: '', seen: 0 });
  const [last, setLast] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  function stop() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setOpen(false);
    setLast('');
    lastCodeRef.current = { value: '', seen: 0 };
  }

  useEffect(() => () => stop(), []);

  async function start() {
    setError('');
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector) {
      setError('Este navegador no tiene lector de cámara compatible. Usa lector USB/Bluetooth o escribe el código.');
      return;
    }
    // Sin conexión segura (https) el navegador no ofrece la cámara; pasa al abrir Yalika por una dirección http del celular.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('La cámara solo funciona en una conexión segura (https). Abre Yalika con su dirección segura, o escribe el código.');
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
        const now = Date.now();
        if (now - lastDetectRef.current >= 120) {
          lastDetectRef.current = now;
          try {
            const results = await detector.detect(videoRef.current);
            const value = results.find((item) => item.rawValue?.trim())?.rawValue?.trim();
            if (value) {
              // Mientras el mismo código siga a la vista no se vuelve a contar: hay que alejarlo un momento.
              const repeated = lastCodeRef.current.value === value && now - lastCodeRef.current.seen < 1500;
              lastCodeRef.current = { value, seen: now };
              if (!repeated && !busyRef.current) {
                busyRef.current = true;
                try {
                  const accepted = await onCodeRef.current(value);
                  beep(accepted !== false);
                  setLast(value);
                } catch (err) {
                  beep(false);
                  setError(err instanceof Error ? err.message : 'No se pudo procesar el código');
                } finally {
                  busyRef.current = false;
                }
                if (!continuous) {
                  stop();
                  return;
                }
              }
            }
          } catch {
            // A frame can fail while the camera focuses; keep trying.
          }
        }
        if (streamRef.current) frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      stop();
      const denied = err instanceof Error && /NotAllowed|Permission/i.test(`${err.name} ${err.message}`);
      setError(
        denied
          ? 'No diste permiso a la cámara. Actívalo en el navegador y vuelve a intentar.'
          : err instanceof Error
            ? err.message
            : 'No fue posible usar la cámara',
      );
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
      {open ? (
        <p className="text-xs text-slate-400">
          Cámara activa: acerca cada producto y sigue con el siguiente. {last ? `Último: ${last}. ` : ''}Ciérrala al terminar.
        </p>
      ) : null}
      {error ? <p className="text-xs text-amber-300">{error}</p> : null}
    </div>
  );
}

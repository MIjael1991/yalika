'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { presenteApi, type CallConfig, type TequioCall } from '@/lib/yalika-presente';

import styles from './presente.module.css';

const WATCH_MS = 4_000;
const LIVE_MS = 1_500;
const GATHER_MS = 3_000;

type Phase = 'idle' | 'starting' | 'calling' | 'incoming' | 'answering' | 'talking';

/** Espera a que el teléfono junte sus rutas de conexión (máximo 3 s) para mandarlas de una vez. */
function gathered(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const finish = () => {
      pc.removeEventListener('icegatheringstatechange', done);
      resolve();
    };
    pc.addEventListener('icegatheringstatechange', done);
    window.setTimeout(finish, GATHER_MS);
  });
}

function mmss(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Timbre suave mientras te llaman (si el navegador deja sonar). */
function startRing() {
  let ctx: AudioContext | null = null;
  let timer = 0;
  try {
    ctx = new AudioContext();
    const beep = () => {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([300, 200, 300]);
    };
    beep();
    timer = window.setInterval(beep, 2_000);
  } catch {
    // Sin audio: se ve el aviso en pantalla.
  }
  return () => {
    window.clearInterval(timer);
    void ctx?.close().catch(() => undefined);
  };
}

/**
 * Llamar por Tequio: voz por internet entre cliente y trabajador. Nadie ve el número del otro y
 * solo se graba si uno toca «Grabar» (al otro se le avisa). Si la red no deja conectar, se sigue
 * por mensajes.
 */
export function CallPanel({ requestId, open }: { requestId: string; open: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [call, setCall] = useState<TequioCall | null>(null);
  const [notice, setNotice] = useState('');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const pc = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const config = useRef<CallConfig | null>(null);
  const callId = useRef<string | null>(null);
  const rec = useRef<{
    recorder: MediaRecorder;
    ctx: AudioContext;
    chunks: Blob[];
    callId: string;
    startedAt: number;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recNotice, setRecNotice] = useState('');

  /** Detiene la grabación y la guarda para los dos (se llama también al colgar). */
  const stopRecording = useCallback(() => {
    const current = rec.current;
    rec.current = null;
    setRecording(false);
    if (!current) return;
    current.recorder.onstop = () => {
      void current.ctx.close().catch(() => undefined);
      const blob = new Blob(current.chunks, { type: current.recorder.mimeType || 'audio/webm' });
      const seconds = Math.round((Date.now() - current.startedAt) / 1000);
      const reader = new FileReader();
      reader.onload = () => {
        presenteApi
          .saveRecording(current.callId, String(reader.result), seconds)
          .then(() => setRecNotice('Grabación guardada en el chat para los dos.'))
          .catch((failure: unknown) =>
            setRecNotice(failure instanceof Error ? failure.message : 'No se pudo guardar la grabación.'),
          );
      };
      reader.readAsDataURL(blob);
    };
    if (current.recorder.state !== 'inactive') current.recorder.stop();
  }, []);

  const hangUpLocal = useCallback((message = '') => {
    stopRecording();
    pc.current?.close();
    pc.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    callId.current = null;
    setCall(null);
    setMuted(false);
    setSeconds(0);
    setPhase('idle');
    setNotice(message);
  }, [stopRecording]);

  const loadConfig = useCallback(async () => {
    config.current ??= await presenteApi.callConfig();
    return config.current;
  }, []);

  /** Micrófono + conexión. Devuelve null si no hay permiso. */
  const prepare = useCallback(async () => {
    const cfg = await loadConfig();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice('Permite el micrófono para poder llamar (en el candado junto a la dirección).');
      return null;
    }
    const peer = new RTCPeerConnection({ iceServers: cfg.iceServers });
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      if (audio.current) {
        audio.current.srcObject = event.streams[0];
        void audio.current.play().catch(() => undefined);
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') {
        const id = callId.current;
        if (id) void presenteApi.endCall(id).catch(() => undefined);
        hangUpLocal('No se pudo conectar la llamada con esta red. Escríbanse por mensajes.');
      }
    };
    mic.current = stream;
    pc.current = peer;
    return peer;
  }, [hangUpLocal, loadConfig]);

  async function dial() {
    setNotice('');
    setPhase('starting');
    try {
      const peer = await prepare();
      if (!peer) return setPhase('idle');
      await peer.setLocalDescription(await peer.createOffer());
      await gathered(peer);
      const started = await presenteApi.startCall(requestId, peer.localDescription?.sdp ?? '');
      callId.current = started.id;
      setCall(started);
      setPhase('calling');
    } catch (failure) {
      hangUpLocal(failure instanceof Error ? failure.message : 'No se pudo llamar.');
    }
  }

  async function answer() {
    if (!call?.offerSdp) return;
    setNotice('');
    setPhase('answering');
    try {
      const peer = await prepare();
      if (!peer) {
        setPhase('incoming');
        return;
      }
      await peer.setRemoteDescription({ type: 'offer', sdp: call.offerSdp });
      await peer.setLocalDescription(await peer.createAnswer());
      await gathered(peer);
      const answered = await presenteApi.answerCall(call.id, peer.localDescription?.sdp ?? '');
      callId.current = answered.id;
      setCall(answered);
      setPhase('talking');
    } catch (failure) {
      hangUpLocal(failure instanceof Error ? failure.message : 'No se pudo contestar.');
    }
  }

  async function hangUp() {
    const id = callId.current ?? call?.id;
    if (id) await presenteApi.endCall(id).catch(() => undefined);
    hangUpLocal(phase === 'incoming' ? 'Rechazaste la llamada.' : '');
  }

  /** Grabar: se avisa al otro (le sale en rojo) y queda escrito en el chat. */
  async function startRecording() {
    const id = callId.current;
    const remote = audio.current?.srcObject;
    if (!id || !mic.current || !(remote instanceof MediaStream) || typeof MediaRecorder === 'undefined') {
      setRecNotice('Este teléfono no permite grabar la llamada.');
      return;
    }
    try {
      const updated = await presenteApi.startRecording(id);
      setCall(updated);
      const ctx = new AudioContext();
      const mix = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(mic.current).connect(mix);
      ctx.createMediaStreamSource(remote).connect(mix);
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const recorder = new MediaRecorder(mix.stream, { mimeType, audioBitsPerSecond: 16_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.start(5_000);
      rec.current = { recorder, ctx, chunks, callId: id, startedAt: Date.now() };
      setRecording(true);
      setRecNotice('');
    } catch (failure) {
      setRecNotice(failure instanceof Error ? failure.message : 'No se pudo empezar a grabar.');
    }
  }

  function toggleMute() {
    const next = !muted;
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  // Sin llamada: revisa de vez en cuando si te están llamando.
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    let live = true;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      presenteApi
        .currentCall(requestId)
        .then((current) => {
          if (live && current?.direction === 'IN' && current.status === 'RINGING') {
            callId.current = current.id;
            setCall(current);
            setPhase('incoming');
          }
        })
        .catch(() => undefined);
    };
    check();
    const timer = window.setInterval(check, WATCH_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [open, phase, requestId]);

  // Con llamada: sigue su estado (contestó, colgó, no contestó).
  useEffect(() => {
    if (!['calling', 'incoming', 'talking'].includes(phase) || !call) return;
    let live = true;
    const timer = window.setInterval(() => {
      presenteApi
        .getCall(call.id)
        .then(async (fresh) => {
          if (!live) return;
          if (['ENDED', 'MISSED', 'DECLINED'].includes(fresh.status)) {
            const message =
              fresh.status === 'ENDED'
                ? 'La llamada terminó.'
                : phase === 'incoming'
                  ? 'Te colgaron antes de contestar.'
                  : 'No contestó. Puedes escribirle un mensaje.';
            hangUpLocal(message);
            return;
          }
          // Si el otro empezó a grabar, se muestra el aviso en rojo.
          if (fresh.recordingBy !== call.recordingBy) setCall(fresh);
          if (phase === 'calling' && fresh.answerSdp && pc.current) {
            await pc.current.setRemoteDescription({ type: 'answer', sdp: fresh.answerSdp });
            setCall(fresh);
            setPhase('talking');
          }
        })
        .catch(() => undefined);
    }, LIVE_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [phase, call, hangUpLocal]);

  // Timbre al recibir.
  useEffect(() => (phase === 'incoming' ? startRing() : undefined), [phase]);

  // Reloj de la llamada y corte a los 30 minutos.
  useEffect(() => {
    if (phase !== 'talking') return;
    const begin = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - begin) / 1000);
      setSeconds(elapsed);
      const max = (config.current?.maxMinutes ?? 30) * 60;
      if (elapsed >= max) {
        const id = callId.current;
        if (id) void presenteApi.endCall(id).catch(() => undefined);
        hangUpLocal(`Las llamadas duran máximo ${max / 60} minutos.`);
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [phase, hangUpLocal]);

  // Al salir de la pantalla se cuelga (y se guarda lo grabado).
  useEffect(
    () => () => {
      stopRecording();
      const id = callId.current;
      if (id) void presenteApi.endCall(id).catch(() => undefined);
      pc.current?.close();
      mic.current?.getTracks().forEach((t) => t.stop());
    },
    [stopRecording],
  );

  if (!open) return null;
  const name = call?.otherName ?? '';

  return (
    <div className={styles.callBox}>
      <audio ref={audio} autoPlay />
      {phase === 'idle' && (
        <button type="button" className={styles.callButton} onClick={() => void dial()}>
          <PhoneIcon />
          Llamar por Tequio
          <small>Sin mostrar tu número</small>
        </button>
      )}
      {phase === 'starting' && <p className={styles.callStatus}>Preparando la llamada…</p>}
      {(phase === 'calling' || phase === 'answering') && (
        <div className={styles.callLive}>
          <p className={styles.callStatus}>
            {phase === 'calling' ? `Llamando a ${name}…` : 'Conectando…'}
          </p>
          <button type="button" className={styles.callHang} onClick={() => void hangUp()}>
            Colgar
          </button>
        </div>
      )}
      {phase === 'incoming' && (
        <div className={`${styles.callLive} ${styles.callRinging}`} role="alert">
          <p className={styles.callStatus}>
            <PhoneIcon />
            {`${name} te está llamando`}
          </p>
          <div className={styles.callActions}>
            <button type="button" className={styles.callAnswer} onClick={() => void answer()}>
              Contestar
            </button>
            <button type="button" className={styles.callHang} onClick={() => void hangUp()}>
              Rechazar
            </button>
          </div>
        </div>
      )}
      {phase === 'talking' && (
        <div className={styles.callLive}>
          <div className={styles.callHead}>
            <p className={styles.callStatus}>{`En llamada con ${name}`}</p>
            <strong className={styles.callTimer}>{mmss(seconds)}</strong>
          </div>
          {call?.recordingBy === 'OTHER' && (
            <p className={styles.callRecBanner} role="status">
              🔴 {name} está grabando esta llamada. La grabación queda para los dos.
            </p>
          )}
          {recording && (
            <p className={styles.callRecBanner} role="status">
              🔴 Estás grabando. {name} ya fue avisado.
            </p>
          )}
          <div className={styles.callActions}>
            <button type="button" className={styles.secondary} onClick={toggleMute} aria-pressed={muted}>
              {muted ? 'Activar micrófono' : 'Silenciar'}
            </button>
            {call?.recordingBy !== 'OTHER' &&
              (recording ? (
                <button type="button" className={styles.secondary} onClick={stopRecording}>
                  ⏹ Detener grabación
                </button>
              ) : (
                <button type="button" className={styles.secondary} onClick={() => void startRecording()}>
                  🔴 Grabar
                </button>
              ))}
            <button type="button" className={styles.callHang} onClick={() => void hangUp()}>
              Colgar
            </button>
          </div>
        </div>
      )}
      {notice && <p className={styles.hint}>{notice}</p>}
      {recNotice && <p className={styles.meta}>{recNotice}</p>}
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

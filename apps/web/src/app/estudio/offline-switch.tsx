"use client";
import { useEffect, useState } from "react";
import styles from "./studio.module.css";
const KEY = "estudio.sinInternet",
  DAY = 86400000;
type State = "no" | "idle" | "working" | "ready" | "error";
function saved() {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}
// Guarda el programa de Estudio en el dispositivo para abrirlo sin internet. Los datos del usuario no se guardan aquí.
export function OfflineSwitch() {
  const [state, setState] = useState<State>("idle"),
    [online, setOnline] = useState(true),
    [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const prepare = (r: ServiceWorkerRegistration) => {
    const worker = r.active ?? r.waiting ?? r.installing;
    if (!worker) return setState("error");
    setState("working");
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => {
      if (e.data?.ok) {
        try {
          localStorage.setItem(KEY, String(Date.now()));
        } catch {}
        setState("ready");
      } else setState("error");
    };
    worker.postMessage("warm", [ch.port2]);
  };
  useEffect(() => {
    const t = window.setTimeout(() => setOnline(navigator.onLine), 0);
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    (("serviceWorker" in navigator)
      ? navigator.serviceWorker.register("/estudio-sw.js", { scope: "/estudio", updateViaCache: "none" })
      : Promise.reject(new Error("sin soporte")))
        .then(async (r) => {
          await navigator.serviceWorker.ready;
          setReg(r);
          const at = saved();
          if (at) {
            setState("ready");
            if (navigator.onLine && Date.now() - at > 3 * DAY) prepare(r);
          }
        })
        .catch(() => setState("no"));
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  if (state === "no") return null;
  return (
    <div className={styles.offlineBar} role="status">
      {!online ? (
        <span>Sin internet: puedes seguir trabajando; lo que guardes queda en este dispositivo.</span>
      ) : state === "ready" ? (
        <span>Listo para usarse sin internet en este dispositivo.</span>
      ) : state === "working" ? (
        <span>Guardando Estudio para usarlo sin internet…</span>
      ) : (
        <>
          <span>{state === "error" ? "No se pudo guardar. Revisa tu conexión." : "Úsalo sin internet y sin gastar datos."}</span>
          <button className={styles.offlineButton} disabled={!reg} onClick={() => reg && prepare(reg)} type="button">
            {state === "error" ? "Intentar de nuevo" : "Guardar para usar sin internet"}
          </button>
        </>
      )}
    </div>
  );
}

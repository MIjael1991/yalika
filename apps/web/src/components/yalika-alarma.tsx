"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVE_STATUSES, hourText, isImportant, yalikaApi, type PendingTask } from "../lib/yalika-alarmas";
import { enablePush, type PushState } from "../lib/yalika-push";
import { AccionesPendiente } from "./yalika-pendiente";
import styles from "./yalika-alarma.module.css";

type Reminder = {
  id: string;
  taskId: string;
  remindAt: string;
  urgency: string;
  task: PendingTask | null;
};

const POLL_MS = 30_000;
const RENOTIFY_MS = 5 * 60_000;

/** Alarma de Yalika: no se quita hasta que digas «Ya lo hice» o «Para después». */
export function AlarmaYalika() {
  const [due, setDue] = useState<Reminder[]>([]);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const [toast, setToast] = useState("");
  const [push, setPush] = useState<PushState | "">("");
  const stopped = useRef(false);
  const lastNotified = useRef(new Map<string, number>());
  const seen = useRef(new Set<string>());

  const poll = useCallback(async () => {
    if (stopped.current) return;
    try {
      const list = await yalikaApi<Reminder[]>("reminder");
      setDue(
        list
          .filter((r) => r.urgency === "due" && r.task && ACTIVE_STATUSES.includes(r.task.status))
          .slice(0, 20),
      );
    } catch (e) {
      if (e instanceof Error && e.message === "401") stopped.current = true;
    }
  }, []);

  useEffect(() => {
    setPerm("Notification" in window ? Notification.permission : "unsupported");
    if ("Notification" in window && Notification.permission === "granted") void enablePush(false).then(setPush);
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    const wake = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("yalika:services-changed", wake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("yalika:services-changed", wake);
    };
  }, [poll]);

  // Aviso del sistema (y vibración) mientras la alarma siga sin atenderse.
  useEffect(() => {
    const fresh = due.some((r) => !seen.current.has(`${r.id}:${r.remindAt}`));
    for (const r of due) seen.current.add(`${r.id}:${r.remindAt}`);
    if (fresh && typeof navigator.vibrate === "function") navigator.vibrate([250, 120, 250, 120, 400]);
    if (!due.length || perm !== "granted" || !("serviceWorker" in navigator)) return;
    const now = Date.now();
    const pending = due.filter((r) => now - (lastNotified.current.get(r.id) ?? 0) >= RENOTIFY_MS);
    if (!pending.length || !document.hidden) return;
    const first = pending[0];
    for (const r of pending) lastNotified.current.set(r.id, now);
    const options = {
      body: pending.length > 1 ? `${first.task?.title ?? "Pendiente"} y ${pending.length - 1} más. Ábrela para responder.` : "Ábrela y dime: ya lo hice, o lo dejamos para después.",
      icon: "/app-icon-192.png",
      badge: "/app-icon-192.png",
      tag: "yalika-alarma",
      renotify: true,
      requireInteraction: true,
      vibrate: [250, 120, 250],
      data: { url: "/inicio" },
    } as NotificationOptions;
    void navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(`⏰ ${first.task?.title ?? "Tienes algo pendiente"}`, options))
      .catch(() => undefined);
  }, [due, perm]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const current = due[0];

  return (
    <>
      {current?.task && (
        <div className={styles.backdrop}>
          <div className={styles.sheet} role="alertdialog" aria-modal="true" aria-labelledby="alarma-titulo">
            <p className={styles.kicker}>
              {Date.now() - new Date(current.remindAt).getTime() > 15 * 60_000 ? "TE QUEDÓ PENDIENTE" : "⏰ ES HORA"}
              {isImportant(current.task) ? " · IMPORTANTE" : ""}
            </p>
            <h2 id="alarma-titulo" className={styles.title}>{current.task.title}</h2>
            <p className={styles.meta}>
              {current.task.dueAt ? hourText(new Date(current.task.dueAt)) : ""}
              {current.task.space?.name ? ` · ${current.task.space.name}` : ""}
            </p>
            <AccionesPendiente
              key={current.id}
              task={current.task}
              focusFirst
              onChanged={(what, detail) => {
                setDue((list) => list.filter((r) => r.id !== current.id));
                setToast(what === "done" ? "Listo, lo marqué como hecho." : `Te lo recuerdo ${detail}.`);
                window.dispatchEvent(new Event("yalika:services-changed"));
              }}
            />
            {perm === "default" && (
              <button
                type="button"
                className={styles.perm}
                onClick={() =>
                  void enablePush(true).then((state) => {
                    setPush(state);
                    setPerm("Notification" in window ? Notification.permission : "unsupported");
                  })
                }
              >
                Permitir avisos aunque tenga Yalika cerrada o en segundo plano
              </button>
            )}
            {push === "denied" && <p className={styles.more}>Bloqueaste los avisos en este navegador. Puedes permitirlos en los ajustes del sitio.</p>}
            {push === "server-off" && <p className={styles.more}>Con Yalika cerrada todavía no puedo avisarte: falta activar los avisos en el servidor.</p>}
            {due.length > 1 && <p className={styles.more}>Y tienes {due.length - 1} aviso{due.length - 1 === 1 ? "" : "s"} más después de este.</p>}
          </div>
        </div>
      )}
      {toast && (
        <p role="status" className={styles.toast}>
          {toast}
        </p>
      )}
    </>
  );
}

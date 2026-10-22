"use client";

import { useState } from "react";
import { customLater, hourText, isImportant, laterOptions, markDone, postponeTo, type PendingTask } from "../lib/yalika-alarmas";
import styles from "./yalika-pendiente.module.css";

/** «Ya lo hice» / «Para después» con horas propuestas. Lo usan el asistente del inicio y la alarma. */
export function AccionesPendiente({
  task,
  onChanged,
  focusFirst = false,
}: {
  task: PendingTask;
  onChanged: (what: "done" | "later", detail: string) => void;
  focusFirst?: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "later">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState("");
  const important = isImportant(task);
  const now = new Date();

  async function run(fn: () => Promise<unknown>, what: "done" | "later", detail: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged(what, detail);
    } catch (e) {
      setError(e instanceof Error && e.message !== "401" ? e.message : "No se pudo guardar. Intenta otra vez.");
      setBusy(false);
    }
  }

  if (mode === "later") {
    const opts = laterOptions(now, important);
    const customDate = customLater(now, custom);
    return (
      <div className={styles.opts}>
        <p className={styles.ask}>
          {important ? "Esto es importante, te lo vuelvo a avisar en:" : "¿Cuándo te lo recuerdo?"}
        </p>
        {opts.map((o) => (
          <button key={o.key} type="button" className={styles.opt} disabled={busy} onClick={() => void run(() => postponeTo(task.id, o.until), "later", o.label.toLowerCase())}>
            {o.label}
          </button>
        ))}
        <div className={styles.custom}>
          <label htmlFor={`otra-${task.id}`}>Otra hora</label>
          <input id={`otra-${task.id}`} type="time" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button
            type="button"
            className={styles.opt}
            disabled={busy || !customDate}
            onClick={() => customDate && void run(() => postponeTo(task.id, customDate), "later", `a las ${hourText(customDate)}`)}
          >
            Avisarme
          </button>
        </div>
        <button type="button" className={styles.later} disabled={busy} onClick={() => setMode("idle")}>
          Atrás
        </button>
        {error && <p role="alert" className={styles.err}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <div className={styles.btns}>
        <button type="button" className={styles.done} autoFocus={focusFirst} disabled={busy} onClick={() => void run(() => markDone(task.id), "done", "")}>
          ✓ Ya lo hice
        </button>
        <button type="button" className={styles.later} disabled={busy} onClick={() => setMode("later")}>
          Para después
        </button>
      </div>
      {error && <p role="alert" className={styles.err}>{error}</p>}
    </div>
  );
}

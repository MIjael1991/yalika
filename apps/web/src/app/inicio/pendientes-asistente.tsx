"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AccionesPendiente } from "../../components/yalika-pendiente";
import { ACTIVE_STATUSES, hourText, yalikaApi, type PendingTask } from "../../lib/yalika-alarmas";
import styles from "./pendientes-asistente.module.css";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Lo primero que dice el asistente: qué tienes pendiente hoy, y cómo atenderlo ahí mismo. */
export function PendientesAsistente({ name }: { name: string }) {
  const [tasks, setTasks] = useState<PendingTask[] | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState("");
  const [note, setNote] = useState("");
  const now = useMemo(() => new Date(), [tasks]);

  const load = useCallback(async () => {
    try {
      const today = startOfDay(new Date());
      const q = new URLSearchParams({ from: addDays(today, -14).toISOString(), to: addDays(today, 1).toISOString() });
      const list = await yalikaApi<PendingTask[]>(`task/agenda?${q}`);
      setTasks(list.filter((t) => t.dueAt && ACTIVE_STATUSES.includes(t.status)).sort((a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime()));
      setError("");
    } catch (e) {
      if (e instanceof Error && e.message === "401") window.location.assign("/login");
      else setError("No pude consultar tus pendientes.");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("yalika:services-changed", refresh);
    return () => window.removeEventListener("yalika:services-changed", refresh);
  }, [load]);

  if (error) return <p role="alert" className={styles.err}>{error}</p>;
  if (!tasks) return null;

  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const items = tasks.filter((t) => new Date(t.dueAt as string) < tomorrow).slice(0, 5);
  const late = (t: PendingTask) => new Date(t.dueAt as string) < today;
  const lateCount = tasks.filter(late).length;
  const todayCount = items.length - items.filter(late).length;
  const shown = active && items.some((t) => t.id === active) ? active : items[0]?.id;

  return (
    <div className={styles.box} aria-live="polite">
      <p className={styles.hello}>
        {greeting(now)}{name ? `, ${name}` : ""}.{" "}
        {items.length === 0
          ? "No tienes pendientes por ahora."
          : `${todayCount > 0 ? `Hoy tienes ${todayCount} ${todayCount === 1 ? "pendiente" : "pendientes"}` : "Hoy no tienes nada nuevo"}${lateCount > 0 ? ` y ${lateCount} de días anteriores` : ""}.`}
      </p>
      {items.length > 0 && <p className={styles.sub}>Dime cuando ya lo hiciste o cuándo quieres que te lo recuerde de nuevo.</p>}
      {note && <p role="status" className={styles.ok}>{note}</p>}
      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((t) => (
            <li key={t.id} className={`${styles.item} ${late(t) ? styles.late : ""}`}>
              <div className={styles.head}>
                <span className={styles.when}>{hourText(new Date(t.dueAt as string))}</span>
                <span className={styles.name}>
                  {t.title}
                  {late(t) && <span className={styles.tag}> · ATRASADO</span>}
                </span>
                {shown !== t.id && (
                  <button type="button" className={styles.open} onClick={() => setActive(t.id)}>
                    Atender
                  </button>
                )}
              </div>
              {shown === t.id && (
                <AccionesPendiente
                  key={t.id}
                  task={t}
                  onChanged={(what, detail) => {
                    setNote(what === "done" ? "Listo, lo marqué como hecho." : `Te lo recuerdo ${detail}.`);
                    setActive("");
                    void load();
                    window.dispatchEvent(new Event("yalika:services-changed"));
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

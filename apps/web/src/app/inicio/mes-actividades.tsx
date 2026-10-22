"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openOcr } from "../../lib/yalika-ocr";
import styles from "./mes-actividades.module.css";

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type Freq = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

type Task = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  space: { id: string; name: string; type: string } | null;
};
type SpaceRef = { id: string; name: string; type: string };
type Proposal = {
  title: string;
  category: string;
  suggestedSpace: SpaceRef;
  alternatives: SpaceRef[];
  needsSpaceConfirmation: boolean;
  privacyWarning: string | null;
  recurrenceFrequency: Freq | null;
  recurrenceInterval: number | null;
  recurrenceEndsAt: string | null;
  dueAt: string | null;
  temporalSummary: string | null;
  needsTemporalConfirmation: boolean;
};

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const dayLabel = (d: Date) => cap(`${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`);
const hourLabel = (d: Date) =>
  d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true });

type Repeat = { key: string; label: string; freq: Freq | null; interval: number };
const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function freqLabel(freq: Freq, interval: number) {
  const one: Record<Freq, string> = { hourly: "cada hora", daily: "cada día", weekly: "cada semana", monthly: "cada mes", yearly: "cada año" };
  const many: Record<Freq, string> = { hourly: "horas", daily: "días", weekly: "semanas", monthly: "meses", yearly: "años" };
  return interval === 1 ? one[freq] : `cada ${interval} ${many[freq]}`;
}
const REPEATS: Repeat[] = [
  { key: "once", label: "Solo esta vez", freq: null, interval: 1 },
  { key: "daily", label: "Cada día", freq: "daily", interval: 1 },
  { key: "weekly", label: "Cada semana", freq: "weekly", interval: 1 },
  { key: "monthly", label: "Cada mes", freq: "monthly", interval: 1 },
  { key: "m3", label: "Cada 3 meses", freq: "monthly", interval: 3 },
  { key: "m6", label: "Cada 6 meses", freq: "monthly", interval: 6 },
  { key: "yearly", label: "Cada año", freq: "yearly", interval: 1 },
];
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Sugiere cómo se repite según lo escrito: cumpleaños cada año, citas una vez, medicinas cada día. */
function suggestRepeat(text: string): { key: string; why: string } | null {
  const t = plain(text);
  if (!t.trim()) return null;
  if (/\b(cumple|aniversario)/.test(t)) return { key: "yearly", why: "Los cumpleaños se repiten cada año." };
  if (/\b(citas?|reunion|reuniones|junta|consulta|entrevista|examen|audiencia|boda|fiesta)\b/.test(t)) return { key: "once", why: "Una cita es de una sola fecha." };
  if (/\b(desparasit|vacun|refuerzo)/.test(t)) return { key: "m3", why: "Suele repetirse cada 3 meses; cámbialo si tu veterinario dijo otra cosa." };
  if (/\b(medicin|medicament|pastill|gota|insulina|paracetamol|antibiotic|jarabe|tomar)/.test(t)) return { key: "daily", why: "Un medicamento normalmente se recuerda cada día." };
  return null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/yalika/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (res.status === 401) {
    window.location.assign("/login");
    throw new Error("Tu sesión terminó");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Yalika respondió algo que no se pudo leer");
  }
  if (!res.ok) {
    const b = body as { message?: string | string[] } | null;
    throw new Error(Array.isArray(b?.message) ? b.message.join(". ") : (b?.message ?? "No se pudo completar"));
  }
  return body as T;
}

export function MesActividades({ overdue = 0 }: { overdue?: number }) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [picked, setPicked] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [planDate, setPlanDate] = useState("");
  const [planTime, setPlanTime] = useState("09:00");
  const [typed, setTyped] = useState<{ freq: Freq; interval: number; endsAt: string | null } | null>(null);
  const [listening, setListening] = useState(false);
  const [fromPhoto, setFromPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<InstanceType<SpeechCtor> | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [spaceId, setSpaceId] = useState("");
  const [repeat, setRepeat] = useState("once");
  const [repeatTouched, setRepeatTouched] = useState(false);
  const hint = useMemo(() => suggestRepeat(text), [text]);

  const gridStart = useMemo(() => mondayOf(month), [month]);
  const gridKey = gridStart.getTime();

  const load = useCallback(async () => {
    try {
      const from = new Date(gridKey);
      const q = new URLSearchParams({ from: from.toISOString(), to: addDays(from, 42).toISOString() });
      setTasks(await api<Task[]>(`task/agenda?${q}`));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar tu agenda");
    }
  }, [gridKey]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("yalika:services-changed", refresh);
    return () => window.removeEventListener("yalika:services-changed", refresh);
  }, [load]);

  const items = useMemo(
    () =>
      tasks
        .filter((t) => t.dueAt && t.status !== "cancelled")
        .map((t) => ({ t, at: new Date(t.dueAt as string) }))
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
    [tasks],
  );
  const forDay = (d: Date) => items.filter((x) => sameDay(x.at, d));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const dayItems = forDay(picked);
  const monthName = `${cap(MONTHS[month.getMonth()])} ${month.getFullYear()}`;

  function go(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setPicked(sameDay(next, new Date(today.getFullYear(), today.getMonth(), 1)) ? today : next);
    reset();
  }
  function goToday() {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setPicked(today);
    reset();
  }
  function reset() {
    setProposal(null);
    setTyped(null);
    setFromPhoto(false);
    setError("");
    setDone("");
  }
  function dueAtFor() {
    const [y, mo, d] = (planDate || toDateInput(picked)).split("-").map((n) => Number(n));
    const [h, m] = planTime.split(":").map((n) => Number(n));
    return new Date(y, (mo || 1) - 1, d || 1, Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0);
  }

  async function review(override?: string) {
    const title = (override ?? text).trim();
    if (!title) return;
    setBusy("Entendiendo…");
    setError("");
    setDone("");
    try {
      const p = await api<Proposal>("capture/interpret", {
        method: "POST",
        body: JSON.stringify({ message: title }),
      });
      setProposal({ ...p, title: p.title?.trim() || title });
      setSpaceId(p.suggestedSpace.id);
      // Si lo escrito ya trae fecha u hora, se usa; si no, el día elegido en el calendario a las 9:00.
      const base = p.dueAt ? new Date(p.dueAt) : new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 9, 0);
      setPlanDate(toDateInput(base));
      setPlanTime(toTimeInput(base));
      if (p.recurrenceFrequency) {
        setTyped({ freq: p.recurrenceFrequency, interval: p.recurrenceInterval ?? 1, endsAt: p.recurrenceEndsAt });
        setRepeat("typed");
      } else {
        setTyped(null);
        setRepeat(repeatTouched ? repeat : (suggestRepeat(title)?.key ?? "once"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude entender eso");
    } finally {
      setBusy("");
    }
  }

  const Speech: SpeechCtor | undefined =
    typeof window === "undefined"
      ? undefined
      : ((window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition);

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (!Speech) {
      setError("Tu navegador no entiende voz. Escribe o toma una foto.");
      return;
    }
    setError("");
    setDone("");
    const r = new Speech();
    r.lang = "es-MX";
    r.interimResults = false;
    let heard = "";
    r.onresult = (e) => {
      heard = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>)
        .map((x) => x[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    r.onerror = () => setError("No pude escucharte. Revisa el permiso del micrófono.");
    r.onend = () => {
      setListening(false);
      if (heard) {
        setText(heard);
        setFromPhoto(false);
        void review(heard);
      }
    };
    recRef.current = r;
    setListening(true);
    r.start();
  }

  async function readPhoto(f: File) {
    setBusy("Leyendo la foto en tu dispositivo…");
    setError("");
    setDone("");
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const engine = await openOcr();
      let clean = "";
      try {
        const out = await engine.recognize(canvas);
        clean = out.text.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 160);
      } finally {
        await engine.close();
      }
      if (!clean) {
        setError("No pude leer texto en la foto. Prueba con más luz o escríbelo.");
      } else {
        setText(clean);
        setFromPhoto(true);
        setBusy("");
        await review(clean);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la foto");
    } finally {
      setBusy("");
    }
  }

  const repeatOptions: Array<Repeat & { endsAt?: string | null }> = typed
    ? [
        {
          key: "typed",
          label: `Como lo escribiste: ${freqLabel(typed.freq, typed.interval)}${
            typed.endsAt ? ` hasta el ${dayLabel(new Date(typed.endsAt)).toLowerCase()}` : ""
          }`,
          freq: typed.freq,
          interval: typed.interval,
          endsAt: typed.endsAt,
        },
        ...REPEATS,
      ]
    : REPEATS;
  const chosen = repeatOptions.find((r) => r.key === repeat) ?? REPEATS[0];

  async function save() {
    if (!proposal || !spaceId) return;
    const due = dueAtFor();
    if (!Number.isFinite(due.getTime())) {
      setError("Elige una fecha y una hora válidas.");
      return;
    }
    setBusy("Guardando…");
    setError("");
    try {
      await api<Task>("task", {
        method: "POST",
        body: JSON.stringify({
          title: proposal.title,
          category: proposal.category,
          priority: "normal",
          estimatedMinutes: 30,
          spaceId,
          dueAt: due.toISOString(),
          reminderMinutesBefore: 0,
          ...(chosen.freq
            ? {
                recurrenceFrequency: chosen.freq,
                recurrenceInterval: chosen.interval,
                ...("endsAt" in chosen && chosen.endsAt ? { recurrenceEndsAt: chosen.endsAt } : {}),
              }
            : {}),
        }),
      });
      setText("");
      setProposal(null);
      setTyped(null);
      setFromPhoto(false);
      setRepeat("once");
      setRepeatTouched(false);
      const landed = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      setMonth(new Date(landed.getFullYear(), landed.getMonth(), 1));
      setPicked(landed);
      setDone(
        `Listo: quedó el ${dayLabel(landed).toLowerCase()} a las ${hourLabel(due)}${
          chosen.freq ? `, ${freqLabel(chosen.freq, chosen.interval)}` : ""
        }.`,
      );
      await load();
      window.dispatchEvent(new Event("yalika:services-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy("");
    }
  }

  const spaces = proposal ? [proposal.suggestedSpace, ...proposal.alternatives.filter((s) => s.id !== proposal.suggestedSpace.id)] : [];

  return (
    <section className={styles.card} aria-labelledby="mes-heading">
      <div className={styles.top}>
        <h2 id="mes-heading" className={styles.title}>{monthName}</h2>
        <div className={styles.nav}>
          <button type="button" className={styles.navBtn} aria-label="Mes anterior" onClick={() => go(-1)}>‹</button>
          <button type="button" className={styles.todayBtn} onClick={goToday}>Hoy</button>
          <button type="button" className={styles.navBtn} aria-label="Mes siguiente" onClick={() => go(1)}>›</button>
        </div>
      </div>

      <div>
        <div className={styles.week} aria-hidden="true">
          {LETTERS.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <div className={styles.grid} role="grid" aria-label={`Calendario de ${monthName}`}>
          {cells.map((d) => {
            const n = forDay(d).length;
            const outside = d.getMonth() !== month.getMonth();
            const cls = [
              styles.day,
              outside ? styles.outside : "",
              n ? styles.busy : "",
              sameDay(d, today) ? styles.isToday : "",
              sameDay(d, picked) ? styles.picked : "",
            ].join(" ");
            return (
              <button
                key={d.getTime()}
                type="button"
                className={cls}
                aria-pressed={sameDay(d, picked)}
                aria-label={`${dayLabel(d)}${n ? `, ${n} ${n === 1 ? "actividad" : "actividades"}` : ", sin actividades"}`}
                onClick={() => {
                  setPicked(d);
                  reset();
                }}
              >
                <span>{d.getDate()}</span>
                {sameDay(d, today) && <small className={styles.hoy}>HOY</small>}
                {n > 0 && <i className={styles.badge} aria-hidden="true">{n}</i>}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.legend}>
        <span><i style={{ background: "#d92d3a" }} />Día con actividades</span>
        <span><i style={{ background: "#62e3f2" }} />Hoy (marcado con HOY)</span>
      </div>

      <div className={styles.dayHead}>
        <h3>{sameDay(picked, today) ? `Hoy · ${dayLabel(picked)}` : dayLabel(picked)}</h3>
        <span className={styles.count}>
          {dayItems.length === 0 ? "Sin actividades" : `${dayItems.length} ${dayItems.length === 1 ? "actividad" : "actividades"}`}
        </span>
      </div>

      {loadError && <p role="alert" className={styles.err}>{loadError}</p>}

      {dayItems.length > 0 ? (
        <ul className={styles.list}>
          {dayItems.map(({ t, at }) => (
            <li key={t.id} className={styles.item}>
              <time dateTime={t.dueAt ?? undefined}>{hourLabel(at)}</time>
              <span>
                {t.title}
                {t.space?.name && <em>{t.space.name}</em>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No hay nada anotado este día. Agrégalo aquí abajo.</p>
      )}

      <div className={styles.add}>
        {!proposal ? (
          <form
            className={styles.addRow}
            onSubmit={(e) => {
              e.preventDefault();
              void review();
            }}
          >
            <label style={{ position: "absolute", left: -9999 }} htmlFor="mes-nueva">Nueva actividad</label>
            <input
              id="mes-nueva"
              className={styles.input}
              value={text}
              maxLength={160}
              placeholder={`Ej.: pastillas cada 8 horas por 10 días, o junta el día 19 a las 10`}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              className={`${styles.tool} ${listening ? styles.toolOn : ""}`}
              aria-pressed={listening}
              disabled={!!busy}
              onClick={toggleVoice}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
              {listening ? "Escuchando… toca para terminar" : "Voz"}
            </button>
            <button type="button" className={styles.tool} disabled={!!busy} onClick={() => fileRef.current?.click()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              Foto
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void readPhoto(f);
              }}
            />
            <button type="submit" className={styles.go} disabled={!text.trim() || !!busy}>
              {busy || "Agregar"}
            </button>
            {hint && (
              <p className={styles.hint}>
                {hint.why} {" "}
                <b>Se guardará: {(REPEATS.find((r) => r.key === (repeatTouched ? repeat : hint.key)) ?? REPEATS[0]).label.toLowerCase()}.</b>
              </p>
            )}
          </form>
        ) : (
          <div className={styles.confirm}>
            {fromPhoto && <p className={styles.hint}>Leí esto de tu foto: “{text}”. La foto no se guarda.</p>}
            <p>
              Voy a guardar <b>{proposal.title}</b> el <b>{dayLabel(dueAtFor()).toLowerCase()}</b> a las <b>{hourLabel(dueAtFor())}</b>
              {chosen.freq ? <>, <b>{freqLabel(chosen.freq, chosen.interval)}</b></> : <> (solo esa vez)</>}.
            </p>
            {proposal.needsTemporalConfirmation && proposal.temporalSummary && (
              <p className={styles.ask} role="status">
                Revisa la fecha: {proposal.temporalSummary}
              </p>
            )}
            <div className={styles.addRow}>
              <div className={styles.field}>
                <label htmlFor="mes-fecha">Día</label>
                <input id="mes-fecha" className={styles.time} type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="mes-hora">Hora</label>
                <input id="mes-hora" className={styles.time} type="time" value={planTime} onChange={(e) => setPlanTime(e.target.value)} />
              </div>
            </div>
            <label htmlFor="mes-repite">¿Se repite?</label>
            <select id="mes-repite" className={styles.select} value={repeat} onChange={(e) => { setRepeat(e.target.value); setRepeatTouched(true); }}>
              {repeatOptions.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            {proposal.privacyWarning && <p className={styles.pending}>{proposal.privacyWarning}</p>}
            {spaces.length > 1 && (
              <>
                <label htmlFor="mes-espacio">¿Dónde lo guardo?</label>
                <select id="mes-espacio" className={styles.select} value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </>
            )}
            <div className={styles.addRow}>
              <button type="button" className={styles.go} disabled={!!busy} onClick={() => void save()}>
                {busy || "Guardar"}
              </button>
              <button type="button" className={styles.ghost} disabled={!!busy} onClick={reset}>
                Cambiar
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert" className={styles.err}>{error}</p>}
        {done && <p role="status" className={styles.ok}>{done}</p>}
      </div>

      {overdue > 0 && (
        <Link className={styles.pending} href="/life">
          Tienes {overdue} {overdue === 1 ? "pendiente anterior" : "pendientes anteriores"}. Revisar →
        </Link>
      )}
    </section>
  );
}

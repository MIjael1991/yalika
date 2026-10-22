"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openOcr } from "../../lib/yalika-ocr";

type View = "franja" | "dia" | "semana" | "mes";

type Task = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  space: { id: string; name: string; type: string } | null;
};

type Proposal = {
  intent: "create" | "cancel" | "complete" | "find";
  title: string;
  category: string;
  confidence: "high" | "medium" | "low";
  sensitive: boolean;
  privacyWarning: string | null;
  needsSpaceConfirmation: boolean;
  suggestedSpace: { id: string; name: string; type: string };
  alternatives: Array<{ id: string; name: string; type: string }>;
  dueAt: string | null;
  recurrenceFrequency: "daily" | "weekly" | "monthly" | "yearly" | null;
  recurrenceInterval: number | null;
  recurrenceEndsAt: string | null;
  reminderMinutesBefore: number | null;
  temporalSummary: string | null;
  needsTemporalConfirmation: boolean;
  actionProposal: { message: string } | null;
};

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

const C = {
  bg: "#0A1424",
  card: "#111E34",
  card2: "#17284A",
  line: "#243756",
  text: "#F1F6FC",
  muted: "#A9BAD0",
  cyan: "#62E3F2",
  onCyan: "#06222A",
  amber: "#F6C25B",
  coral: "#F59A8F",
  teal: "#6BDDC0",
  blue: "#7FB0FF",
  violet: "#B7A5FF",
};

const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function startOfDay(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function mondayOf(d: Date) {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() + 6) % 7));
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function hm(d: Date) {
  return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?[ap]\.\s?m\./i, (m) => (/a/i.test(m) ? " am" : " pm"));
}
function shortHm(d: Date) {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dayTitle(d: Date) {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`.replace(/^./, (c) => c.toUpperCase());
}
function colorFor(t: Task) {
  const key = `${t.space?.type ?? ""} ${t.space?.name ?? ""}`.toLowerCase();
  if (/salud|health|medic/.test(key)) return C.coral;
  if (/vet|mascota|pet/.test(key)) return C.teal;
  if (/negocio|business|pos|tienda|venta/.test(key)) return C.blue;
  if (/tequio|presente|servicio/.test(key)) return C.violet;
  return C.amber;
}
function isOpen(t: Task) {
  return t.status !== "cancelled";
}
function isDone(t: Task) {
  return t.status === "completed";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/yalika/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
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

export function LineaTiempo() {
  const [view, setView] = useState<View>("franja");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [hourPx, setHourPx] = useState(76);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const gridStart = useMemo(() => mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), [anchor]);
  const gridKey = gridStart.getTime();

  const load = useCallback(async () => {
    try {
      const from = new Date(gridKey);
      const query = new URLSearchParams({ from: from.toISOString(), to: addDays(from, 42).toISOString() });
      setTasks(await api<Task[]>(`task/agenda?${query}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar tu agenda");
    }
  }, [gridKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(
    () =>
      tasks
        .filter((t) => t.dueAt && isOpen(t))
        .map((t) => ({ t, at: new Date(t.dueAt as string) }))
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
    [tasks],
  );
  const forDay = (d: Date) => items.filter((x) => sameDay(x.at, d));
  const weekStart = mondayOf(anchor);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = startOfDay(now);

  function goDay(d: Date) {
    setAnchor(startOfDay(d));
    setView("dia");
  }
  function shift(dir: number) {
    if (view === "mes") setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    else if (view === "dia") setAnchor(addDays(anchor, dir));
    else setAnchor(addDays(anchor, 7 * dir));
  }

  const title =
    view === "mes"
      ? `${MONTHS[anchor.getMonth()].replace(/^./, (c) => c.toUpperCase())} ${anchor.getFullYear()}`
      : view === "semana"
        ? `${week[0].getDate()} al ${week[6].getDate()} de ${MONTHS[week[6].getMonth()]}`
        : dayTitle(anchor);

  const dots = (d: Date) => {
    const colors = Array.from(new Set(forDay(d).map((x) => colorFor(x.t)))).slice(0, 3);
    return (
      <span style={{ display: "flex", gap: 3, height: 6 }}>
        {colors.map((c) => (
          <i key={c} style={{ width: 6, height: 6, borderRadius: 3, background: c }} />
        ))}
      </span>
    );
  };

  const overdue = items.filter((x) => x.at < now && !isDone(x.t) && x.t.status !== "completed");
  const upcoming = items.filter((x) => x.at >= now && !isDone(x.t)).slice(0, 4);

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: "100vh", padding: "20px 16px 120px", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", color: C.cyan }}>MI DÍA</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
            {view !== "franja" && (
              <span style={{ display: "flex", gap: 6 }}>
                <button aria-label="Anterior" onClick={() => shift(-1)} style={navBtn}>‹</button>
                <button aria-label="Siguiente" onClick={() => shift(1)} style={navBtn}>›</button>
              </span>
            )}
          </div>
        </div>

        <div role="tablist" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, background: C.card, borderRadius: 14, padding: 4 }}>
          {(["franja", "dia", "semana", "mes"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              style={{ height: 44, border: 0, borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: view === v ? 800 : 600, background: view === v ? C.cyan : "transparent", color: view === v ? C.onCyan : C.muted }}
            >
              {v === "dia" ? "Día" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" style={{ background: "#2A1D2B", border: "1px solid #5A3A45", borderRadius: 14, padding: "10px 14px", fontSize: 14 }}>
            {error} <button onClick={() => void load()} style={linkBtn}>Reintentar</button>
          </div>
        )}

        {view === "franja" && (
          <>
            <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{MONTHS[today.getMonth()].replace(/^./, (c) => c.toUpperCase())} {today.getFullYear()}</span>
                <button onClick={() => goDay(today)} style={{ ...pillBtn, height: 44 }}>⤢ Ampliar</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2, textAlign: "center" }}>
                {week.map((d, i) => {
                  const isToday = sameDay(d, today);
                  return (
                    <button key={i} onClick={() => goDay(d)} aria-label={dayTitle(d)} style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 0, minHeight: 44 }}>
                      <span style={{ fontSize: 12, color: isToday ? C.cyan : C.muted, fontWeight: 700 }}>{DAY_LETTERS[i]}</span>
                      <span style={{ width: 38, height: 38, borderRadius: 19, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: isToday ? 800 : 600, background: isToday ? C.cyan : "transparent", color: isToday ? C.onCyan : C.text }}>{d.getDate()}</span>
                      {dots(d)}
                    </button>
                  );
                })}
              </div>
            </section>

            {overdue.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#2A1D2B", border: "1px solid #5A3A45", borderRadius: 14, padding: "10px 14px" }}>
                <span style={{ fontSize: 14 }}><b style={{ color: C.coral }}>{overdue.length} atrasado{overdue.length > 1 ? "s" : ""}</b> · {overdue[0].t.title}</span>
                <button onClick={() => goDay(overdue[0].at)} style={linkBtn}>Ver</button>
              </div>
            )}

            <section style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: C.cyan }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.cyan, letterSpacing: "0.04em" }}>AHORA · {hm(now)}</span>
                <span style={{ flexGrow: 1, height: 1, background: C.cyan, opacity: 0.4 }} />
              </div>
              {upcoming.length === 0 && <p style={{ color: C.muted, fontSize: 15, margin: "8px 0" }}>No tienes nada pendiente próximo. Toca la burbuja para anotar algo.</p>}
              {upcoming.map(({ t, at }) => (
                <div key={t.id} style={{ display: "flex", gap: 12, padding: "8px 0" }}>
                  <div style={{ width: 70, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{hm(at)}</span>
                    <span style={{ fontSize: 12, color: C.muted }}>{whenLabel(at, now)}</span>
                  </div>
                  <span style={{ width: 4, borderRadius: 2, background: colorFor(t) }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{t.title}</span>
                    <span style={{ fontSize: 13, color: C.muted }}>{t.space?.name ?? "Mi día"}</span>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {view === "dia" && <DayView day={anchor} items={forDay(anchor)} now={now} hourPx={hourPx} setHourPx={setHourPx} />}

        {view === "semana" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, textAlign: "center" }}>
              {week.map((d, i) => {
                const isToday = sameDay(d, today);
                return (
                  <button key={i} onClick={() => goDay(d)} aria-label={dayTitle(d)} style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", minHeight: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 12, color: isToday ? C.cyan : C.muted, fontWeight: 700 }}>{DAY_LETTERS[i]}</span>
                    <span style={{ width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, background: isToday ? C.cyan : "transparent", color: isToday ? C.onCyan : C.text }}>{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            {([["MAÑANA", 0, 12], ["TARDE", 12, 19], ["NOCHE", 19, 24]] as const).map(([label, a, b]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: C.muted }}>{label}</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, background: C.card, borderRadius: 14, padding: 6, minHeight: 76, alignItems: "start" }}>
                  {week.map((d, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {forDay(d).filter((x) => x.at.getHours() >= a && x.at.getHours() < b).map(({ t, at }) => (
                        <button key={t.id} title={t.title} onClick={() => goDay(d)} style={{ height: 30, border: 0, borderRadius: 8, cursor: "pointer", background: isDone(t) ? C.line : colorFor(t), color: isDone(t) ? C.muted : C.onCyan, fontSize: 12, fontWeight: 800 }}>{shortHm(at)}</button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {view === "mes" && (
          <>
            <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: "10px 8px 8px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", textAlign: "center", paddingBottom: 4 }}>
                {DAY_LETTERS.map((l, i) => <span key={i} style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{l}</span>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                {Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).map((d) => {
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const selected = sameDay(d, anchor);
                  const isToday = sameDay(d, today);
                  return (
                    <button key={d.getTime()} onClick={() => setAnchor(startOfDay(d))} aria-label={dayTitle(d)} aria-pressed={selected} style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: 0 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: isToday || selected ? 800 : 600, background: isToday ? C.cyan : "transparent", color: isToday ? C.onCyan : inMonth ? C.text : "#5C6F8C", outline: selected && !isToday ? `2px solid ${C.cyan}` : "none" }}>{d.getDate()}</span>
                      {dots(d)}
                    </button>
                  );
                })}
              </div>
            </section>
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>{dayTitle(anchor)}</span>
              {forDay(anchor).length === 0 && <span style={{ color: C.muted, fontSize: 15 }}>Nada este día.</span>}
              {forDay(anchor).map(({ t, at }) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 4, height: 26, borderRadius: 2, background: colorFor(t) }} />
                  <span style={{ fontSize: 15, fontWeight: 700, width: 72 }}>{hm(at)}</span>
                  <span style={{ fontSize: 15, textDecoration: isDone(t) ? "line-through" : "none" }}>{t.title}</span>
                </div>
              ))}
              <button onClick={() => setView("dia")} style={{ ...pillBtn, alignSelf: "flex-start" }}>Ver el día completo</button>
            </section>
          </>
        )}
      </div>

      <button aria-label="Abrir el asistente para anotar con texto, voz o foto" onClick={() => setOpen(true)} style={{ position: "fixed", right: 20, bottom: 88, width: 64, height: 64, borderRadius: 32, border: 0, background: C.cyan, boxShadow: "0 8px 24px rgba(98,227,242,0.35)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill={C.onCyan} aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
      </button>

      {open && (
        <Bubble
          onClose={() => setOpen(false)}
          onSaved={(due) => {
            setOpen(false);
            if (due) {
              setAnchor(startOfDay(new Date(due)));
              setView("dia");
            }
            void load();
          }}
        />
      )}
    </main>
  );
}

function whenLabel(at: Date, now: Date) {
  const diff = Math.round((at.getTime() - now.getTime()) / 60000);
  if (sameDay(at, now)) return diff < 60 ? `en ${diff} min` : `en ${Math.floor(diff / 60)} h ${diff % 60} min`;
  if (sameDay(at, addDays(now, 1))) return "mañana";
  return `${WEEKDAYS[at.getDay()]} ${at.getDate()}`;
}

function DayView({ day, items, now, hourPx, setHourPx }: { day: Date; items: Array<{ t: Task; at: Date }>; now: Date; hourPx: number; setHourPx: (n: number) => void }) {
  const startH = 6;
  const endH = 24;
  const box = useRef<HTMLDivElement>(null);
  const isToday = sameDay(day, now);
  useEffect(() => {
    const h = isToday ? now.getHours() : (items[0]?.at.getHours() ?? 8);
    box.current?.scrollTo({ top: Math.max(0, (h - startH - 1) * hourPx) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.getTime(), hourPx]);
  const top = (d: Date) => (d.getHours() + d.getMinutes() / 60 - startH) * hourPx;
  const cols: number[] = [];
  items.forEach((x, i) => {
    let c = 0;
    while (items.slice(0, i).some((y, j) => cols[j] === c && Math.abs(top(y.at) - top(x.at)) < 44)) c++;
    cols[i] = c;
  });
  const maxCols = Math.max(1, ...cols.map((c) => c + 1));
  const zoom = (dir: number) => setHourPx(Math.min(160, Math.max(48, hourPx + dir * 36)));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 14, color: C.muted }}>{items.length} {items.length === 1 ? "actividad" : "actividades"}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button aria-label="Alejar" onClick={() => zoom(-1)} style={navBtn}>−</button>
          <span style={{ fontSize: 12, color: C.muted }}>Zoom</span>
          <button aria-label="Acercar" onClick={() => zoom(1)} style={navBtn}>+</button>
        </span>
      </div>
      <div ref={box} style={{ position: "relative", height: 540, overflowY: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 16 }}>
        <div style={{ position: "relative", height: (endH - startH) * hourPx }}>
          {Array.from({ length: endH - startH }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * hourPx, borderTop: `1px solid ${C.line}` }}>
              <span style={{ position: "absolute", left: 8, top: 4, fontSize: 12, color: C.muted, fontWeight: 600 }}>{((startH + i) % 12 || 12)} {startH + i < 12 ? "am" : "pm"}</span>
              {hourPx >= 110 && <span style={{ position: "absolute", left: 8, top: hourPx / 2, fontSize: 11, color: "#5C6F8C" }}>:30</span>}
            </div>
          ))}
          {items.map(({ t, at }, i) => {
            const c = colorFor(t);
            const w = `calc((100% - 76px) / ${maxCols})`;
            return (
              <div key={t.id} style={{ position: "absolute", top: top(at), left: `calc(68px + ${cols[i]} * ${w})`, width: `calc(${w} - 6px)`, minHeight: 44, height: Math.max(44, hourPx * 0.6), boxSizing: "border-box", borderRadius: 12, borderLeft: `4px solid ${c}`, background: "rgba(127,176,255,0.12)", padding: "6px 10px", display: "flex", flexDirection: "column", justifyContent: "center", opacity: isDone(t) ? 0.5 : 1 }}>
                <span style={{ fontSize: 15, fontWeight: 700, textDecoration: isDone(t) ? "line-through" : "none" }}>{t.title}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{hm(at)} · {t.space?.name ?? "Mi día"}</span>
              </div>
            );
          })}
          {isToday && (
            <>
              <div style={{ position: "absolute", left: 0, right: 0, top: top(now), height: 2, background: C.cyan }} />
              <span style={{ position: "absolute", left: 4, top: top(now) - 13, height: 26, padding: "0 8px", borderRadius: 13, background: C.cyan, color: C.onCyan, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center" }}>{shortHm(now)}</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Bubble({ onClose, onSaved }: { onClose: () => void; onSaved: (dueAt: string | null) => void }) {
  const [text, setText] = useState("");
  const [fromPhoto, setFromPhoto] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [timeOk, setTimeOk] = useState(false);
  const [listening, setListening] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const rec = useRef<InstanceType<SpeechCtor> | null>(null);
  const Speech: SpeechCtor | undefined =
    typeof window === "undefined"
      ? undefined
      : ((window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition);

  async function understand() {
    if (!text.trim()) return;
    setBusy("Entendiendo…");
    setErr("");
    try {
      const p = await api<Proposal>("capture/interpret", { method: "POST", body: JSON.stringify({ message: text.trim() }) });
      setProposal(p);
      setTitle(p.title);
      setSpaceId(p.suggestedSpace.id);
      setTimeOk(!p.needsTemporalConfirmation);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No pude entender eso");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!proposal || !title.trim() || !spaceId) return;
    setBusy("Guardando…");
    setErr("");
    try {
      const created = await api<Task>("task", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          category: proposal.category,
          priority: "normal",
          estimatedMinutes: 30,
          spaceId,
          dueAt: proposal.dueAt ?? undefined,
          recurrenceFrequency: proposal.recurrenceFrequency ?? undefined,
          recurrenceInterval: proposal.recurrenceInterval ?? undefined,
          recurrenceEndsAt: proposal.recurrenceEndsAt ?? undefined,
          reminderMinutesBefore: proposal.reminderMinutesBefore ?? undefined,
        }),
      });
      onSaved(created.dueAt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar");
      setBusy("");
    }
  }

  async function readPhoto(f: File) {
    setBusy("Leyendo la foto en tu teléfono…");
    setErr("");
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const engine = await openOcr();
      try {
        const out = await engine.recognize(canvas);
        const clean = out.text.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
        if (!clean) setErr("No pude leer texto en la foto. Prueba con más luz o escríbelo.");
        else {
          setText(clean);
          setFromPhoto(true);
        }
      } finally {
        await engine.close();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo leer la foto");
    } finally {
      setBusy("");
    }
  }

  function toggleVoice() {
    if (!Speech) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new Speech();
    r.lang = "es-MX";
    r.interimResults = false;
    r.onresult = (e) => setText(Array.from(e.results).map((x) => x[0].transcript).join(" ").trim());
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setErr("No pude usar el micrófono. Revisa el permiso del navegador.");
    };
    rec.current = r;
    setListening(true);
    r.start();
  }

  const spaces = proposal ? [proposal.suggestedSpace, ...proposal.alternatives.filter((a) => a.id !== proposal.suggestedSpace.id)] : [];
  const canSave = !!proposal && proposal.intent === "create" && !busy && !!title.trim() && !!spaceId && timeOk;

  return (
    <div role="dialog" aria-modal="true" aria-label="Asistente" style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "rgba(4,9,18,0.62)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.card, borderTop: `1px solid ${C.line}`, borderRadius: "28px 28px 0 0", padding: "14px 20px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 560, width: "100%", margin: "0 auto", maxHeight: "92vh", overflowY: "auto", color: C.text }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{proposal ? "Esto entendí" : "¿Qué quieres anotar?"}</div>
            {!proposal && <div style={{ fontSize: 13, color: C.muted }}>Escribe, dicta o toma foto de tu anotación</div>}
          </div>
          <button aria-label="Cerrar" onClick={onClose} style={{ ...navBtn, borderRadius: 22 }}>✕</button>
        </div>

        {!proposal && (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Ej: recordarme pagar la luz el viernes a las 9" style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1.5px solid ${C.cyan}`, borderRadius: 16, padding: 14, color: C.text, fontSize: 16, fontFamily: "inherit", resize: "vertical" }} />
            {fromPhoto && <div style={{ fontSize: 13, color: C.muted }}>Esto fue lo que leí de tu foto. Corrígelo si algo está mal. La foto no se guarda.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <button onClick={toggleVoice} disabled={!Speech || !!busy} style={{ ...bigBtn, opacity: Speech ? 1 : 0.5 }}>{listening ? "■ Detener" : Speech ? "🎤 Voz" : "Voz (no disponible aquí)"}</button>
              <button onClick={() => file.current?.click()} disabled={!!busy} style={bigBtn}>📷 Foto</button>
              <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readPhoto(f); }} />
            </div>
            <button onClick={() => void understand()} disabled={!text.trim() || !!busy} style={{ ...primaryBtn, opacity: text.trim() && !busy ? 1 : 0.5 }}>{busy || "Entender"}</button>
          </>
        )}

        {proposal && proposal.intent !== "create" && (
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, fontSize: 15, display: "flex", flexDirection: "column", gap: 10 }}>
            <span>{proposal.actionProposal?.message ?? "Eso es cancelar o completar algo que ya existe."}</span>
            <Link href="/life" style={{ color: C.cyan, fontWeight: 700 }}>Hazlo en Mi día →</Link>
          </div>
        )}

        {proposal && proposal.intent === "create" && (
          <div style={{ background: C.bg, border: `1.5px solid ${C.cyan}`, borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: C.muted, fontWeight: 600 }}>
              Qué
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ height: 44, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "0 12px", color: C.text, fontSize: 16, fontWeight: 700, fontFamily: "inherit" }} />
            </label>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <span style={{ width: 62, fontSize: 13, color: C.muted, fontWeight: 600 }}>Cuándo</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{proposal.dueAt ? new Date(proposal.dueAt).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "Sin fecha (queda en pendientes)"}</span>
            </div>
            {proposal.temporalSummary && <div style={{ fontSize: 13, color: C.muted }}>{proposal.temporalSummary}</div>}
            {proposal.needsTemporalConfirmation && (
              <button onClick={() => setTimeOk(true)} aria-pressed={timeOk} style={{ ...pillBtn, alignSelf: "flex-start", background: timeOk ? "rgba(246,194,91,0.16)" : C.card2, border: `1.5px solid ${timeOk ? C.amber : C.line}` }}>{timeOk ? "✓ " : ""}La fecha es correcta</button>
            )}
            {proposal.reminderMinutesBefore != null && (
              <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ width: 62, fontSize: 13, color: C.muted, fontWeight: 600 }}>Aviso</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{proposal.reminderMinutesBefore} min antes</span>
              </div>
            )}
            <div style={{ height: 1, background: C.line }} />
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>¿Dónde lo guardo?</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {spaces.map((s) => (
                <button key={s.id} onClick={() => setSpaceId(s.id)} aria-pressed={spaceId === s.id} style={{ ...pillBtn, height: 44, border: `${spaceId === s.id ? 2 : 1}px solid ${spaceId === s.id ? C.amber : C.line}`, background: spaceId === s.id ? "rgba(246,194,91,0.16)" : C.card2 }}>{spaceId === s.id ? "✓ " : ""}{s.name}</button>
              ))}
            </div>
            {proposal.needsSpaceConfirmation && <div style={{ fontSize: 12, color: C.muted }}>No estoy seguro del lugar: elige el correcto.</div>}
            {proposal.privacyWarning && <div style={{ fontSize: 13, color: C.amber }}>{proposal.privacyWarning}</div>}
          </div>
        )}

        {err && <div role="alert" style={{ color: C.coral, fontSize: 14 }}>{err}</div>}

        {proposal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => void save()} disabled={!canSave} style={{ ...primaryBtn, flexGrow: 1, opacity: canSave ? 1 : 0.5 }}>{busy || "Guardar"}</button>
              <button onClick={() => setProposal(null)} style={{ ...bigBtn, height: 54, width: 104 }}>Editar</button>
            </div>
            <button onClick={onClose} style={{ ...linkBtn, textDecoration: "none", color: C.muted, height: 44 }}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = { width: 44, height: 44, border: 0, borderRadius: 12, background: C.card2, color: C.text, fontSize: 20, cursor: "pointer" };
const pillBtn: React.CSSProperties = { padding: "0 14px", minHeight: 44, border: `1px solid ${C.line}`, borderRadius: 12, background: C.card2, color: C.text, fontSize: 14, fontWeight: 700, cursor: "pointer" };
const linkBtn: React.CSSProperties = { minHeight: 44, padding: "0 12px", border: 0, background: "transparent", color: C.text, fontSize: 14, fontWeight: 700, textDecoration: "underline", cursor: "pointer" };
const bigBtn: React.CSSProperties = { height: 64, border: `1px solid ${C.line}`, borderRadius: 18, background: C.card2, color: C.text, fontSize: 15, fontWeight: 700, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { height: 54, border: 0, borderRadius: 16, background: C.cyan, color: C.onCyan, fontSize: 17, fontWeight: 800, cursor: "pointer" };

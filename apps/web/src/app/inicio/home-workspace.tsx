"use client";
import Link from "next/link";
import { ServiceArt } from "../../components/service-art";
import { useEffect, useState } from "react";
import { MesActividades } from "./mes-actividades";
import { PendientesAsistente } from "./pendientes-asistente";
import { YalikaSearch } from "../../components/yalika-search";
import { destinations } from "../../lib/yalika-navigation";
import styles from "./home.module.css";

type Briefing = {
  today: {
    count: number;
    tasks: {
      id: string;
      title: string;
      category: string;
      dueAt: string | null;
    }[];
  };
  overdue: { count: number };
  dueReminderCount: number;
  suggestions: {
    id: string;
    kind: string;
    title: string;
    actionLabel: string;
  }[];
};
export function HomeWorkspace() {
  const [visible, setVisible] = useState<string[]>([]),
    [name, setName] = useState("");
  const [notice, setNotice] = useState("Cargando tus servicios…");
  const [briefing, setBriefing] = useState<Briefing | null>(null),
    [dayNotice, setDayNotice] = useState("Consultando tu día…");
  const [online, setOnline] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    let active: AbortController | undefined;
    async function refresh() {
      active?.abort();
      const request = new AbortController();
      active = request;
      const current = () =>
        live && active === request && !request.signal.aborted;
      setOnline(navigator.onLine);
      if (!navigator.onLine) {
        setBriefing(null);
        setDayNotice("Sin conexión. No podemos actualizar tus pendientes.");
        setNotice("Tus servicios se actualizarán al recuperar la conexión.");
        return;
      }
      const timer = setTimeout(() => request.abort(), 15000);
      async function get(path: string) {
        const r = await fetch(`/api/yalika/${path}`, {
          cache: "no-store",
          signal: request.signal,
        });
        if (r.status === 401) {
          window.location.assign("/login");
          throw Error();
        }
        if (!r.ok) throw Error();
        return r.json();
      }
      try {
        await Promise.allSettled([
          get("auth/me").then((p) => {
            if (current())
              setName(
                typeof p?.user?.name === "string"
                  ? p.user.name.trim().split(/\s+/)[0]
                  : "",
              );
          }),
          get("assistant-preference/modules")
            .then((p) => {
              if (
                !Array.isArray(p.availableModules) ||
                !(p.visibleModules === null || Array.isArray(p.visibleModules))
              )
                throw Error();
              if (current()) {
                setVisible(
                  (p.visibleModules ?? []).filter(
                    (id: unknown): id is string =>
                      typeof id === "string" && p.availableModules.includes(id),
                  ),
                );
                setNotice("");
              }
            })
            .catch(() => {
              if (live && active === request) {
                setVisible([]);
                setNotice(
                  "No pudimos consultar tus servicios. Puedes reintentar.",
                );
              }
            }),
          get("briefing/today")
            .then((p) => {
              if (
                !Array.isArray(p?.today?.tasks) ||
                !Array.isArray(p?.suggestions) ||
                !p?.overdue
              )
                throw Error();
              if (current()) {
                setBriefing(p);
                setDayNotice("");
              }
            })
            .catch(() => {
              if (live && active === request) {
                setBriefing(null);
                setDayNotice(
                  "No pudimos consultar tu día. Reintenta en un momento.",
                );
              }
            }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    void refresh();
    const update = () => {
      void refresh();
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("yalika:services-changed", update);
    return () => {
      live = false;
      active?.abort();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("yalika:services-changed", update);
    };
  }, [retry]);
  const cards = visible.flatMap((module) =>
    destinations.filter(
      (d) =>
        ["surveys", "health", "pos", "sites", "veterinaria", "presente"].includes(d.id) &&
        d.module === module,
    ),
  );
  const suggestions = (briefing?.suggestions ?? []).filter(
    (s) =>
      s.kind !== "planning" &&
      (!["inventory", "sales"].includes(s.kind) || visible.includes("pos")) &&
      (s.kind !== "sales" || visible.includes("sites")),
  );
  function time(value: string | null) {
    const d = value ? new Date(value) : null;
    return d && Number.isFinite(d.getTime())
      ? d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
      : "Sin hora";
  }
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>TU DÍA, MÁS SIMPLE</p>
            <h1>Hola{name ? `, ${name}` : ""}</h1>
            <p>Un espacio para ti. Todo a tu alcance.</p>
          </div>
          <Link href="/life#recordatorios" className={styles.notifications}>
            Avisos
            {briefing && briefing.dueReminderCount > 0
              ? ` · ${briefing.dueReminderCount}`
              : ""}{" "}
            ↗
          </Link>
        </header>
        <section aria-labelledby="services-heading">
          <div className={styles.section}>
            <h2 id="services-heading">Mis servicios</h2>
            <Link href="/servicios">Personalizar →</Link>
          </div>
          {notice && (
            <p role="status" className={styles.message}>
              {notice}
            </p>
          )}
          <div className={styles.grid}>
            {cards.map((d) => (
              <Link className={styles.card} href={d.href} key={d.id}>
                <span className={styles.art}>
                  <ServiceArt kind={d.id} />
                </span>
                <span>
                  <strong>{d.name}</strong>
                  <span className={styles.detail}>
                    {({
                      surveys: "Preguntas y respuestas",
                      health: "Tu salud, a la mano",
                      pos: "Caja, productos y ventas",
                      sites: "Tu escaparate en línea",
                      veterinaria: "Tus mascotas, al día",
                      presente: "Ayuda verificada cerca de ti",
                    } as Record<string,string>)[d.id] ?? d.detail}
                  </span>
                </span>
                <span className={styles.enter} aria-hidden>
                  ↗
                </span>
              </Link>
            ))}
          </div>
          {!notice && !cards.length && (
            <div className={styles.empty}>
              <p>
                Empieza con lo que necesitas. Puedes agregar tus servicios
                cuando quieras.
              </p>
              <Link href="/servicios">Elegir mis servicios →</Link>
            </div>
          )}
        </section>
        <div className={styles.columns}>
          <MesActividades overdue={briefing?.overdue.count ?? 0} />
          <div className={styles.side}>
            <section className={styles.panel} aria-labelledby="assistant-heading">
              <p className={styles.eyebrow}>A TU LADO</p>
              <h2 id="assistant-heading">Tu asistente</h2>
              <PendientesAsistente name={name} />
              <p className={styles.message}>
                Anota, di o toma una foto. Yalika lo ordena y tú revisas antes de guardar.
              </p>
              <div className={styles.assistantInline}>
                <YalikaSearch compact />
              </div>
              <Link className={styles.secondary} href="/estudio">
                Escribir o abrir mis archivos →
              </Link>
            </section>
            {suggestions.length > 0 && (
          <section
            className={styles.attention}
            aria-labelledby="attention-heading"
          >
            <h2 id="attention-heading">Necesita tu atención</h2>
            {suggestions.slice(0, 3).map((s) => (
              <div key={s.id}>
                <p>{s.title}</p>
                <Link
                  href={
                    s.kind === "inventory"
                      ? "/pos/inventario"
                      : s.kind === "sales"
                        ? "/sites#promotions"
                        : "/life#recordatorios"
                  }
                >
                  {s.actionLabel} →
                </Link>
              </div>
            ))}
          </section>
        )}
          </div>
        </div>
        {(notice || dayNotice) && (
          <button
            className={styles.retry}
            onClick={() => setRetry((v) => v + 1)}
          >
            Actualizar mi inicio
          </button>
        )}
        <footer className={styles.footer}>
          {online
            ? "Tus servicios, a tu ritmo."
            : "Sin conexión: las acciones que requieren el servidor no están disponibles."}
        </footer>
        
      </div>
    </main>
  );
}

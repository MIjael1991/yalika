"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { searchDestinations } from "../lib/yaleka-navigation";
import styles from "./yaleka-search.module.css";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
export function YalekaSearch({ compact = false }: { compact?: boolean }) {
  const [permitted, setPermitted] = useState(!compact);
  const [open, setOpen] = useState(!compact);
  const [text, setText] = useState("");
  const [available, setAvailable] = useState<string[]>([]);
  const [mode, setMode] = useState<"find" | "write">("find");
  const [action, setAction] = useState("spelling");
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [proposal, setProposal] = useState("");
  const [original, setOriginal] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const speech = useRef<Recognition | null>(null);
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const results = searchDestinations(text, available);
  useEffect(() => {
    let live = true;
    void fetch("/api/orion/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (live) setPermitted(p?.user?.modules?.includes("all") === true);
      })
      .catch(() => {
        if (live) setPermitted(false);
      });
    const refresh = () =>
      fetch("/api/orion/assistant-preference/modules", { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) throw Error();
          const p = await r.json();
          if (live)
            setAvailable(
              Array.isArray(p.availableModules) ? p.availableModules : [],
            );
        })
        .catch(() => {
          if (live) setAvailable([]);
        });
    void refresh();
    window.addEventListener("yalika:services-changed", refresh);
    return () => {
      live = false;
      window.removeEventListener("yalika:services-changed", refresh);
      speech.current?.abort();
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!compact) return;
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [compact, open]);
  function change(value: string) {
    version.current++;
    setText(value);
    setProposal("");
    setNotice("");
  }
  function close() {
    setOpen(false);
    speech.current?.abort();
    controller.current?.abort();
    version.current++;
  }
  function dictate() {
    if (listening) {
      speech.current?.stop();
      return;
    }
    const w = window as typeof window & {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Constructor) {
      setNotice("Este navegador no ofrece dictado. Puedes escribir.");
      return;
    }
    const recognition = new Constructor();
    speech.current = recognition;
    recognition.lang = "es-MX";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e) => change(e.results[0][0].transcript);
    recognition.onerror = () => {
      setListening(false);
      setNotice(
        "No pudimos escuchar. Revisa el permiso del micrófono o escribe.",
      );
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
    } catch {
      setNotice("No se pudo iniciar el micrófono.");
    }
  }
  async function improve() {
    if (busy || !consent || !text.trim()) return;
    const snapshot = text,
      requestVersion = version.current;
    setBusy(true);
    setNotice("");
    setProposal("");
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 35000);
    try {
      const r = await fetch("/api/orion/business-assistant/writing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: snapshot, action, consent: true }),
        signal: abort.signal,
      });
      const p = await r.json().catch(() => null);
      if (!r.ok || typeof p?.text !== "string")
        throw Error(
          typeof p?.message === "string"
            ? p.message
            : "No se pudo obtener la propuesta. Tu texto sigue intacto.",
        );
      if (requestVersion !== version.current) return;
      setOriginal(snapshot);
      setProposal(p.text);
      setNotice(
        "Propuesta de IA: revisa nombres, cantidades y significado. No se ha guardado en tus servicios ni enviado a otras personas.",
      );
    } catch (e) {
      if (requestVersion === version.current)
        setNotice(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "La solicitud se interrumpió. Conservamos tu texto.",
        );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  const content = (
    <div className={styles.box}>
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>YALEKA · A TU LADO</span>
          <h2>¿Qué necesitas hacer?</h2>
        </div>
        {compact && (
          <button onClick={close} aria-label="Cerrar buscador">
            Cerrar
          </button>
        )}
      </div>
      <div className={styles.tabs}>
        <button aria-pressed={mode === "find"} onClick={() => setMode("find")}>
          Buscar en Yaleka
        </button>
        <button
          aria-pressed={mode === "write"}
          onClick={() => setMode("write")}
        >
          Ayúdame a escribir
        </button>
      </div>
      <label className={styles.label}>
        {mode === "find"
          ? "¿Qué quieres encontrar?"
          : "Tu texto o la idea de tu pregunta"}
        <textarea
          lang="es-MX"
          spellCheck
          maxLength={mode === "find" ? 180 : 3000}
          rows={mode === "find" ? 2 : 5}
          value={text}
          onChange={(e) => change(e.target.value)}
          placeholder={
            mode === "find"
              ? "Ejemplo: me quedan pocos productos"
              : "Escribe tu idea, aunque todavía no sepas cómo decirla…"
          }
        />
      </label>
      <div className={styles.actions}>
        <button onClick={dictate} aria-pressed={listening}>
          {listening ? "Detener micrófono" : "🎙 Hablar"}
        </button>
        {text && <button onClick={() => change("")}>Limpiar texto</button>}
      </div>
      <p className={styles.small}>
        El dictado depende de tu navegador y puede usar su servicio de voz. Nada
        se ejecuta al dictar.
      </p>
      {mode === "find" ? (
        <div className={styles.results}>
          {!text.trim() && (
            <div className={styles.actions}>
              {[
                "Mi agenda",
                ...(available.includes("health") ? ["Mis recetas"] : []),
                ...(available.includes("pos") ? ["Cambiar precios"] : []),
                ...(available.includes("sites") ? ["Mi catálogo"] : []),
              ]
                .slice(0, 3)
                .map((v) => (
                  <button key={v} onClick={() => change(v)}>
                    {v}
                  </button>
                ))}
            </div>
          )}
          {results.map((r) => (
            <Link
              key={r.id}
              href={r.href}
              onClick={() => {
                if (compact) close();
              }}
            >
              <strong>
                {r.name} <span aria-hidden>↗</span>
              </strong>
              <small className={styles.match}>{r.reason}</small>
              <span>{r.detail}</span>
            </Link>
          ))}
          {text.trim() && !results.length && (
            <p>
              No encontré una coincidencia suficientemente clara. Dime qué
              quieres hacer y con qué: por ejemplo, “cambiar el precio de un
              producto” o “ver mis medicamentos”.
            </p>
          )}
          <p className={styles.small}>
            Encuentra funciones de tus servicios. También reconoce términos
            relacionados y errores sencillos de escritura. Para buscar un
            registro o documento concreto, abre su servicio.
          </p>
          <Link
            href="/life#orion-captura"
            onClick={() => {
              if (compact) close();
            }}
          >
            Organizar una tarea o consultar el asistente de negocio →
          </Link>
        </div>
      ) : (
        <div className={styles.results}>
          <label>
            Qué quieres mejorar
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                version.current++;
                setProposal("");
              }}
            >
              <option value="spelling">Ortografía y puntuación</option>
              <option value="clarity">Que se entienda mejor</option>
              <option value="question">
                Convertir mi idea en una pregunta
              </option>
            </select>
          </label>
          <p className={styles.small}>
            El corrector del navegador puede subrayar errores sin usar la IA de
            Yaleka. Para una propuesta completa se necesita el proveedor
            configurado.
          </p>
          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Autorizo enviar solo este texto al proveedor de IA. No incluyas
            contraseñas, expedientes ni identificaciones.
          </label>
          <button
            className={styles.primary}
            disabled={busy || !consent || !text.trim()}
            onClick={() => void improve()}
          >
            {busy ? "Preparando propuesta…" : "Proponer mejora"}
          </button>
          {proposal && (
            <section className={styles.proposal}>
              <h3>Revisa antes de usar</h3>
              <details>
                <summary>Texto original</summary>
                <p>{original}</p>
              </details>
              <p>{proposal}</p>
              <div className={styles.actions}>
                <button
                  onClick={() => {
                    change(proposal);
                    setNotice(
                      "Texto aplicado en este editor. Puedes copiarlo al campo que necesites.",
                    );
                  }}
                >
                  Usar texto aquí
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(proposal);
                      setNotice("Propuesta copiada.");
                    } catch {
                      setNotice(
                        "No se pudo copiar; selecciona el texto para copiarlo manualmente.",
                      );
                    }
                  }}
                >
                  Copiar propuesta
                </button>
                <button
                  onClick={() => {
                    setProposal("");
                    setNotice("Propuesta descartada.");
                  }}
                >
                  Descartar
                </button>
              </div>
            </section>
          )}
        </div>
      )}
      <p role="status" className={styles.notice}>
        {notice}
      </p>
    </div>
  );
  if (compact && !permitted) return null;
  if (!compact) return content;
  return (
    <>
      <button
        className={styles.launch}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z" />
        </svg>
        <strong>¿Qué necesitas?</strong>
        <span>Buscar o hablar</span>
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        onCancel={close}
        onClose={() => setOpen(false)}
        aria-label="Buscador y asistente Yaleka"
      >
        {content}
      </dialog>
    </>
  );
}

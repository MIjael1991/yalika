"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { exportPdf, exportWord } from "../../lib/yalika-document";
import type { FileScope } from "../../lib/yalika-local-files";
import { LANGUAGES, TIERS, hasWebGpu, openAsr, type Tier } from "../../lib/yalika-asr";
import { isMedia, decodeMedia } from "../../lib/yalika-media";
import { transcribe, type Outcome, type Stage } from "../../lib/yalika-transcribe";
import { clock, fileBase, hasDoubt, replaceAll, shakyIn, stats, toDocument, toSrt, toText, toVtt, type Segment } from "../../lib/yalika-transcript";
import { clearDraft, loadDraft, saveDraft, type Draft } from "../../lib/yalika-transcript-draft";
import { Delivery } from "./delivery";
import styles from "./studio.module.css";

const size = (n: number) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const minutes = (s: number) => (s < 90 ? Math.max(1, Math.round(s)) + " s" : s < 5400 ? "unos " + Math.round(s / 60) + " min" : "unas " + (s / 3600).toFixed(1) + " h");
const message = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal.");
type Made = { blob: Blob; name: string; detail: string };

export function TranscribeWorkspace({ scope }: { scope: FileScope }) {
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""),
    [tier, setTier] = useState<Tier>("preciso"),
    [language, setLanguage] = useState("spanish"),
    [gpu, setGpu] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState<Stage | null>(null),
    [notice, setNotice] = useState(""),
    [segments, setSegments] = useState<Segment[]>([]),
    [info, setInfo] = useState<Pick<Outcome, "seconds" | "notes" | "device" | "engineNote" | "missing"> | null>(null),
    [onlyDoubt, setOnlyDoubt] = useState(false),
    [times, setTimes] = useState(false),
    [mark, setMark] = useState(true),
    [made, setMade] = useState<Made | null>(null),
    [find, setFind] = useState(""),
    [swap, setSwap] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    abort = useRef<AbortController | null>(null),
    media = useRef<HTMLMediaElement | null>(null),
    stopAt = useRef<number | null>(null),
    wake = useRef<{ release(): Promise<void> } | null>(null);

  useEffect(() => {
    let live = true;
    void hasWebGpu().then((v) => live && setGpu(v));
    void Promise.resolve().then(() => live && setDraft(loadDraft(scope)));
    return () => {
      live = false;
    };
  }, [scope]);
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    void Promise.resolve().then(() => setUrl(u));
    return () => {
      URL.revokeObjectURL(u);
      setUrl("");
    };
  }, [file]);
  // El borrador se guarda solo mientras se corrige, para no perder horas de trabajo si se cierra la pestaña.
  useEffect(() => {
    if (!file || busy || !segments.length) return;
    const t = setTimeout(() => saveDraft(scope, { name: file.name, size: file.size, language, tier, savedAt: new Date().toISOString(), seconds: info?.seconds ?? 0, segments }), 800);
    return () => clearTimeout(t);
  }, [scope, file, busy, segments, language, tier, info]);
  useEffect(() => () => abort.current?.abort(), []);

  function pick(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    if (!isMedia(f)) return setNotice("Ese archivo no es una grabación ni un video. Elige MP3, M4A, WAV, OGG, MP4, MOV, WebM…");
    // Si se recuperó un borrador sin el archivo, al elegirlo se conserva el texto y se puede volver a escuchar.
    if (file && file.size === 0 && segments.length) {
      setFile(f);
      return setNotice("Listo: ya puedes escuchar cada parte.");
    }
    setFile(f);
    setSegments([]);
    setInfo(null);
    setMade(null);
    setNotice("");
    setStage(null);
  }

  async function start() {
    if (!file || busy) return;
    setBusy(true);
    setSegments([]);
    setInfo(null);
    setMade(null);
    setNotice("");
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      wake.current = await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen").catch(() => null) ?? null;
    } catch {
      wake.current = null;
    }
    try {
      const out = await transcribe(
        file,
        { decode: decodeMedia, open: (onDownload) => openAsr(tier, onDownload) },
        {
          language: language || null,
          signal: ctl.signal,
          onStage: (s) => {
            setStage(s);
            if (s.stage === "escuchando") setSegments(s.partial);
          },
        },
      );
      setSegments(out.segments);
      setInfo({ seconds: out.seconds, notes: out.notes, device: out.device, engineNote: out.engineNote, missing: out.missing });
      setMark(out.segments.some(hasDoubt));
      setDraft(null);
    } catch (e) {
      setNotice(ctl.signal.aborted ? "Cancelado. Lo que alcanzó a escribir queda abajo." : message(e));
    } finally {
      void wake.current?.release().catch(() => undefined);
      wake.current = null;
      setBusy(false);
      setStage(null);
    }
  }

  const play = useCallback((s: Segment) => {
    const m = media.current;
    if (!m) return;
    m.currentTime = Math.max(0, s.start - 0.3);
    stopAt.current = s.end + 0.3;
    void m.play().catch(() => undefined);
  }, []);
  function onTime() {
    const m = media.current;
    if (m && stopAt.current !== null && m.currentTime >= stopAt.current) {
      m.pause();
      stopAt.current = null;
    }
  }
  const edit = (i: number, patch: Partial<Segment>) => setSegments((all) => all.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  function nextDoubt() {
    const i = segments.findIndex(hasDoubt);
    if (i < 0) return;
    document.getElementById("seg-" + i)?.scrollIntoView({ block: "center", behavior: "smooth" });
    play(segments[i]);
  }
  async function make(kind: "docx" | "pdf" | "txt" | "srt" | "vtt") {
    if (!file || !segments.length) return;
    setNotice("");
    try {
      const base = fileBase(file.name) + " (transcripción)",
        langName = LANGUAGES.find(([k]) => k === language)?.[1] ?? "automático",
        meta = { title: "Transcripción: " + fileBase(file.name), source: file.name, duration: info?.seconds ?? segments[segments.length - 1].end, language: langName, date: new Date() },
        opt = { times, doubts: mark },
        words = stats(segments).words + " palabras";
      if (kind === "docx") setMade({ blob: await exportWord(toDocument(segments, meta, opt)), name: base + ".docx", detail: "Word · " + words });
      else if (kind === "pdf") setMade({ blob: await exportPdf(toDocument(segments, meta, opt)), name: base + ".pdf", detail: "PDF · " + words });
      else if (kind === "txt") setMade({ blob: new Blob([toText(segments, opt)], { type: "text/plain;charset=utf-8" }), name: base + ".txt", detail: "Texto · " + words });
      else if (kind === "srt") setMade({ blob: new Blob([toSrt(segments)], { type: "application/x-subrip" }), name: base + ".srt", detail: "Subtítulos SRT" });
      else setMade({ blob: new Blob([toVtt(segments)], { type: "text/vtt" }), name: base + ".vtt", detail: "Subtítulos WebVTT" });
    } catch (e) {
      setNotice(message(e));
    }
  }

  const total = stats(segments),
    shown = useMemo(() => segments.map((s, i) => ({ s, i })).filter(({ s }) => !onlyDoubt || hasDoubt(s)), [segments, onlyDoubt]),
    chosen = TIERS.find((t) => t.id === tier)!,
    video = !!file && (file.type.startsWith("video/") || /\.(mp4|m4v|mov|mkv|webm|3gp|avi)$/i.test(file.name)),
    shakyTotal = useMemo(() => segments.reduce((n, s) => n + shakyIn(s).length, 0), [segments]),
    ready = segments.length > 0 && !busy;
  const picker = (label: string, className: string) => (
    <label className={className} aria-disabled={busy}>
      {label}
      <input
        hidden
        type="file"
        accept="audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.mp4,.mov,.mkv,.webm,.amr,.3gp"
        disabled={busy}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
  const bar = stage?.stage === "leyendo" ? stage.fraction : stage?.stage === "modelo" ? (stage.total ? stage.loaded / stage.total : 0) : stage?.stage === "escuchando" ? stage.secondsDone / Math.max(1, stage.secondsTotal) : 0;
  const quality = info ? (info.notes.mostlySilent ? ["Casi todo es silencio", "warn"] : info.notes.noisy ? ["Con mucho ruido", "warn"] : info.notes.tooQuiet ? ["Voz muy baja", "warn"] : ["Audio claro", "ok"]) : null;

  const player =
    url && file && file.size > 0 ? (
      video ? (
        <video ref={media as React.RefObject<HTMLVideoElement>} src={url} controls className={styles.txPlayer} onTimeUpdate={onTime} />
      ) : (
        <audio ref={media as React.RefObject<HTMLAudioElement>} src={url} controls className={styles.txPlayer} onTimeUpdate={onTime} />
      )
    ) : null;
  const fileCard = file && (
    <section className={`${styles.uiCard} ${segments.length ? styles.txFirst : ""}`} aria-label="Archivo">
      <div className={styles.txFile}>
        <span className={styles.txFileIcon} aria-hidden="true">
          {video ? <Icon d="M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm15 4 4-2v8l-4-2" /> : <Icon d="M4 12v0M8 8v8M12 4v16M16 8v8M20 12v0" />}
        </span>
        <div>
          <strong className={styles.txFileName} title={file.name}>
            {file.name}
          </strong>
          <span className={styles.txMeta}>
            {video ? "Video" : "Audio"}
            {file.size > 0 ? " · " + size(file.size) : ""}
            {info ? " · " + clock(info.seconds) : ""}
          </span>
        </div>
      </div>
      {player}
      {file.size === 0 && <p className={styles.uiNote}>Para escuchar cada parte, elige otra vez el mismo archivo.</p>}
      {picker(file.size === 0 ? "Elegir el archivo" : "Cambiar archivo", styles.uiGhost)}
    </section>
  );

  return (
    <main className={`${styles.workspace} ${styles.tx}`}>
      <header className={styles.uiHead}>
        <div>
          <span className={styles.uiEyebrow}>Convertir</span>
          <h1>Audio y video a texto</h1>
          <p>Pasa una grabación, una nota de voz, una clase o un video a texto y descárgalo en Word, PDF o subtítulos.</p>
        </div>
        <span className={styles.uiPrivacy}>
          <Icon d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Zm-3 9 2.2 2.2L15.5 10" /> Todo en este dispositivo
        </span>
      </header>

      {!file && (
        <>
          <div className={styles.uiDrop} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
            <span className={styles.uiDropIcon} aria-hidden="true">
              <Icon d="M4 12v0M8 8v8M12 4v16M16 8v8M20 12v0" size={34} />
            </span>
            <strong>Elige la grabación o el video</strong>
            <p>MP3, M4A, WAV, OGG, MP4, MOV, WebM y más · hasta 3 horas. También puedes arrastrar el archivo aquí.</p>
            {picker("Elegir audio o video", styles.uiCta)}
          </div>
          {draft && (
            <div className={styles.txBanner}>
              <div>
                <strong>Tienes una transcripción guardada</strong>
                <span>
                  «{draft.name}» · {new Date(draft.savedAt).toLocaleString("es-MX")}
                </span>
              </div>
              <div className={styles.txBannerActions}>
                <button
                  type="button"
                  className={styles.uiSolid}
                  onClick={() => {
                    setSegments(draft.segments);
                    setLanguage(draft.language);
                    setTier(draft.tier);
                    setInfo({ seconds: draft.seconds, notes: { tooQuiet: false, noisy: false, mostlySilent: false }, device: "wasm", missing: 0 });
                    setNotice("Recuperada. Para escuchar cada parte, elige otra vez el mismo archivo de audio o video.");
                    setFile(new File([], draft.name));
                  }}
                >
                  Recuperarla
                </button>
                <button type="button" onClick={() => { clearDraft(scope); setDraft(null); }}>
                  Descartarla
                </button>
              </div>
            </div>
          )}
          <ul className={styles.uiFeatures}>
            <li>
              <strong>Privado</strong>
              <span>El audio nunca sale de tu equipo ni se sube a internet.</span>
            </li>
            <li>
              <strong>Sin conexión</strong>
              <span>El modelo se descarga una vez; después funciona sin internet.</span>
            </li>
            <li>
              <strong>Revisión guiada</strong>
              <span>Marca lo dudoso y te deja escuchar cada parte antes de entregar.</span>
            </li>
          </ul>
        </>
      )}

      {file && !segments.length && !busy && (
        <div className={styles.txGrid}>
          {fileCard}
          <section className={styles.uiCard} aria-label="Ajustes">
            <h2 className={styles.uiCardTitle}>Ajustes</h2>
            <label className={styles.txField}>
              Idioma que se habla
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className={styles.uiTiers}>
              <legend>Exactitud</legend>
              {TIERS.map((t) => {
                const blocked = t.gpuOnly && gpu === false;
                return (
                  <label key={t.id} className={styles.uiTier} aria-disabled={blocked}>
                    <input type="radio" name="tier" checked={tier === t.id} disabled={blocked} onChange={() => setTier(t.id)} />
                    <span>
                      <span className={styles.uiTierTop}>
                        <strong>{t.label}</strong>
                        {t.id === "preciso" && <em>Recomendado</em>}
                        <small>{t.size}</small>
                      </span>
                      <span className={styles.uiTierHint}>{blocked ? "No disponible: este navegador o equipo no tiene WebGPU." : t.hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <p className={styles.uiNote}>
              Con «{chosen.label}» se descargan {chosen.size} la primera vez y quedan en este dispositivo. Deja esta pestaña abierta mientras trabaja.
              {gpu === false && " Este equipo no tiene aceleración gráfica compatible, así que será más lento: una hora de audio puede tardar varias horas. Para audios largos usa «Rápido»."}
            </p>
            <button type="button" className={styles.uiCta} onClick={() => void start()}>
              Transcribir
            </button>
          </section>
        </div>
      )}

      {busy && stage && (
        <section className={styles.txProgress} aria-live="polite" aria-label="Avance">
          <ol className={styles.txSteps}>
            {(["leyendo", "modelo", "escuchando"] as const).map((k, n) => {
              const at = ["leyendo", "modelo", "escuchando"].indexOf(stage.stage);
              return (
                <li key={k} className={n < at ? styles.txStepDone : n === at ? styles.txStepNow : undefined} aria-current={n === at ? "step" : undefined}>
                  <span>{n < at ? "✓" : n + 1}</span>
                  {["Leer el audio", "Preparar el modelo", "Escribir el texto"][n]}
                </li>
              );
            })}
          </ol>
          <strong>
            {stage.stage === "leyendo" && "Leyendo y limpiando el audio…"}
            {stage.stage === "modelo" && (stage.total ? `Descargando el modelo de voz (solo la primera vez): ${size(stage.loaded)} de ${size(stage.total)}` : "Preparando el modelo de voz…")}
            {stage.stage === "escuchando" && `Escribiendo: bloque ${stage.done} de ${stage.total}${stage.eta !== null ? " · faltan " + minutes(stage.eta) : ""}`}
          </strong>
          <div className={styles.progress} role="progressbar" aria-valuenow={Math.round(bar * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: Math.round(bar * 100) + "%" }} />
          </div>
          <button type="button" onClick={() => abort.current?.abort()}>
            Cancelar
          </button>
        </section>
      )}

      {notice && (
        <p role="status" className={styles.uiNotice}>
          {notice}
        </p>
      )}

      {info && segments.length > 0 && (
        <section className={styles.txStats} aria-label="Resumen">
          <div>
            <b>{total.words.toLocaleString("es-MX")}</b>
            <span>palabras</span>
          </div>
          <div>
            <b>{clock(info.seconds)}</b>
            <span>de grabación</span>
          </div>
          <div className={total.doubtful ? styles.txStatWarn : styles.txStatOk}>
            <b>{total.doubtful}</b>
            <span>{total.doubtful === 1 ? "parte por revisar" : "partes por revisar"}</span>
          </div>
          <div className={quality && quality[1] === "warn" ? styles.txStatWarn : undefined}>
            <b>{quality?.[0]}</b>
            <span>{info.device === "webgpu" ? "con tarjeta gráfica" : "con el procesador"}</span>
          </div>
        </section>
      )}
      {info?.engineNote && <p className={styles.uiNote}>{info.engineNote}</p>}
      {ready && info && file && file.size > 0 && tier !== "maximo" && (info.notes.noisy || total.doubtful > segments.length / 4) && (tier === "rapido" || gpu) && (
        <div className={styles.uiNotice}>
          Este audio tiene ruido o partes difíciles; con otro nivel de exactitud saldría mejor.{" "}
          <button
            type="button"
            onClick={() => {
              setTier(tier === "rapido" ? "preciso" : "maximo");
              setSegments([]);
              setInfo(null);
              setMade(null);
              setNotice("");
            }}
          >
            Volver a transcribir con «{tier === "rapido" ? "Preciso" : "Máxima precisión"}» (se pierden los cambios hechos)
          </button>
        </div>
      )}

      {segments.length > 0 && (
        <div className={styles.txWork}>
          <div className={styles.txMain}>
            <div className={styles.txTools}>
              <div className={styles.uiSeg} role="group" aria-label="Qué mostrar">
                <button type="button" aria-pressed={!onlyDoubt} onClick={() => setOnlyDoubt(false)}>
                  Todo ({segments.length})
                </button>
                <button type="button" aria-pressed={onlyDoubt} onClick={() => setOnlyDoubt(true)} disabled={!total.doubtful && !onlyDoubt}>
                  Por revisar ({total.doubtful})
                </button>
              </div>
              {total.doubtful > 0 && (
                <button type="button" className={styles.uiSolid} onClick={nextDoubt}>
                  Ir a la siguiente parte dudosa
                </button>
              )}
              <details className={styles.txFind}>
                <summary>Buscar y cambiar</summary>
                <div>
                  <input aria-label="Buscar" placeholder="Palabra mal escrita" value={find} onChange={(e) => setFind(e.target.value)} />
                  <input aria-label="Cambiar por" placeholder="Cómo debe decir" value={swap} onChange={(e) => setSwap(e.target.value)} />
                  <button
                    type="button"
                    disabled={!find}
                    onClick={() => {
                      const r = replaceAll(segments, find, swap);
                      setSegments(r.segments);
                      setNotice(r.count ? `Se cambió ${r.count} vez/veces.` : "No se encontró esa palabra.");
                    }}
                  >
                    Cambiar todo
                  </button>
                </div>
              </details>
            </div>
            {ready && shakyTotal > 0 && <p className={styles.uiNote}>Las palabras en amarillo son donde el modelo dudó: toca una para escuchar esa parte.</p>}
            <ol className={styles.txList} aria-label="Texto con sus tiempos">
              {shown.map(({ s, i }) => {
                const doubt = hasDoubt(s),
                  shaky = shakyIn(s);
                return (
                  <li key={i} id={"seg-" + i} className={doubt ? `${styles.txRow} ${styles.txRowDoubt}` : s.reviewed ? `${styles.txRow} ${styles.txRowOk}` : styles.txRow}>
                    <button type="button" className={styles.txTime} disabled={!file || file.size === 0} onClick={() => play(s)} aria-label={"Escuchar desde " + clock(s.start)}>
                      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                        <path d="M2 1v10l9-5z" fill="currentColor" />
                      </svg>
                      {clock(s.start)}
                    </button>
                    <div className={styles.txBody}>
                      <AutoText label={"Texto de " + clock(s.start)} value={s.text} onChange={(v) => edit(i, { text: v, reviewed: s.reviewed })} />
                      {shaky.length > 0 && (
                        <p className={styles.txChips}>
                          {shaky.map((w) => (
                            <button key={w} type="button" onClick={() => play(s)} title="Escuchar esta parte">
                              {w}
                            </button>
                          ))}
                        </p>
                      )}
                      {doubt && (
                        <p className={styles.txWhy}>
                          <b>Revisar</b> {s.doubt.join(" ")}
                          <button type="button" onClick={() => edit(i, { reviewed: true })}>
                            Está bien
                          </button>
                        </p>
                      )}
                      {s.reviewed && s.doubt.length > 0 && <p className={styles.txDone}>Revisada</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <aside className={styles.txSide}>
            {fileCard}
            {ready && (
              <section className={`${styles.uiCard} ${styles.txLast}`} aria-label="Descargar">
                <h2 className={styles.uiCardTitle}>Descargar</h2>
                <label className={styles.check}>
                  <input type="checkbox" checked={times} onChange={(e) => setTimes(e.target.checked)} /> Poner la hora en cada párrafo
                </label>
                <label className={styles.check}>
                  <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} /> Marcar con [¿?] lo que no he revisado ({total.doubtful})
                </label>
                <button type="button" className={styles.uiCta} onClick={() => void make("docx")}>
                  Descargar en Word
                </button>
                <div className={styles.txFormats}>
                  <button type="button" onClick={() => void make("pdf")}>PDF</button>
                  <button type="button" onClick={() => void make("txt")}>Texto</button>
                  <button type="button" onClick={() => void make("srt")}>SRT</button>
                  <button type="button" onClick={() => void make("vtt")}>VTT</button>
                </div>
                <p className={styles.uiNote}>SRT y VTT son subtítulos para video. Ningún programa escribe lo que oye sin errores: revisa lo marcado antes de usar el texto en algo importante.</p>
              </section>
            )}
            {made && (
              <div className={styles.txLast}>
                <Delivery blob={made.blob} name={made.name} detail={made.detail} scope={scope} />
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// Cuadro de texto que crece con lo escrito: así se lee toda la frase sin barras de desplazamiento.
function AutoText({ value, onChange, label }: { value: string; onChange(v: string): void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [value]);
  return <textarea ref={ref} rows={1} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />;
}

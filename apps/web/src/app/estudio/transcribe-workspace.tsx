"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    video = !!file && (file.type.startsWith("video/") || /\.(mp4|m4v|mov|mkv|webm|3gp|avi)$/i.test(file.name));
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

  return (
    <main className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <h1>Audio y video a texto</h1>
          <p>Pasa una grabación, una nota de voz, una clase o un video a texto y descárgalo en Word. Todo ocurre en este dispositivo: el audio no se sube a internet.</p>
        </div>
      </div>
      {!file ? (
        <div className={styles.drop} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
          <strong>Elige la grabación o el video</strong>
          <p>MP3, M4A, WAV, OGG, MP4, MOV, WebM y más. Hasta 3 horas. También puedes arrastrar el archivo aquí.</p>
          {picker("Elegir audio o video", styles.bigButton)}
          {draft && (
            <p>
              Tienes una transcripción guardada de «{draft.name}» ({new Date(draft.savedAt).toLocaleString("es-MX")}).{" "}
              <button
                type="button"
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
              </button>{" "}
              <button type="button" onClick={() => { clearDraft(scope); setDraft(null); }}>
                Descartarla
              </button>
            </p>
          )}
        </div>
      ) : (
        <>
          <div className={styles.fileRow}>
            <span className={styles.fileChip}>
              {file.name} · {video ? "Video" : "Audio"} · {size(file.size)}
            </span>
            {picker("Cambiar archivo", styles.import)}
          </div>
          {url && file.size > 0 && (video ? (
            <video ref={media as React.RefObject<HTMLVideoElement>} src={url} controls className={styles.player} onTimeUpdate={onTime} />
          ) : (
            <audio ref={media as React.RefObject<HTMLAudioElement>} src={url} controls className={styles.player} onTimeUpdate={onTime} />
          ))}
          {!segments.length && !busy && (
            <div className={styles.convertCard}>
              <label className={styles.bigField}>
                Idioma que se habla
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className={styles.tiers}>
                <legend>Exactitud</legend>
                {TIERS.map((t) => {
                  const blocked = t.gpuOnly && gpu === false;
                  return (
                    <label key={t.id} className={styles.tier} aria-disabled={blocked}>
                      <input type="radio" name="tier" checked={tier === t.id} disabled={blocked} onChange={() => setTier(t.id)} />
                      <span>
                        <strong>{t.label}</strong> · descarga {t.size} la primera vez
                        <small>{blocked ? "No disponible: este navegador o equipo no tiene WebGPU." : t.hint}</small>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              <p className={styles.help}>
                El modelo se descarga una sola vez y queda en este dispositivo; después funciona sin internet.{" "}
                {gpu === false && "Este equipo no tiene aceleración gráfica compatible, así que será más lento: una hora de audio puede tardar varias horas. Para audios largos usa «Rápido»."}
              </p>
              <button type="button" className={styles.primary} onClick={() => void start()}>
                Transcribir
              </button>
              <p className={styles.help}>Con «{chosen.label}» se descarga {chosen.size}. Deja esta pestaña abierta mientras trabaja.</p>
            </div>
          )}
        </>
      )}
      {busy && stage && (
        <section className={styles.progressBlock} aria-live="polite">
          <strong>
            {stage.stage === "leyendo" && "Leyendo el audio…"}
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
        <p role="status" className={styles.help}>
          {notice}
        </p>
      )}
      {info && (
        <section className={styles.summary} aria-label="Resumen">
          <p>
            <strong>{total.words.toLocaleString("es-MX")} palabras</strong> · {clock(info.seconds)} de grabación · {info.device === "webgpu" ? "con tarjeta gráfica" : "con el procesador"}
          </p>
          {info.engineNote && <p>{info.engineNote}</p>}
          <p>
            {total.doubtful > 0 ? (
              <span className={`${styles.badge} ${styles.badgeWarn}`}>{total.doubtful} parte{total.doubtful === 1 ? "" : "s"} para revisar</span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeOk}`}>Sin partes dudosas</span>
            )}{" "}
            {info.notes.noisy && <span className={styles.badge}>Mucho ruido de fondo</span>} {info.notes.tooQuiet && <span className={styles.badge}>Voz muy baja</span>}{" "}
            {info.notes.mostlySilent && <span className={styles.badge}>Casi todo es silencio</span>}
          </p>
          <p className={styles.help}>
            Ningún programa escribe lo que oye sin errores: con voz clara se acierta casi todo; con ruido, acentos fuertes o varias personas hablando a la vez se equivoca más.
            Revisa lo marcado y escucha cada parte con el botón ▶ antes de usar el texto en algo importante.
          </p>
        </section>
      )}
      {segments.length > 0 && (
        <>
          <div className={styles.actions}>
            {total.doubtful > 0 && (
              <button type="button" className={styles.primary} onClick={nextDoubt}>
                Ir a la siguiente parte dudosa
              </button>
            )}
            <label className={styles.check}>
              <input type="checkbox" checked={onlyDoubt} onChange={(e) => setOnlyDoubt(e.target.checked)} /> Ver solo lo dudoso
            </label>
          </div>
          <details>
            <summary>Buscar y cambiar una palabra en todo el texto</summary>
            <div className={styles.actions}>
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
          <ol className={styles.segList} aria-label="Texto con sus tiempos">
            {shown.map(({ s, i }) => (
              <li key={i} id={"seg-" + i} className={hasDoubt(s) ? `${styles.segRow} ${styles.segDoubt}` : styles.segRow}>
                <button type="button" className={styles.segTime} disabled={!file || file.size === 0} onClick={() => play(s)} aria-label={"Escuchar desde " + clock(s.start)}>
                  ▶ {clock(s.start)}
                </button>
                <div>
                  <textarea
                    aria-label={"Texto de " + clock(s.start)}
                    value={s.text}
                    rows={Math.max(2, Math.ceil(s.text.length / 90))}
                    onChange={(e) => edit(i, { text: e.target.value, reviewed: s.reviewed })}
                  />
                  {shakyIn(s).length > 0 && (
                    <p className={styles.help}>
                      Palabras con duda:{" "}
                      {shakyIn(s).map((w) => (
                        <button key={w} type="button" className={styles.shaky} onClick={() => play(s)} title="Escuchar esta parte">
                          {w}
                        </button>
                      ))}
                    </p>
                  )}
                  {hasDoubt(s) && (
                    <p className={styles.help}>
                      <span className={`${styles.badge} ${styles.badgeWarn}`}>Revisar</span> {s.doubt.join(" ")}{" "}
                      <button type="button" onClick={() => edit(i, { reviewed: true })}>
                        Está bien
                      </button>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {!busy && (
            <section className={styles.convertCard} aria-label="Descargar">
              <strong>Descargar la transcripción</strong>
              <label className={styles.check}>
                <input type="checkbox" checked={times} onChange={(e) => setTimes(e.target.checked)} /> Poner la hora en cada párrafo
              </label>
              <label className={styles.check}>
                <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} /> Marcar con [¿?] lo que no he revisado ({total.doubtful})
              </label>
              <div className={styles.actions}>
                <button type="button" className={styles.primary} onClick={() => void make("docx")}>
                  Word (.docx)
                </button>
                <button type="button" onClick={() => void make("pdf")}>PDF</button>
                <button type="button" onClick={() => void make("txt")}>Texto (.txt)</button>
                <button type="button" onClick={() => void make("srt")}>Subtítulos (.srt)</button>
                <button type="button" onClick={() => void make("vtt")}>Subtítulos (.vtt)</button>
              </div>
            </section>
          )}
          {made && <Delivery blob={made.blob} name={made.name} detail={made.detail} scope={scope} />}
        </>
      )}
    </main>
  );
}

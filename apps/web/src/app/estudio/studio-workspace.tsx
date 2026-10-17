"use client";
import { useEffect, useRef, useState } from "react";
import {
  listLocalFiles,
  saveLocalFile,
  type FileScope,
} from "../../lib/yalika-local-files";
import {
  DOCUMENT_TYPE,
  MAX_CHARS,
  MAX_IMAGE_B64,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  documentName,
  exportPdf,
  exportWord,
  newDocument,
  paragraph,
  parseDocument,
  type Paragraph,
  type YalikaDocument,
} from "../../lib/yalika-document";
import { fitPicture, pictureFit } from "../../lib/yalika-image-io";
import { importDocument } from "../../lib/yalika-import";
import { PictureBlock, TableBlock } from "./doc-blocks";
import { TemplatePicker } from "./template-picker";
import styles from "./studio.module.css";
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: {
          length: number;
          [n: number]: {
            isFinal: boolean;
            [n: number]: { transcript: string };
          };
        };
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
export function StudioWorkspace({ scope }: { scope: FileScope }) {
  const [doc, setDoc] = useState<YalikaDocument>(newDocument);
  const [active, setActive] = useState(0),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [request, setRequest] = useState(""),
    [proposal, setProposal] = useState(""),
    [consent, setConsent] = useState(false),
    [listening, setListening] = useState(false),
    [ask, setAsk] = useState(false),
    [picking, setPicking] = useState(false),
    [tableForm, setTableForm] = useState<{ rows: number; cols: number } | null>(null);
  const [saved, setSaved] = useState<
    { id: string; name: string; blob: Blob }[]
  >([]);
  const recognition = useRef<Recognition | null>(null),
    abort = useRef<AbortController | null>(null),
    version = useRef(0),
    current = useRef(doc);
  const history = useRef<YalikaDocument[]>([]),
    future = useRef<YalikaDocument[]>([]),
    operation = useRef<{ value: string; id: string } | null>(null);
  const [undoCount, setUndoCount] = useState(0),
    [redoCount, setRedoCount] = useState(0);
  useEffect(() => {
    let live = true;
    listLocalFiles(scope)
      .then((rows) => {
        if (live) setSaved(rows.filter((f) => f.type === DOCUMENT_TYPE));
      })
      .catch((e) => {
        if (live) setNotice(e.message);
      });
    return () => {
      live = false;
      recognition.current?.abort();
      abort.current?.abort();
    };
  }, [scope]);
  useEffect(() => {
    const links = (e: MouseEvent) => {
      const a = (e.target as Element)?.closest?.("a[href]");
      if (
        dirty &&
        a &&
        !window.confirm("Hay cambios sin guardar. ¿Salir del editor?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", links, true);
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", links, true);
    };
  }, [dirty]);
  function change(next: YalikaDocument) {
    parseDocument(next);
    history.current.push(current.current);
    if (history.current.length > 100) history.current.shift();
    future.current = [];
    setUndoCount(history.current.length);
    setRedoCount(0);
    current.current = next;
    setDoc(next);
    version.current++;
    setDirty(true);
  }
  function patch(p: Partial<Paragraph>) {
    change({
      ...doc,
      paragraphs: doc.paragraphs.map((x, i) =>
        i === active ? { ...x, ...p } : x,
      ),
    });
  }
  function insertBlock(block: Paragraph) {
    const at = active + 1,
      list = [...doc.paragraphs];
    list.splice(at, 0, block);
    if (at === list.length - 1) list.push(paragraph());
    change({ ...doc, paragraphs: list });
    setActive(at);
  }
  function addTable(rows: number, cols: number) {
    const r = Math.min(MAX_TABLE_ROWS, Math.max(1, Math.round(rows) || 1)),
      c = Math.min(MAX_TABLE_COLS, Math.max(1, Math.round(cols) || 1));
    insertBlock({ ...paragraph(), table: Array.from({ length: r }, () => Array(c).fill("")) });
    setTableForm(null);
  }
  // La foto se reduce hasta que quepa en el documento: se prueba con calidades y tamaños cada vez menores.
  async function addImage(file: File) {
    const pic = await fitPicture(file, MAX_IMAGE_B64);
    if (!pic) throw Error("La imagen es demasiado pesada para el documento. Prueba con una más pequeña.");
    insertBlock({ ...paragraph(), align: "center", image: { ...pic, size: "m" } });
  }
  function toggleList(kind: "bullet" | "number") {
    change({
      ...doc,
      paragraphs: doc.paragraphs.map((x, i) => {
        if (i !== active) return x;
        const { list, ...rest } = x;
        return list === kind ? rest : { ...rest, list: kind };
      }),
    });
  }
  function undo(redo = false) {
    const from = redo ? future : history,
      to = redo ? history : future;
    const next = from.current.pop();
    if (!next) return;
    to.current.push(doc);
    setUndoCount(history.current.length);
    setRedoCount(future.current.length);
    current.current = next;
    setDoc(next);
    setActive(0);
    version.current++;
    setDirty(true);
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "No se completó la operación.",
      );
    } finally {
      setBusy(false);
    }
  }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function save() {
    const snapshot = JSON.stringify(doc),
      revision = version.current;
    if (operation.current?.value !== snapshot)
      operation.current = { value: snapshot, id: crypto.randomUUID() };
    await saveLocalFile(
      scope,
      new Blob([snapshot], { type: DOCUMENT_TYPE }),
      documentName(doc.title) + ".yalika.json",
      operation.current.id,
    );
    setSaved(
      (await listLocalFiles(scope)).filter((f) => f.type === DOCUMENT_TYPE),
    );
    if (revision === version.current) setDirty(false);
    setNotice(
      "Versión guardada en este navegador. No es un respaldo en la nube.",
    );
  }
  function replace(next: YalikaDocument) {
    if (
      dirty &&
      !window.confirm(
        "Hay cambios sin guardar. ¿Reemplazar el documento abierto?",
      )
    )
      return;
    change(next);
    setActive(0);
    setProposal("");
  }
  async function open(file: File) {
    const { doc: next, warning } = await importDocument(file, undefined, pictureFit(MAX_IMAGE_B64));
    replace(next);
    if (warning) setNotice(warning);
  }
  function voice(target: "document" | "request") {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const w = window as typeof window & {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C) {
      setNotice(
        "Este navegador no ofrece dictado. Puedes escribir o pegar tu texto.",
      );
      return;
    }
    const r = new C();
    recognition.current = r;
    r.lang = "es-MX";
    r.continuous = true;
    r.interimResults = false;
    const index = active;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) text += e.results[i][0].transcript + " ";
      if (!text) return;
      if (target === "request")
        setRequest((v) => (v + " " + text).slice(0, 3000));
      else {
        const d = current.current;
        const paragraphs = d.paragraphs.map((p, i) =>
          i === index ? { ...p, text: (p.text + " " + text).trim() } : p,
        );
        try {
          change({ ...d, paragraphs });
        } catch {
          r.stop();
          setNotice("Se alcanzó el límite del documento.");
        }
      }
    };
    r.onerror = () => {
      setNotice(
        "No se pudo completar el dictado. Revisa el permiso del micrófono.",
      );
      r.abort();
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    try {
      r.start();
      setListening(true);
      setNotice(
        "Dictando. El reconocimiento puede usar servicios del navegador. Pulsa Detener al terminar.",
      );
    } catch {
      recognition.current = null;
      setListening(false);
      setNotice("No se pudo iniciar el micrófono.");
    }
  }
  async function generate() {
    const controller = new AbortController();
    abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch("/api/orion/business-assistant/writing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: request,
          action: "document",
          consent: true,
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || typeof result.text !== "string")
        throw Error(
          typeof result.message === "string"
            ? result.message
            : "No se pudo generar el borrador.",
        );
      setProposal(result.text);
      setNotice(
        "Borrador listo para revisar. Todavía no reemplaza tu documento.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  const p = doc.paragraphs[active] ?? doc.paragraphs[0];
  return (
    <main className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <h1>Crear documento</h1>
          <p>Escribe, dicta o prepara un borrador con el asistente.</p>
        </div>
        <span>Gratis por ahora</span>
      </div>
      <div className={styles.actions}>
        <button
          disabled={busy || listening}
          onClick={() => replace(newDocument())}
        >
          Nuevo
        </button>
        <button disabled={busy || listening} onClick={() => setPicking(!picking)}>
          Usar plantilla
        </button>
        <button disabled={busy || listening} onClick={() => setAsk(!ask)}>
          Pedir un documento
        </button>
        <button disabled={busy} onClick={() => voice("document")}>
          {listening ? "Detener dictado" : "Dictar texto"}
        </button>
        <label className={styles.import}>
          Abrir archivo
          <input
            hidden
            disabled={busy || listening}
            type="file"
            accept=".json,.txt,.md,.docx,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(() => open(f));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {picking && (
        <TemplatePicker
          onClose={() => setPicking(false)}
          onCreate={(d) => {
            replace(d);
            setPicking(false);
          }}
        />
      )}
      {ask && (
        <section className={styles.assistant}>
          <label>
            ¿Qué documento necesitas?
            <textarea
              disabled={busy || listening}
              maxLength={3000}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Un oficio para solicitar mantenimiento. Usa marcadores para los datos que faltan."
            />
          </label>
          <div className={styles.actions}>
            <button disabled={busy} onClick={() => voice("request")}>
              {listening ? "Detener" : "Dictar solicitud"}
            </button>
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              Autorizo enviar esta solicitud al servicio de IA configurado.
            </label>
            <button
              disabled={
                busy || listening || !consent || request.trim().length < 3
              }
              onClick={() => void run(generate)}
            >
              Preparar borrador
            </button>
          </div>
          <p>
            No incluyas identificaciones, teléfonos ni correos. Si no hay IA
            configurada, puedes seguir escribiendo.
          </p>
          {proposal && (
            <>
              <pre>{proposal}</pre>
              <button
                disabled={busy || listening}
                onClick={() =>
                  replace({
                    ...newDocument(),
                    title: "Borrador para revisar",
                    paragraphs: proposal
                      .split(/\n\s*\n/)
                      .map((t) => paragraph(t)),
                  })
                }
              >
                Usar este borrador
              </button>
            </>
          )}
        </section>
      )}
      <label className={styles.title}>
        Nombre del documento
        <input
          maxLength={160}
          disabled={busy}
          value={doc.title}
          onChange={(e) => change({ ...doc, title: e.target.value })}
        />
      </label>
      <div
        className={styles.toolbar}
        aria-label="Formato del párrafo seleccionado"
      >
        <label>
          Letra
          <select
            value={p.font}
            onChange={(e) =>
              patch({ font: e.target.value as Paragraph["font"] })
            }
          >
            <option>Arial</option>
            <option>Times New Roman</option>
            <option>Courier New</option>
          </select>
        </label>
        <label>
          Tamaño
          <select
            value={p.size}
            onChange={(e) => patch({ size: Number(e.target.value) })}
          >
            {[8, 10, 11, 12, 14, 16, 18, 24, 28, 36].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button aria-pressed={p.bold} onClick={() => patch({ bold: !p.bold })}>
          Negrita
        </button>
        <button
          aria-pressed={p.italic}
          onClick={() => patch({ italic: !p.italic })}
        >
          Cursiva
        </button>
        <button
          aria-pressed={p.underline}
          onClick={() => patch({ underline: !p.underline })}
        >
          Subrayar
        </button>
        <label>
          Alineación
          <select
            value={p.align}
            onChange={(e) =>
              patch({ align: e.target.value as Paragraph["align"] })
            }
          >
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
        </label>
        <button
          aria-pressed={p.list === "bullet"}
          disabled={!!(p.table || p.image)}
          onClick={() => toggleList("bullet")}
        >
          Viñetas
        </button>
        <button
          aria-pressed={p.list === "number"}
          disabled={!!(p.table || p.image)}
          onClick={() => toggleList("number")}
        >
          Numeración
        </button>
        <button disabled={busy || listening} onClick={() => setTableForm(tableForm ? null : { rows: 3, cols: 3 })}>
          Insertar tabla
        </button>
        <label className={styles.import}>
          Insertar imagen
          <input
            hidden
            type="file"
            accept="image/*"
            disabled={busy || listening}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void run(() => addImage(f));
            }}
          />
        </label>
        <label className={styles.import}>
          <input
            type="checkbox"
            checked={!!doc.pageNumbers}
            onChange={(e) => {
              const { pageNumbers, ...rest } = doc;
              void pageNumbers;
              change(e.target.checked ? { ...rest, pageNumbers: true } : rest);
            }}
          />{" "}
          Número de página
        </label>
        <button disabled={!undoCount} onClick={() => undo()}>
          Deshacer
        </button>
        <button disabled={!redoCount} onClick={() => undo(true)}>
          Rehacer
        </button>
      </div>
      {tableForm && (
        <form
          className={styles.insertForm}
          onSubmit={(e) => {
            e.preventDefault();
            try {
              addTable(tableForm.rows, tableForm.cols);
            } catch (x) {
              setNotice(x instanceof Error ? x.message : "No se pudo insertar la tabla.");
            }
          }}
        >
          <label>
            Filas
            <br />
            <input
              type="number"
              min={1}
              max={MAX_TABLE_ROWS}
              value={tableForm.rows}
              onChange={(e) => setTableForm({ ...tableForm, rows: Number(e.target.value) })}
            />
          </label>
          <label>
            Columnas
            <br />
            <input
              type="number"
              min={1}
              max={MAX_TABLE_COLS}
              value={tableForm.cols}
              onChange={(e) => setTableForm({ ...tableForm, cols: Number(e.target.value) })}
            />
          </label>
          <button type="submit">Insertar</button>
          <button type="button" onClick={() => setTableForm(null)}>
            Cancelar
          </button>
        </form>
      )}
      <p className={styles.help}>
        Formato por párrafo. Selecciona un párrafo para cambiar su estilo.
      </p>
      <section className={styles.paper} aria-label="Documento editable">
        {doc.paragraphs.map((block, i) => {
          if (block.table)
            return (
              <TableBlock
                key={i}
                block={block}
                rows={block.table}
                label={"Tabla " + (i + 1)}
                active={i === active}
                onFocus={() => setActive(i)}
                onChange={(rows) =>
                  change({ ...doc, paragraphs: doc.paragraphs.map((x, j) => (i === j ? { ...x, table: rows } : x)) })
                }
              />
            );
          if (block.image)
            return (
              <PictureBlock
                key={i}
                image={block.image}
                align={block.align}
                label={"Imagen " + (i + 1)}
                active={i === active}
                onFocus={() => setActive(i)}
                onSize={(size) =>
                  change({
                    ...doc,
                    paragraphs: doc.paragraphs.map((x, j) => (i === j && x.image ? { ...x, image: { ...x.image, size } } : x)),
                  })
                }
              />
            );
          let number = 0;
          if (block.list === "number")
            for (let k = i; k >= 0 && doc.paragraphs[k].list === "number"; k--) number++;
          return (
            <div key={i} className={styles.textBlock}>
              {block.list && (
                <span className={styles.marker} aria-hidden="true" style={{ fontFamily: block.font, fontSize: block.size + "pt" }}>
                  {block.list === "bullet" ? "•" : number + "."}
                </span>
              )}
              <textarea
                aria-label={"Párrafo " + (i + 1)}
                data-active={i === active}
                value={block.text}
                maxLength={Math.max(
                  block.text.length,
                  MAX_CHARS -
                    doc.paragraphs.reduce((n, x) => n + x.text.length, 0) +
                    block.text.length,
                )}
                rows={Math.min(
                  24,
                  Math.max(
                    block.list ? 1 : 2,
                    block.text.split("\n").length +
                      Math.ceil(block.text.length / 75),
                  ),
                )}
                onFocus={() => setActive(i)}
                onChange={(e) =>
                  change({
                    ...doc,
                    paragraphs: doc.paragraphs.map((x, j) =>
                      i === j ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
                style={{
                  fontFamily: block.font,
                  fontSize: block.size + "pt",
                  fontWeight: block.bold ? "bold" : "normal",
                  fontStyle: block.italic ? "italic" : "normal",
                  textDecoration: block.underline ? "underline" : "none",
                  textAlign: block.align,
                }}
                placeholder="Escribe o dicta aquí…"
              />
            </div>
          );
        })}
      </section>
      <div className={styles.actions}>
        <button
          disabled={doc.paragraphs.length >= 1000 || listening}
          onClick={() => {
            change({ ...doc, paragraphs: [...doc.paragraphs, paragraph()] });
            setActive(doc.paragraphs.length);
          }}
        >
          Añadir párrafo
        </button>
        <button
          disabled={doc.paragraphs.length === 1 || listening}
          onClick={() => {
            if (window.confirm("¿Quitar este párrafo? Puedes deshacerlo.")) {
              change({
                ...doc,
                paragraphs: doc.paragraphs.filter((_, i) => i !== active),
              });
              setActive(0);
            }
          }}
        >
          Quitar párrafo
        </button>
      </div>
      <div className={styles.footer}>
        <strong>
          {dirty ? "Cambios sin guardar" : "Documento sin cambios pendientes"}
        </strong>
        <div className={styles.actions}>
          <button disabled={busy || listening} onClick={() => void run(save)}>
            Guardar editable
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () =>
                download(
                  await exportWord(doc),
                  documentName(doc.title) + ".docx",
                ),
              )
            }
          >
            Descargar Word
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () =>
                download(
                  await exportPdf(doc),
                  documentName(doc.title) + ".pdf",
                ),
              )
            }
          >
            Descargar PDF
          </button>
          <button
            disabled={busy}
            onClick={() =>
              download(
                new Blob([JSON.stringify(doc)], { type: DOCUMENT_TYPE }),
                documentName(doc.title) + ".yalika.json",
              )
            }
          >
            Descargar editable
          </button>
        </div>
      </div>
      <p role="status">
        {busy ? "Procesando… " : ""}
        {notice}
      </p>
      <p className={styles.help}>
        Guardado solo en este navegador y cuenta. Descarga una copia para
        conservarla fuera del equipo. Word y PDF pueden variar ligeramente en
        fuentes y saltos de página.
      </p>
      {saved.length > 0 && (
        <details>
          <summary>Abrir versiones guardadas ({saved.length})</summary>
          {saved.map((f) => (
            <button
              className={styles.saved}
              disabled={busy || listening}
              key={f.id}
              onClick={() => void run(() => open(new File([f.blob], f.name)))}
            >
              {f.name}
            </button>
          ))}
        </details>
      )}
    </main>
  );
}

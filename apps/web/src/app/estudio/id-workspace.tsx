"use client";
import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "../../lib/yalika-download";
import {
  CARD_RATIO,
  MAX_NOTE,
  cleanNote,
  cardPixels,
  inePdf,
  pickCardQuad,
  sheetPlan,
  toGray,
  type CardSize,
  type Layout,
  type Paper,
  type Side,
} from "../../lib/yalika-ine";
import { decode, renderCard } from "../../lib/yalika-image-io";
import type { FileScope } from "../../lib/yalika-local-files";
import { canShareFile, shareFile } from "../../lib/yalika-share";
import { MAX_SIDE, checkImageFile, clarify, imageQuality, rotate, warp, type Pixels, type Quad } from "../../lib/yalika-scan";
import { CornerEditor } from "./corner-editor";
import { Delivery } from "./delivery";
import { EstudioIcon } from "./estudio-icon";
import styles from "./studio.module.css";
type Source = { name: string; base: Pixels; url: string; quad: Quad; found: boolean; turns: number };
type Card = { bytes: Uint8Array; url: string; blur: number; width: number } | { error: string };
const message = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal.");
const LABEL: Record<Side, string> = { front: "Frente", back: "Reverso" };
const WHAT: Record<Side, string> = { front: "la parte de adelante, donde está tu foto", back: "la parte de atrás, donde está el código" };
// La credencial ya enderezada, aclarada y a su tamaño de impresión. Se rehace cuando cambia algo.
function useCard(src: Source | null, gray: boolean, size: CardSize, note: string) {
  const [made, setMade] = useState<{ src: Source; gray: boolean; size: CardSize; note: string; card: Card } | null>(null);
  useEffect(() => {
    if (!src) return;
    let live = true,
      blobUrl = "";
    (async () => {
      await new Promise((r) => setTimeout(r, 20)); // deja pintar la pantalla antes del trabajo pesado
      try {
        let p = warp(src.base, src.quad);
        if (p.height > p.width) p = rotate(p, 1);
        p = rotate(p, src.turns);
        const blur = imageQuality(p).blur,
          width = p.width;
        p = clarify(p);
        if (gray) p = toGray(p);
        const px = cardPixels(size),
          bytes = await renderCard(p, px.w, px.h, note);
        if (!live) return;
        blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
        setMade({ src, gray, size, note, card: { bytes, url: blobUrl, blur, width } });
      } catch (e) {
        if (live) setMade({ src, gray, size, note, card: { error: message(e) } });
      }
    })();
    return () => {
      live = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src, gray, size, note]);
  // Solo vale lo que se hizo con las fotos y opciones de ahora; si cambió algo, se muestra «Preparando…».
  return src && made && made.src === src && made.gray === gray && made.size === size && made.note === note ? made.card : null;
}
function hints(src: Source, card: Card | null) {
  const out: string[] = [];
  if (!src.found) out.push("No encontré los bordes de la credencial solo. Toca «Ajustar bordes» y lleva los cuatro puntos a las esquinas.");
  if (card && "bytes" in card) {
    if (card.width < 700) out.push("La foto es pequeña: al imprimir se verá borrosa. Acércate un poco más y vuelve a tomarla.");
    else if (card.blur >= 2.5) out.push("La foto salió borrosa. Tómala otra vez con buena luz y sin mover el celular.");
  }
  return out;
}
function SideCard({
  side,
  src,
  card,
  busy,
  onPick,
  onChange,
}: {
  side: Side;
  src: Source | null;
  card: Card | null;
  busy: boolean;
  onPick: (file: File) => void;
  onChange: (next: Source | null) => void;
}) {
  const [adjust, setAdjust] = useState(false),
    pick = (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) onPick(f);
    };
  if (!src)
    return (
      <section className={styles.idSide} aria-label={LABEL[side]}>
        <h2>{LABEL[side]}</h2>
        <div className={styles.idEmpty}>
          <span className={styles.uiDropIcon}>
            <EstudioIcon name="card" size={28} />
          </span>
          <p>Foto de {WHAT[side]}.</p>
          <div className={styles.idButtons}>
            <label className={styles.uiCta} aria-disabled={busy}>
              Tomar foto
              <input hidden type="file" accept="image/*" capture="environment" disabled={busy} onChange={pick} />
            </label>
            <label className={styles.uiGhost} aria-disabled={busy}>
              Elegir de mis archivos
              <input hidden type="file" accept="image/*" disabled={busy} onChange={pick} />
            </label>
          </div>
        </div>
      </section>
    );
  const tips = hints(src, card);
  return (
    <section className={styles.idSide} aria-label={LABEL[side]}>
      <h2>{LABEL[side]}</h2>
      <div className={styles.idPreview} style={{ aspectRatio: String(CARD_RATIO) }}>
        {card && "url" in card ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local de la credencial
          <img src={card.url} alt={"Vista previa del " + LABEL[side].toLowerCase() + " de la credencial"} />
        ) : card && "error" in card ? (
          <p role="alert">{card.error}</p>
        ) : (
          <p>Preparando…</p>
        )}
      </div>
      {tips.map((t) => (
        <p key={t} className={styles.uiNotice} role="status">
          {t}
        </p>
      ))}
      <div className={styles.idButtons}>
        <button type="button" className={styles.uiGhost} aria-pressed={adjust} disabled={busy} onClick={() => setAdjust(!adjust)}>
          Ajustar bordes
        </button>
        <button type="button" className={styles.uiGhost} disabled={busy} onClick={() => onChange({ ...src, turns: (src.turns + 1) % 4 })}>
          Girar
        </button>
        <label className={styles.uiGhost} aria-disabled={busy}>
          Cambiar foto
          <input hidden type="file" accept="image/*" disabled={busy} onChange={pick} />
        </label>
        <button type="button" className={styles.uiGhost} disabled={busy} onClick={() => onChange(null)}>
          Quitar
        </button>
      </div>
      {adjust && <CornerEditor key={src.url} url={src.url} quad={src.quad} onCommit={(quad) => onChange({ ...src, quad, found: true })} />}
    </section>
  );
}
function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: [T, string, string?][];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className={styles.uiTiers}>
      <legend>{legend}</legend>
      <div className={styles.idChoices}>
        {options.map(([id, label, hint]) => (
          <label key={id} className={styles.uiTier}>
            <input type="radio" name={legend} checked={value === id} onChange={() => onChange(id)} />
            <span>
              <span className={styles.uiTierTop}>{label}</span>
              {hint && <span className={styles.uiTierHint}>{hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
// Cómo va a quedar en la hoja, a escala.
function SheetPreview({ plan, urls }: { plan: ReturnType<typeof sheetPlan>; urls: Partial<Record<Side, string>> }) {
  return (
    <div className={styles.idSheets}>
      {Array.from({ length: plan.pages }, (_, page) => (
        <figure key={page} className={styles.idPage} style={{ aspectRatio: plan.paper.w + " / " + plan.paper.h }}>
          {plan.items
            .filter((i) => i.page === page)
            .map((i) => {
              const pos = {
                left: (i.x / plan.paper.w) * 100 + "%",
                top: (i.y / plan.paper.h) * 100 + "%",
                width: (i.w / plan.paper.w) * 100 + "%",
                height: (i.h / plan.paper.h) * 100 + "%",
              };
              return urls[i.side] ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista previa local de la hoja
                <img key={i.side} src={urls[i.side]} alt={LABEL[i.side]} style={pos} />
              ) : (
                <span key={i.side} className={styles.idHole} style={pos}>
                  {LABEL[i.side]}
                </span>
              );
            })}
          <figcaption>{plan.pages > 1 ? "Hoja " + (page + 1) : "Hoja"}</figcaption>
        </figure>
      ))}
    </div>
  );
}
export function IdentificationWorkspace({ scope }: { scope: FileScope }) {
  const [front, setFront] = useState<Source | null>(null),
    [back, setBack] = useState<Source | null>(null),
    [paper, setPaper] = useState<Paper>("letter"),
    [layout, setLayout] = useState<Layout>("same"),
    [size, setSize] = useState<CardSize>("real"),
    [gray, setGray] = useState(false),
    [rawNote, setRawNote] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [made, setMade] = useState<{ blob: Blob; name: string; stamp: string } | null>(null),
    urls = useRef<string[]>([]),
    note = cleanNote(rawNote),
    fCard = useCard(front, gray, size, note),
    bCard = useCard(back, gray, size, note);
  useEffect(() => {
    const list = urls.current;
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  // Cualquier cambio en las fotos o en las opciones deja la hoja anterior sin vigencia.
  const stamp = [front?.url, front?.turns, front?.quad.map((p) => p.x + "," + p.y).join(), back?.url, back?.turns, back?.quad.map((p) => p.x + "," + p.y).join(), paper, layout, size, gray, note].join("|");
  const out = made && made.stamp === stamp ? made : null;
  async function load(side: Side, file: File) {
    const bad = checkImageFile(file);
    if (bad) return setNotice(bad);
    setBusy(true);
    setNotice("");
    try {
      const base = await decode(file, MAX_SIDE),
        { quad, found } = pickCardQuad(base),
        url = URL.createObjectURL(file);
      urls.current.push(url);
      const next: Source = { name: file.name, base, url, quad, found, turns: 0 };
      (side === "front" ? setFront : setBack)(next);
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  const ready = (c: Card | null) => (c && "bytes" in c ? c : null),
    f = ready(fCard),
    b = ready(bCard),
    plan = sheetPlan({ paper, layout, size });
  async function make() {
    if (busy || (!f && !b)) return;
    setBusy(true);
    setNotice("");
    try {
      const blob = await inePdf({ ...(f ? { front: f.bytes } : {}), ...(b ? { back: b.bytes } : {}) }, { paper, layout, size });
      setMade({ blob, name: "Copia-de-INE.pdf", stamp });
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function side(which: Side, share: boolean) {
    const c = which === "front" ? f : b;
    if (!c) return;
    const blob = new Blob([c.bytes as BlobPart], { type: "image/jpeg" }),
      name = (which === "front" ? "INE-frente" : "INE-reverso") + ".jpg";
    try {
      if (share && canShareFile(blob, name)) await shareFile(blob, name);
      else downloadBlob(blob, name);
    } catch (e) {
      setNotice(message(e));
    }
  }
  return (
    <main className={`${styles.workspace} ${styles.tx}`}>
      <header className={styles.uiHead}>
        <div>
          <span className={styles.uiEyebrow}>Credencial · INE</span>
          <h1>Copia de mi INE</h1>
          <p>Toma una foto del frente y otra del reverso. Te las dejamos en una hoja, a su tamaño real, lista para imprimir o compartir.</p>
        </div>
        <span className={styles.uiPrivacy}>
          <EstudioIcon name="lock" size={14} /> Las fotos no salen de tu dispositivo
        </span>
      </header>
      <div className={styles.idSides}>
        <SideCard side="front" src={front} card={fCard} busy={busy} onPick={(file) => void load("front", file)} onChange={setFront} />
        <SideCard side="back" src={back} card={bCard} busy={busy} onPick={(file) => void load("back", file)} onChange={setBack} />
      </div>
      <details className={styles.idTips}>
        <summary>Cómo tomar una buena foto</summary>
        <ul>
          <li>Pon la credencial sobre una mesa lisa y de un color distinto al de la credencial (de preferencia oscuro).</li>
          <li>Busca buena luz, sin que se refleje el foco ni la ventana en la credencial.</li>
          <li>Toma la foto de frente, sin inclinar el celular, con toda la credencial dentro de la imagen.</li>
          <li>Si los bordes no se marcaron bien, usa «Ajustar bordes» y lleva cada punto a una esquina.</li>
        </ul>
      </details>
      {(front || back) && (
        <section className={styles.uiCard} aria-label="Hoja para imprimir">
          <h2 className={styles.uiCardTitle}>Así quedará la hoja</h2>
          <div className={styles.idSheetRow}>
            <SheetPreview plan={plan} urls={{ ...(f ? { front: f.url } : {}), ...(b ? { back: b.url } : {}) }} />
            <div className={styles.idOptions}>
              <Choice<Layout>
                legend="¿Cómo la quieres?"
                value={layout}
                onChange={setLayout}
                options={[
                  ["same", "Los dos lados en una hoja", "Frente arriba y reverso abajo."],
                  ["separate", "Cada lado en su hoja", "Con salto de página: una hoja para el frente y otra para el reverso."],
                ]}
              />
              <Choice<CardSize>
                legend="Tamaño"
                value={size}
                onChange={setSize}
                options={[
                  ["real", "Tamaño real", "Igual que la credencial (8.6 × 5.4 cm)."],
                  ["large", "Ampliada", "50 % más grande, para que se lea mejor."],
                ]}
              />
              <Choice<Paper>
                legend="Papel"
                value={paper}
                onChange={setPaper}
                options={[
                  ["letter", "Carta"],
                  ["a4", "A4"],
                ]}
              />
              <Choice<"color" | "gray">
                legend="Color"
                value={gray ? "gray" : "color"}
                onChange={(v) => setGray(v === "gray")}
                options={[
                  ["color", "A color"],
                  ["gray", "Blanco y negro", "Gasta menos tinta; sirve para fotocopia."],
                ]}
              />
            </div>
          </div>
          <label className={styles.idNoteField}>
            <span>Leyenda sobre la copia (opcional)</span>
            <input
              type="text"
              value={rawNote}
              maxLength={MAX_NOTE}
              placeholder="Ej.: Solo para trámite de crédito"
              onChange={(e) => setRawNote(e.target.value)}
            />
            <small>{note ? "Se imprime en diagonal y discreta sobre cada cara, para que la copia no sirva para otra cosa." : "Si la escribes, la copia queda marcada para ese fin."}</small>
          </label>
          {!(f && b) && <p className={styles.uiNote}>Falta {f ? "el reverso" : b ? "el frente" : "alguna foto"}: la hoja saldrá solo con {f ? "el frente" : "el reverso"}.</p>}
          <div className={styles.idButtons}>
            <button type="button" className={styles.uiCta} disabled={busy || (!f && !b)} onClick={() => void make()}>
              {busy ? "Preparando…" : out ? "Volver a crear la hoja" : "Crear hoja para imprimir"}
            </button>
          </div>
        </section>
      )}
      {notice && (
        <p role="status" className={styles.uiNotice}>
          {notice}
        </p>
      )}
      {out && (
        <>
          <Delivery blob={out.blob} name={out.name} detail={plan.pages > 1 ? "2 hojas" : "1 hoja"} scope={scope} />
          <div className={styles.idButtons}>
            <button type="button" className={styles.uiGhost} onClick={() => window.open(URL.createObjectURL(out.blob), "_blank")}>
              Abrir para imprimir
            </button>
            {f && (
              <button type="button" className={styles.uiGhost} onClick={() => void side("front", true)}>
                Frente como foto (JPG)
              </button>
            )}
            {b && (
              <button type="button" className={styles.uiGhost} onClick={() => void side("back", true)}>
                Reverso como foto (JPG)
              </button>
            )}
          </div>
          <p className={styles.uiNote}>Tu INE es un dato sensible: comparte la copia solo con quien la necesita y borra los archivos que ya no ocupes desde «Mis archivos».</p>
        </>
      )}
    </main>
  );
}

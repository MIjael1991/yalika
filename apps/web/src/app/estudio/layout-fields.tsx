"use client";
import { FRAME_PT, MARGIN_PT, type PageLayout } from "../../lib/yalika-scan";
import styles from "./studio.module.css";
const MARGINS: [PageLayout["margin"], string][] = [
  ["none", "Sin margen"],
  ["small", "Pequeño"],
  ["normal", "Normal"],
  ["wide", "Amplio"],
];
const FRAMES: [PageLayout["frame"], string][] = [
  ["none", "Sin marco"],
  ["thin", "Delgado"],
  ["thick", "Grueso"],
];
const BACKGROUNDS: [string, string][] = [
  ["#ffffff", "Blanco"],
  ["#f6f0e0", "Crema"],
  ["#d9dde3", "Gris"],
  ["#111111", "Negro"],
];
// Cómo se ve la hoja del PDF alrededor de la imagen. Sirve para fotos sueltas y para unir páginas.
export function LayoutFields({ layout, onChange }: { layout: PageLayout; onChange: (l: PageLayout) => void }) {
  const set = (change: Partial<PageLayout>) => onChange({ ...layout, ...change });
  return (
    <div className={styles.layoutFields}>
      <div>
        <h3>Márgenes</h3>
        <div className={styles.seg}>
          {MARGINS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={layout.margin === id} onClick={() => set({ margin: id })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3>Fondo de la hoja</h3>
        <div className={styles.swatches}>
          {BACKGROUNDS.map(([color, label]) => (
            <button
              key={color}
              type="button"
              className={styles.swatch}
              style={{ background: color }}
              aria-label={label}
              title={label}
              aria-pressed={layout.background.toLowerCase() === color}
              onClick={() => set({ background: color })}
            />
          ))}
          <label className={styles.colorPick}>
            Otro
            <input type="color" value={layout.background} onChange={(e) => set({ background: e.target.value })} />
          </label>
        </div>
      </div>
      <div>
        <h3>Marco</h3>
        <div className={styles.seg}>
          {FRAMES.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={layout.frame === id} onClick={() => set({ frame: id })}>
              {label}
            </button>
          ))}
        </div>
        {layout.frame !== "none" && (
          <label className={styles.colorPick}>
            Color del marco
            <input type="color" value={layout.frameColor} onChange={(e) => set({ frameColor: e.target.value })} />
          </label>
        )}
      </div>
    </div>
  );
}
// Vista previa aproximada de la hoja: mismos márgenes, fondo y marco que tendrá el PDF.
export const previewStyle = (l: PageLayout) => ({
  background: l.background,
  padding: MARGIN_PT[l.margin] * 0.8,
  display: "inline-block" as const,
  lineHeight: 0,
});
export const frameStyle = (l: PageLayout) =>
  l.frame === "none" ? {} : { outline: FRAME_PT[l.frame] + "px solid " + l.frameColor, outlineOffset: -FRAME_PT[l.frame] + "px" };

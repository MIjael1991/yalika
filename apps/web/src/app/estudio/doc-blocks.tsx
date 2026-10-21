"use client";
import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { MAX_TABLE_CELL, MAX_TABLE_COLS, MAX_TABLE_ROWS, type Paragraph, type Picture } from "../../lib/yalika-document";
import styles from "./studio.module.css";
// Cuadro de texto que crece con lo que se escribe: el documento se ve corrido, como una hoja, sin huecos.
export function AutoText(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null),
    fit = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + 2 + "px";
    };
  useLayoutEffect(fit, [props.value, props.style?.fontSize, props.style?.fontFamily, props.style?.fontWeight]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return <textarea ref={ref} rows={1} {...props} />;
}
// Bloques del documento que no son texto: tablas e imágenes.
export function TableBlock({
  block,
  rows,
  label,
  active,
  onFocus,
  onChange,
}: {
  block: Paragraph;
  rows: string[][];
  label: string;
  active: boolean;
  onFocus: () => void;
  onChange: (rows: string[][]) => void;
}) {
  const cols = rows[0].length;
  return (
    <div className={styles.tableBlock} data-active={active} role="group" aria-label={label} onFocusCapture={onFocus}>
      <table>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>
                  <input
                    aria-label={label + ", fila " + (r + 1) + ", columna " + (c + 1)}
                    data-head={r === 0 || undefined}
                    maxLength={MAX_TABLE_CELL}
                    value={cell}
                    style={{ fontFamily: block.font, fontSize: block.size + "pt" }}
                    onChange={(e) => onChange(rows.map((x, i) => (i === r ? x.map((y, j) => (j === c ? e.target.value : y)) : x)))}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.actions} style={{ margin: "8px 0 0" }}>
        <button type="button" disabled={rows.length >= MAX_TABLE_ROWS} onClick={() => onChange([...rows, Array(cols).fill("")])}>
          + Fila
        </button>
        <button type="button" disabled={cols >= MAX_TABLE_COLS} onClick={() => onChange(rows.map((r) => [...r, ""]))}>
          + Columna
        </button>
        <button type="button" disabled={rows.length <= 1} onClick={() => onChange(rows.slice(0, -1))}>
          − Fila
        </button>
        <button type="button" disabled={cols <= 1} onClick={() => onChange(rows.map((r) => r.slice(0, -1)))}>
          − Columna
        </button>
      </div>
      <p className={styles.help} style={{ margin: "6px 0 0" }}>
        La primera fila es el encabezado.
      </p>
    </div>
  );
}
const SIZE_LABEL = { s: "Pequeña", m: "Mediana", l: "Grande" } as const;
export function PictureBlock({
  image,
  align,
  label,
  active,
  onFocus,
  onSize,
}: {
  image: Picture;
  align: Paragraph["align"];
  label: string;
  active: boolean;
  onFocus: () => void;
  onSize: (size: Picture["size"]) => void;
}) {
  const pct = { s: 33, m: 60, l: 100 }[image.size];
  return (
    <figure className={styles.pictureBlock} data-active={active} tabIndex={0} aria-label={label} onFocus={onFocus} onClick={onFocus} style={{ textAlign: align }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen del propio documento, guardada en el dispositivo */}
      <img src={"data:image/jpeg;base64," + image.data} alt="Imagen del documento" style={{ width: pct + "%", maxWidth: image.w }} />
      <figcaption>
        <label>
          Tamaño{" "}
          <select value={image.size} onFocus={onFocus} onChange={(e) => onSize(e.target.value as Picture["size"])}>
            {(Object.keys(SIZE_LABEL) as (keyof typeof SIZE_LABEL)[]).map((k) => (
              <option key={k} value={k}>
                {SIZE_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </figcaption>
    </figure>
  );
}
